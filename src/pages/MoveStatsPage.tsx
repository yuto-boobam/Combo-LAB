// src/pages/MoveStatsPage.tsx
// 技ごとの基礎数値（ダメージ・Dゲージ回収量・SAゲージ回収量・Dゲージ削り値）を入力する画面。
// 将来的な「補正込みでコンボのダメージ・ゲージ回収量を自動計算する」機能の足掛かり。
// この数値は技表を見ながらまとめて入力するもので、頻繁に変える想定がないため、
// メインのコンボ編集画面（ComboTreePage）とは独立させ、キャラ選択画面の各カードの
// 小さなボタンからのみ入る導線にしている。
//
// 一覧に並べる技は、通常技（commonMoves.ts）＋キャラ固有技（Character.moveList）の全部。
// 必殺技は強度（弱/中/強/OD）ごとにダメージ等が変わるため、MoveNamePicker で実際に
// 選べる「弱波動拳」のような強度込みの文字列に展開して1行ずつ表示する
// （moveStatsDatabase のキーもこの文字列と揃える）。
//
// 複数ヒット技（例: 三段技で200/200/400ダメージ）は「複数ヒット」にチェックを入れると
// 段ごとの数値を個別入力できる。コンボ中に何段目から何段目まで当たったかを選んで
// 該当区間の合計を自動計算する機能は別途（ノード側）実装する。
//
// 技データはComboTree等とは別に moveStatsDatabase（キャラID→技名→技データ）として持ち、
// キャラのコンボ保存とは独立して「全キャラぶんまとめて1ファイル」でバックアップできるように
// している（エクスポート/インポートはキャラ選択画面のHeaderの「バックアップ」メニューから行う）。
//
// この技データはビルドに同梱される共有の参照情報（src/data/moveStatsSeed.ts）で、
// ゲスト含む全ユーザーが最初から閲覧できる。編集はメンテナがローカル環境で
// npm run devした時だけ行える（詳細は src/utils/localEditAccess.ts 参照）。

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore, useVisibleCharacters } from '../store';
import Header from '../components/Header';
import AccordionSection from '../components/AccordionSection';
import type { CancelType, MoveHitStats, MoveStats, MoveStrength } from '../types';
import { NORMAL_MOVE_NAMES, SYSTEM_MOVE_NAMES } from '../data/commonMoves';
import { canEditMoveStatsLocally } from '../utils/localEditAccess';
import { deriveCancelableSuperArtNames } from '../utils/cancelType';
import { getSpecialVariantOptions } from '../utils/specialVariant';
import { calculateOdLevelConstraintForVariant } from '../utils/comboGaugeCalc';

const SPECIAL_MOVE_STRENGTHS: MoveStrength[] = ['弱', '中', '強', 'OD'];

// 「キャンセルの種類」ボタンは通常技・必殺技で選択肢が異なる（2026-08-27ユーザー指定）。
// 通常技は「全般/SAすべて」のような広いキャンセル先を、必殺技は「SA2以上/SA3のみ」の
// ようなSAレベル基準の狭いキャンセル先を選ぶ（実機のキャンセルルートの違いに合わせる）。
// 「一部の必殺」「不可」はどちらにも共通
const NORMAL_MOVE_CANCEL_TYPES: CancelType[] = ['全般', 'SAすべて', '一部の必殺', '不可'];
const SPECIAL_MOVE_CANCEL_TYPES: CancelType[] = ['SA2以上', 'SA3のみ', '一部の必殺', '不可'];

// 数値ではなく自由記述の文字列として保存するフィールド（modifierと有利フレームの2種）
const TEXT_HIT_FIELDS = new Set<keyof MoveHitStats>(['modifier', 'groundPlusFrame', 'airPlusFrame']);

const EMPTY_HIT: MoveHitStats = {
  damage: null,
  modifier: '',
  dGaugeGain: null,
  saGaugeGain: null,
  dGaugeChip: null,
  dGaugeChipPunishCounter: null,
  minDamageGuaranteePercent: null,
  dGaugeGainDuringRush: null,
  groundPlusFrame: '',
  airPlusFrame: '',
  cancelType: null,
};
const EMPTY_STATS: MoveStats = {
  isMultiHit: false,
  hits: [EMPTY_HIT],
  cancelableSuperArtNames: [],
  sharesModifierAcrossHits: false,
};

type SectionKey = 'normal' | 'special' | 'superArt' | 'system';

export function MoveStatsPage() {
  const isGuest = useAppStore((state) => state.isGuest);
  const characterId = useAppStore((state) => state.moveStatsCharacterId);
  const closeMoveStatsEditor = useAppStore((state) => state.closeMoveStatsEditor);
  const moveStatsDatabase = useAppStore((state) => state.moveStatsDatabase);
  const characters = useVisibleCharacters();
  const character = characters.find((item) => item.id === characterId);
  const readOnly = isGuest || !canEditMoveStatsLocally();

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    normal: true,
    special: false,
    superArt: false,
    system: false,
  });
  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // characterIdが不正（インポート直後の不整合等）な場合はキャラ選択に戻す
  if (!character) {
    closeMoveStatsEditor();
    return null;
  }

  const moveStats = moveStatsDatabase[character.id] ?? {};

  const uniqueMoves = character.moveList.filter((move) => move.category === 'unique');
  const specialMoves = character.moveList.filter((move) => move.category === 'special');
  const superArtMoves = character.moveList.filter((move) => move.category === 'superArt');

  const normalMoveNames = [...NORMAL_MOVE_NAMES, ...uniqueMoves.map((move) => move.name)];
  // 特殊性能あり（hasSpecialVariant）の技は、強度ごとに登録された選択肢を持つ場合だけ
  // 実際にノードで確定する名前（`${強度}${技名}(${特殊性能})`）ごとに1行ずつ並べる。
  // 選択肢がない強度は特殊性能なしのプレーンな1行のまま（src/utils/specialVariant.ts参照）。
  // hasFlatVariantsな技（イングリッドのビーム等、強度に依存しない技）は強度を挟まず
  // specialVariantOptionsを直接展開する（SAと同じ考え方）。さらに、Lv.を含む選択肢は
  // 「OD使用」時に別データを参照する仕組みになっているため、OD版の行もあわせて用意する
  // （src/utils/comboGaugeCalc.ts の applyOdVariantLookup 参照）。ただし最小Lv.は通常版
  // でしか、最大Lv.はOD版でしか実際には選べない（コンボ登録画面でボタンごと押せなく
  // なっている）ため、その組み合わせの行はそもそも作らない
  const specialMoveNames = specialMoves.flatMap((move) => {
    if (move.hasFlatVariants) {
      const options = move.specialVariantOptions ?? [];
      return options.flatMap((variant) => {
        const constraint = calculateOdLevelConstraintForVariant(variant, move);
        const rows: string[] = [];
        if (constraint !== 'odOnly') rows.push(`${move.name}(${variant})`);
        if (constraint === 'either' || constraint === 'odOnly') rows.push(`${move.name}(OD${variant})`);
        return rows;
      });
    }
    return SPECIAL_MOVE_STRENGTHS.flatMap((strength) => {
      const options = move.hasSpecialVariant ? getSpecialVariantOptions(move, strength) : [];
      return options.length > 0
        ? options.map((variant) => `${strength}${move.name}(${variant})`)
        : [`${strength}${move.name}`];
    });
  });
  const superArtMoveNames = superArtMoves.flatMap((move) =>
    move.hasSpecialVariant && move.specialVariantOptions && move.specialVariantOptions.length > 0
      ? move.specialVariantOptions.map((variant) => `${move.name}(${variant})`)
      : [move.name],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Header onLogoClick={closeMoveStatsEditor} title={`${character.name} の技データ`} character={character} />

      <main style={styles.main}>
        <div style={styles.list}>
          <p style={styles.hint}>
            コンボのダメージ・ゲージ回収量を将来自動計算するための、技ごとの基礎数値です。空欄のままでも他の機能には影響しません。
            エクスポート・インポートはキャラ選択画面の「バックアップ」から行えます。
            {!readOnly ? null : (
              <>
                {' '}
                {isGuest
                  ? '閲覧専用モードのため編集はできません。'
                  : 'この数値はローカル環境（npm run dev）でのみ編集できます。'}
              </>
            )}
          </p>

          <AccordionSection
            title="通常技・特殊技"
            icon="👊"
            count={normalMoveNames.length}
            isOpen={openSections.normal}
            onToggle={() => toggleSection('normal')}
          >
            <MoveStatsTable
              characterId={character.id}
              moveNames={normalMoveNames}
              moveStats={moveStats}
              readOnly={readOnly}
              cancelTypeOptions={NORMAL_MOVE_CANCEL_TYPES}
            />
          </AccordionSection>

          <AccordionSection
            title="必殺技"
            icon="🔥"
            count={specialMoveNames.length}
            isOpen={openSections.special}
            onToggle={() => toggleSection('special')}
          >
            {specialMoveNames.length > 0 ? (
              <MoveStatsTable
                characterId={character.id}
                moveNames={specialMoveNames}
                moveStats={moveStats}
                readOnly={readOnly}
                cancelTypeOptions={SPECIAL_MOVE_CANCEL_TYPES}
              />
            ) : (
              <p style={styles.emptyHint}>
                まだ必殺技が登録されていません。コンボ編集画面の技名選択欄から登録してください。
              </p>
            )}
          </AccordionSection>

          <AccordionSection
            title="SA"
            icon="⚡"
            count={superArtMoveNames.length}
            isOpen={openSections.superArt}
            onToggle={() => toggleSection('superArt')}
          >
            <MoveStatsTable
              characterId={character.id}
              moveNames={superArtMoveNames}
              moveStats={moveStats}
              readOnly={readOnly}
              lastChipColumnLabel="ヒット"
              showMinGuaranteeColumn
              showDuringRushColumn
              saGaugeColumnLabel="SAゲージ消費量"
            />
          </AccordionSection>

          <AccordionSection
            title="共通システム"
            icon="⚙️"
            count={SYSTEM_MOVE_NAMES.length}
            isOpen={openSections.system}
            onToggle={() => toggleSection('system')}
          >
            <MoveStatsTable
              characterId={character.id}
              moveNames={SYSTEM_MOVE_NAMES}
              moveStats={moveStats}
              readOnly={readOnly}
            />
          </AccordionSection>
        </div>
      </main>
    </div>
  );
}

function MoveStatsTable({
  characterId,
  moveNames,
  moveStats,
  readOnly,
  lastChipColumnLabel = 'パニカン',
  showMinGuaranteeColumn = false,
  showDuringRushColumn = false,
  saGaugeColumnLabel = 'SAゲージ回収',
  cancelTypeOptions = [],
}: {
  characterId: string;
  moveNames: string[];
  moveStats: Record<string, MoveStats>;
  readOnly: boolean;
  // SAはパニッシュカウンターで数値が変わらず「ヒット時」の削り値の方が意味を持つため、
  // 最後の削り列のラベルだけ呼び出し元(superArtセクション)で差し替えられるようにする
  lastChipColumnLabel?: string;
  // 「最低保証値」列はコンボ補正で減っても割合を下回らないSA特有の値のため、
  // superArtセクションだけ表示する
  showMinGuaranteeColumn?: boolean;
  // 「Dゲージ回復（ラッシュ中）」列は、キャンセルラッシュ中だけ回復量が変わるSA特有の値のため、
  // superArtセクションだけ表示する
  showDuringRushColumn?: boolean;
  // SA自身は撃つとSAゲージを「消費」する（他の技のようにヒットで「回収」するわけではない）ため、
  // superArtセクションだけラベルを差し替えられるようにする
  saGaugeColumnLabel?: string;
  // 「キャンセルの種類」欄（段ごと）に出す選択肢。空配列（省略時）なら欄自体を出さない。
  // SA自身からSAへのキャンセルは無いため、superArt/systemセクションでは渡さない。
  // 通常技/必殺技で選択肢の中身が異なる（呼び出し側がNORMAL_MOVE_CANCEL_TYPES /
  // SPECIAL_MOVE_CANCEL_TYPESのどちらかを渡す。2026-08-27ユーザー指定）
  cancelTypeOptions?: CancelType[];
}) {
  const setMoveStats = useAppStore((state) => state.setMoveStats);

  const toggleMultiHit = (moveName: string) => {
    const current = moveStats[moveName] ?? EMPTY_STATS;
    setMoveStats(
      characterId,
      moveName,
      current.isMultiHit
        ? { ...current, isMultiHit: false, hits: [current.hits[0] ?? EMPTY_HIT] }
        : { ...current, isMultiHit: true, hits: [current.hits[0] ?? EMPTY_HIT, EMPTY_HIT] },
    );
  };

  const toggleSharesModifierAcrossHits = (moveName: string) => {
    const current = moveStats[moveName] ?? EMPTY_STATS;
    setMoveStats(characterId, moveName, {
      ...current,
      sharesModifierAcrossHits: !current.sharesModifierAcrossHits,
    });
  };

  // この段（複数ヒット技なら段ごと、単発技ならhits[0]）でのキャンセルの種類を選ぶ
  // （同じ種類をもう一度押すと選択解除。2段技で両方の段が別々の種類を持てる）。
  // 「全般」「SAすべて」「SA2以上」「SA3のみ」のいずれかが1段でもあれば、技全体を
  // SA3(・CA)へキャンセル可能とみなしcancelableSuperArtNamesへ自動反映する
  // （末端ノードの「SAで締める」機能はSA3のみを対象とする運用のため、個別にSA名を
  // 選ばせる手動UIは廃止した。2026-08-26ユーザー指定）
  const setHitCancelType = (moveName: string, hitIndex: number, cancelType: CancelType) => {
    const current = moveStats[moveName] ?? EMPTY_STATS;
    const nextHits = current.hits.map((hit, index) =>
      index === hitIndex
        ? { ...hit, cancelType: hit.cancelType === cancelType ? null : cancelType }
        : hit,
    );
    setMoveStats(characterId, moveName, {
      ...current,
      hits: nextHits,
      cancelableSuperArtNames: deriveCancelableSuperArtNames(nextHits),
    });
  };

  const updateHitField = (
    moveName: string,
    hitIndex: number,
    field: keyof MoveHitStats,
    rawValue: string,
  ) => {
    const current = moveStats[moveName] ?? EMPTY_STATS;
    const value = TEXT_HIT_FIELDS.has(field) ? rawValue : rawValue === '' ? null : Number(rawValue);
    setMoveStats(characterId, moveName, {
      ...current,
      hits: current.hits.map((hit, index) => (index === hitIndex ? { ...hit, [field]: value } : hit)),
    });
  };

  const addHit = (moveName: string) => {
    const current = moveStats[moveName] ?? EMPTY_STATS;
    setMoveStats(characterId, moveName, { ...current, hits: [...current.hits, EMPTY_HIT] });
  };

  const removeHit = (moveName: string, hitIndex: number) => {
    const current = moveStats[moveName] ?? EMPTY_STATS;
    if (current.hits.length <= 1) return; // 最低1段は残す
    setMoveStats(characterId, moveName, {
      ...current,
      hits: current.hits.filter((_, index) => index !== hitIndex),
    });
  };

  const extraColumnCount = [showMinGuaranteeColumn, showDuringRushColumn].filter(Boolean).length;
  // repeat(0, ...)はCSS的に不正な値になり、grid-template-columns全体が無視されて
  // レイアウトが崩れる（全項目が縦積みになる）ため、0件の時は丸ごと省略する
  const extraColumnsTemplate = extraColumnCount > 0 ? ` repeat(${extraColumnCount}, 84px)` : '';
  const rowGridStyle = {
    ...styles.hitRow,
    gridTemplateColumns: `54px 84px minmax(120px, 1fr) repeat(6, 84px)${extraColumnsTemplate} 20px`,
  };

  return (
    <div style={styles.moveList}>
      <div style={{ ...rowGridStyle, ...styles.headerRow }}>
        <span style={styles.hitLabelCell} />
        <span style={styles.numHeaderCell}>ダメージ</span>
        <span style={styles.modHeaderCell}>補正</span>
        <span style={styles.numHeaderCell}>Dゲージ回復<br />（ヒット）</span>
        <span style={styles.numHeaderCell}>{saGaugeColumnLabel}</span>
        <span style={styles.numHeaderCell}>Dゲージ削り<br />（ガード）</span>
        <span style={styles.numHeaderCell}>Dゲージ削り<br />（{lastChipColumnLabel}）</span>
        <span style={styles.numHeaderCell}>有利フレーム<br />（地上ヒット）</span>
        <span style={styles.numHeaderCell}>有利フレーム<br />（空中ヒット）</span>
        {showMinGuaranteeColumn && (
          <span style={styles.numHeaderCell}>最低保証値<br />（%）</span>
        )}
        {showDuringRushColumn && (
          <span style={styles.numHeaderCell}>Dゲージ回復<br />（ラッシュ中）</span>
        )}
        <span style={styles.hitRemoveCell} />
      </div>

      {moveNames.map((moveName) => {
        const stats = moveStats[moveName] ?? EMPTY_STATS;

        return (
          <div key={moveName} style={styles.moveBlock}>
            <div style={styles.moveHeaderRow}>
              <span style={styles.nameCell}>{moveName}</span>
              <label style={styles.multiHitLabel}>
                <input
                  type="checkbox"
                  checked={stats.isMultiHit}
                  disabled={readOnly}
                  onChange={() => toggleMultiHit(moveName)}
                />
                複数ヒット
              </label>

              {stats.isMultiHit && (
                <label style={styles.multiHitLabel} title="同じ技が複数回ヒットしているだけの場合はオン（強Kの1・2段目等）。別々の技を繋いだターゲットコンボの場合はオフのまま">
                  <input
                    type="checkbox"
                    checked={stats.sharesModifierAcrossHits}
                    disabled={readOnly}
                    onChange={() => toggleSharesModifierAcrossHits(moveName)}
                  />
                  段ごとに補正を分けない
                </label>
              )}
            </div>

            {stats.isMultiHit ? (
              <div style={styles.hitsBlock}>
                {stats.hits.map((hit, index) => (
                  <div key={index} style={styles.hitBlock}>
                    {cancelTypeOptions.length > 0 && (
                      <CancelTypeButtons
                        label={`${index + 1}段目のキャンセルの種類`}
                        options={cancelTypeOptions}
                        value={hit.cancelType}
                        readOnly={readOnly}
                        onSelect={(cancelType) => setHitCancelType(moveName, index, cancelType)}
                      />
                    )}

                    <div style={rowGridStyle}>
                      <span style={styles.hitLabelCell}>{index + 1}段目</span>
                      <HitFields
                        hit={hit}
                        hitIndex={index}
                        sharesModifierAcrossHits={stats.sharesModifierAcrossHits}
                        readOnly={readOnly}
                        showMinGuaranteeColumn={showMinGuaranteeColumn}
                        showDuringRushColumn={showDuringRushColumn}
                        onChange={(field, value) => updateHitField(moveName, index, field, value)}
                      />
                      <span style={styles.hitRemoveCell}>
                        <button
                          type="button"
                          title="この段を削除"
                          style={styles.hitRemoveButton}
                          disabled={readOnly || stats.hits.length <= 1}
                          onClick={() => removeHit(moveName, index)}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="btn-ghost"
                  style={styles.addHitButton}
                  disabled={readOnly}
                  onClick={() => addHit(moveName)}
                >
                  ＋ 段を追加
                </button>
              </div>
            ) : (
              <div style={styles.hitBlock}>
                {cancelTypeOptions.length > 0 && (
                  <CancelTypeButtons
                    label="キャンセルの種類"
                    options={cancelTypeOptions}
                    value={stats.hits[0]?.cancelType ?? null}
                    readOnly={readOnly}
                    onSelect={(cancelType) => setHitCancelType(moveName, 0, cancelType)}
                  />
                )}

                <div style={rowGridStyle}>
                  <span style={styles.hitLabelCell} />
                  <HitFields
                    hit={stats.hits[0] ?? EMPTY_HIT}
                    hitIndex={0}
                    sharesModifierAcrossHits={stats.sharesModifierAcrossHits}
                    readOnly={readOnly}
                    showMinGuaranteeColumn={showMinGuaranteeColumn}
                    showDuringRushColumn={showDuringRushColumn}
                    onChange={(field, value) => updateHitField(moveName, 0, field, value)}
                  />
                  <span style={styles.hitRemoveCell} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// この段（複数ヒット技は段ごと、単発技は1回）のキャンセルの種類を選ぶ。選択肢は
// 呼び出し側から渡す（通常技/必殺技で内容が異なるため。2026-08-27ユーザー指定）。
// もう一度同じボタンを押すと選択解除（他のトグルボタン群と同じ考え方）
function CancelTypeButtons({
  label,
  options,
  value,
  readOnly,
  onSelect,
}: {
  label: string;
  options: CancelType[];
  value: CancelType | null;
  readOnly: boolean;
  onSelect: (cancelType: CancelType) => void;
}) {
  return (
    <div style={styles.cancelRow}>
      <span style={styles.cancelRowLabel}>{label}</span>
      {options.map((cancelType) => {
        const active = value === cancelType;
        return (
          <button
            key={cancelType}
            type="button"
            disabled={readOnly}
            onClick={() => onSelect(cancelType)}
            style={{
              ...styles.cancelPill,
              borderColor: active ? 'var(--accent)' : 'var(--border)',
              background: active ? 'var(--accent)' : 'var(--bg-elevated)',
              color: active ? '#fff' : 'var(--text-secondary)',
              cursor: readOnly ? 'default' : 'pointer',
            }}
          >
            {cancelType}
          </button>
        );
      })}
    </div>
  );
}

// damageModifierCalc.tsの計算上、この段の補正欄に書いても無視される補正の種類を
// 判定する。canBeComboStarter=false（2段目以降）の段では「始動補正」は常に無視される
// （コンボ全体の1発目にしかなり得ないため）。さらにsharesModifierAcrossHits=true
// （「段ごとに補正を分けない」＝強Kの2段目等）の非1段目は、標準テーブルの段を進めない
// （advanceを呼ばない）ため「即時補正」以外（始動補正/コンボ補正/乗算補正）が丸ごと
// 無視される（damageModifierCalc.tsのsharesTableStepWithPreviousの早期returnを参照）。
// 「多重にかかってしまわないか」というユーザー懸念への回答＝多重適用にはならず、単に
// 無視されるだけだが、それはそれで気づきにくいため入力欄側で警告する
// （2026-08-27ユーザー指定）
const NON_STARTER_INEFFECTIVE_KEYWORDS = ['始動補正'];
const SHARED_NON_FIRST_HIT_INEFFECTIVE_KEYWORDS = ['始動補正', 'コンボ補正', '乗算補正'];

function HitFields({
  hit,
  hitIndex,
  sharesModifierAcrossHits,
  readOnly,
  showMinGuaranteeColumn = false,
  showDuringRushColumn = false,
  onChange,
}: {
  hit: MoveHitStats;
  // このHitFieldsが技の何段目か（0始まり）
  hitIndex: number;
  // 呼び出し元の技のMoveStats.sharesModifierAcrossHits（「段ごとに補正を分けない」）
  sharesModifierAcrossHits: boolean;
  readOnly: boolean;
  showMinGuaranteeColumn?: boolean;
  showDuringRushColumn?: boolean;
  onChange: (field: keyof MoveHitStats, rawValue: string) => void;
}) {
  const canBeComboStarter = hitIndex === 0;
  const isSharedNonFirstHit = sharesModifierAcrossHits && !canBeComboStarter;
  const ineffectiveKeywords = canBeComboStarter
    ? []
    : isSharedNonFirstHit
      ? SHARED_NON_FIRST_HIT_INEFFECTIVE_KEYWORDS
      : NON_STARTER_INEFFECTIVE_KEYWORDS;
  const hasIneffectiveModifier = ineffectiveKeywords.some((keyword) => hit.modifier.includes(keyword));
  const modifierPlaceholder = canBeComboStarter
    ? '始動補正20%＋コンボ補正20% など'
    : isSharedNonFirstHit
      ? '即時補正10% など'
      : 'コンボ補正20% など';
  const modifierWarningTitle = !hasIneffectiveModifier
    ? undefined
    : isSharedNonFirstHit
      ? '「段ごとに補正を分けない」がオンのため、この段では「即時補正」以外（始動補正・コンボ補正・乗算補正）は計算に反映されません（1段目の補正だけがコンボ全体の計算に使われます）'
      : 'この段はコンボ全体の1発目にはなり得ないため、「始動補正」を書いても計算には反映されません（1段目の欄でだけ意味を持ちます）';
  // cancelTypeのような文字列/オブジェクト項目を誤ってinputのvalueへ渡さないよう、数値項目だけに絞った型にする
  type NumericHitField = Extract<
    keyof MoveHitStats,
    'dGaugeGain' | 'saGaugeGain' | 'dGaugeChip' | 'dGaugeChipPunishCounter' | 'minDamageGuaranteePercent' | 'dGaugeGainDuringRush'
  >;
  const baseNumberFields: { key: NumericHitField }[] = [
    { key: 'dGaugeGain' },
    { key: 'saGaugeGain' },
    { key: 'dGaugeChip' },
    { key: 'dGaugeChipPunishCounter' },
  ];
  const extraNumberFields: { key: NumericHitField }[] = [
    ...(showMinGuaranteeColumn ? [{ key: 'minDamageGuaranteePercent' as const }] : []),
    ...(showDuringRushColumn ? [{ key: 'dGaugeGainDuringRush' as const }] : []),
  ];
  // 有利フレームは単一値・幅のある表記（例:「+2~+4」）のどちらも自由記述で入力する
  // （modifierと同じ考え方。詳細はtypes.tsのMoveHitStats.groundPlusFrame参照）
  const plusFrameFields: { key: 'groundPlusFrame' | 'airPlusFrame' }[] = [
    { key: 'groundPlusFrame' },
    { key: 'airPlusFrame' },
  ];

  return (
    <>
      <input
        type="number"
        className="input-field"
        style={styles.numInput}
        value={hit.damage ?? ''}
        readOnly={readOnly}
        onChange={(event) => onChange('damage', event.target.value)}
      />
      <input
        type="text"
        className="input-field"
        style={{
          ...styles.modInput,
          ...(hasIneffectiveModifier ? styles.modInputWarning : null),
        }}
        placeholder={modifierPlaceholder}
        title={modifierWarningTitle}
        value={hit.modifier}
        readOnly={readOnly}
        onChange={(event) => onChange('modifier', event.target.value)}
      />
      {baseNumberFields.map(({ key }) => (
        <input
          key={key}
          type="number"
          className="input-field"
          style={styles.numInput}
          value={hit[key] ?? ''}
          readOnly={readOnly}
          onChange={(event) => onChange(key, event.target.value)}
        />
      ))}
      {plusFrameFields.map(({ key }) => (
        <input
          key={key}
          type="text"
          className="input-field"
          style={styles.numInput}
          placeholder="+2~+4 など"
          value={hit[key]}
          readOnly={readOnly}
          onChange={(event) => onChange(key, event.target.value)}
        />
      ))}
      {extraNumberFields.map(({ key }) => (
        <input
          key={key}
          type="number"
          className="input-field"
          style={styles.numInput}
          value={hit[key] ?? ''}
          readOnly={readOnly}
          onChange={(event) => onChange(key, event.target.value)}
        />
      ))}
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    flex: '1 1 auto',
    minHeight: 0,
    overflow: 'auto',
    padding: 16,
    display: 'flex',
    justifyContent: 'center',
  },
  list: {
    width: '100%',
    maxWidth: 780,
    display: 'grid',
    gap: 10,
    alignContent: 'start',
  },
  hint: {
    fontSize: 12,
    lineHeight: 1.6,
    color: 'var(--text-muted)',
    margin: 0,
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolbarButton: {
    fontSize: 12,
  },
  emptyHint: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  moveList: {
    display: 'grid',
    gap: 10,
  },
  moveBlock: {
    display: 'grid',
    gap: 4,
  },
  moveHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nameCell: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  multiHitLabel: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  cancelRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  cancelRowLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--text-muted)',
    marginRight: 2,
  },
  cancelPill: {
    height: 20,
    padding: '0 8px',
    borderRadius: 999,
    border: '1.5px solid var(--border)',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
  },
  hitsBlock: {
    display: 'grid',
    gap: 4,
    paddingLeft: 10,
    borderLeft: '2px solid var(--border)',
  },
  hitBlock: {
    display: 'grid',
    gap: 2,
  },
  hitRow: {
    display: 'grid',
    gridTemplateColumns: '54px 84px minmax(120px, 1fr) repeat(4, 84px) 20px',
    gap: 6,
    alignItems: 'center',
  },
  // 見出し行。下にスクロールしてもその技セクション（通常技・必殺技など、MoveStatsTable
  // 1個分＝moveList）の中に留まる間だけ追従する。position:stickyは自分の親要素（moveList）
  // の範囲を超えては留まれない性質があるため、セクションをまたいだ瞬間に自然に手放され、
  // 次のセクション自身の見出し行に引き継がれる（JS不要。2026-08-27ユーザー指定）
  headerRow: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: 'var(--bg-elevated)',
    paddingTop: 4,
    paddingBottom: 4,
  },
  hitLabelCell: {
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--text-muted)',
  },
  hitRemoveCell: {
    display: 'flex',
    justifyContent: 'center',
  },
  hitRemoveButton: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    fontSize: 10,
    lineHeight: 1,
    cursor: 'pointer',
  },
  addHitButton: {
    justifySelf: 'start',
    fontSize: 11,
    padding: '4px 10px',
  },
  numHeaderCell: {
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },
  modHeaderCell: {
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--text-secondary)',
    textAlign: 'left',
  },
  modInput: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 12,
    padding: '5px 6px',
  },
  // 1段目以外の欄に「始動補正」を書いても計算に反映されないことを視覚的に警告する
  // （2026-08-27ユーザー指定）
  modInputWarning: {
    borderColor: 'var(--accent-amber-border)',
    background: 'var(--accent-amber-bg)',
  },
  numInput: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 12,
    padding: '5px 6px',
    textAlign: 'center',
  },
};
