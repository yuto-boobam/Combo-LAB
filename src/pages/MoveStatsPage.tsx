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
import type { MoveHitStats, MoveStats, MoveStrength } from '../types';
import { NORMAL_MOVE_NAMES, SYSTEM_MOVE_NAMES } from '../data/commonMoves';
import { canEditMoveStatsLocally } from '../utils/localEditAccess';
import { getSpecialVariantOptions } from '../utils/specialVariant';

const SPECIAL_MOVE_STRENGTHS: MoveStrength[] = ['弱', '中', '強', 'OD'];

const EMPTY_HIT: MoveHitStats = {
  damage: null,
  modifier: '',
  dGaugeGain: null,
  saGaugeGain: null,
  dGaugeChip: null,
  dGaugeChipPunishCounter: null,
  minDamageGuaranteePercent: null,
};
const EMPTY_STATS: MoveStats = { isMultiHit: false, hits: [EMPTY_HIT] };

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
  // 選択肢がない強度は特殊性能なしのプレーンな1行のまま（src/utils/specialVariant.ts参照）
  const specialMoveNames = specialMoves.flatMap((move) =>
    SPECIAL_MOVE_STRENGTHS.flatMap((strength) => {
      const options = move.hasSpecialVariant ? getSpecialVariantOptions(move, strength) : [];
      return options.length > 0
        ? options.map((variant) => `${strength}${move.name}(${variant})`)
        : [`${strength}${move.name}`];
    }),
  );
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
}) {
  const setMoveStats = useAppStore((state) => state.setMoveStats);

  const toggleMultiHit = (moveName: string) => {
    const current = moveStats[moveName] ?? EMPTY_STATS;
    setMoveStats(
      characterId,
      moveName,
      current.isMultiHit
        ? { isMultiHit: false, hits: [current.hits[0] ?? EMPTY_HIT] }
        : { isMultiHit: true, hits: [current.hits[0] ?? EMPTY_HIT, EMPTY_HIT] },
    );
  };

  const updateHitField = (
    moveName: string,
    hitIndex: number,
    field: keyof MoveHitStats,
    rawValue: string,
  ) => {
    const current = moveStats[moveName] ?? EMPTY_STATS;
    const value = field === 'modifier' ? rawValue : rawValue === '' ? null : Number(rawValue);
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

  const rowGridStyle = showMinGuaranteeColumn
    ? { ...styles.hitRow, gridTemplateColumns: '54px 84px minmax(120px, 1fr) repeat(5, 84px) 20px' }
    : styles.hitRow;

  return (
    <div style={styles.moveList}>
      <div style={{ ...rowGridStyle, ...styles.headerRow }}>
        <span style={styles.hitLabelCell} />
        <span style={styles.numHeaderCell}>ダメージ</span>
        <span style={styles.modHeaderCell}>補正</span>
        <span style={styles.numHeaderCell}>Dゲージ回復量</span>
        <span style={styles.numHeaderCell}>SAゲージ回収</span>
        <span style={styles.numHeaderCell}>Dゲージ削り<br />（ガード）</span>
        <span style={styles.numHeaderCell}>Dゲージ削り<br />（{lastChipColumnLabel}）</span>
        {showMinGuaranteeColumn && (
          <span style={styles.numHeaderCell}>最低保証値<br />（%）</span>
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
            </div>

            {stats.isMultiHit ? (
              <div style={styles.hitsBlock}>
                {stats.hits.map((hit, index) => (
                  <div key={index} style={rowGridStyle}>
                    <span style={styles.hitLabelCell}>{index + 1}段目</span>
                    <HitFields
                      hit={hit}
                      readOnly={readOnly}
                      showMinGuaranteeColumn={showMinGuaranteeColumn}
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
              <div style={rowGridStyle}>
                <span style={styles.hitLabelCell} />
                <HitFields
                  hit={stats.hits[0] ?? EMPTY_HIT}
                  readOnly={readOnly}
                  showMinGuaranteeColumn={showMinGuaranteeColumn}
                  onChange={(field, value) => updateHitField(moveName, 0, field, value)}
                />
                <span style={styles.hitRemoveCell} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HitFields({
  hit,
  readOnly,
  showMinGuaranteeColumn = false,
  onChange,
}: {
  hit: MoveHitStats;
  readOnly: boolean;
  showMinGuaranteeColumn?: boolean;
  onChange: (field: keyof MoveHitStats, rawValue: string) => void;
}) {
  const numberFields: { key: keyof MoveHitStats }[] = [
    { key: 'dGaugeGain' },
    { key: 'saGaugeGain' },
    { key: 'dGaugeChip' },
    { key: 'dGaugeChipPunishCounter' },
    ...(showMinGuaranteeColumn ? [{ key: 'minDamageGuaranteePercent' as const }] : []),
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
        style={styles.modInput}
        placeholder="始動補正20% など"
        value={hit.modifier}
        readOnly={readOnly}
        onChange={(event) => onChange('modifier', event.target.value)}
      />
      {numberFields.map(({ key }) => (
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
  hitsBlock: {
    display: 'grid',
    gap: 4,
    paddingLeft: 10,
    borderLeft: '2px solid var(--border)',
  },
  hitRow: {
    display: 'grid',
    gridTemplateColumns: '54px 84px minmax(120px, 1fr) repeat(4, 84px) 20px',
    gap: 6,
    alignItems: 'center',
  },
  headerRow: {
    paddingBottom: 2,
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
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  modHeaderCell: {
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--text-muted)',
    textAlign: 'left',
  },
  modInput: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 12,
    padding: '5px 6px',
  },
  numInput: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 12,
    padding: '5px 6px',
    textAlign: 'center',
  },
};
