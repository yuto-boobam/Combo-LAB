// src/components/combo/BranchStatsEditor.tsx
// 枝（コンボ）の統計情報の編集UI。葉ノード、またはガード/空振り属性を持つノードで使う
// （表示するかどうかの判断は呼び出し側で行う。src/components/combo/SideDrawerPanel.tsx を参照）。

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BranchStartHitCondition, ComboBranchStats, Rating5 } from '../../types';
import type { DamageBreakdown, GaugeStep, OdLevelConstraint } from '../../utils/comboGaugeCalc';
import { DEFAULT_BRANCH_STATS } from '../../utils/branchStatsDefaults';
import { parsePlusFrameRange } from '../../utils/plusFrameRange';
import { OdLevelToggle } from './OdLevelToggle';

export type OdUsageOnPath = {
  nodeId: string;
  label: string;
  constraint: OdLevelConstraint;
  usesOD: boolean;
};

type Props = {
  value: ComboBranchStats | null;
  onChange: (next: ComboBranchStats | null) => void;
  readOnly?: boolean;
  // root〜このノードの経路上にある「カウンター」「パニッシュカウンター」属性から求まる、
  // この枝が繋がるために最低限必要な始動条件（例:「カウンター以上でないと繋がらない」
  // ノードが経路上にあれば'カウンター'）。null = 制約なし
  requiredStartHitCondition?: BranchStartHitCondition | null;
  // ダメージ計算式の内訳。「計算式」ボタンを押した時だけ展開して見せる
  // （普段は閉じておく。2026-08-26ユーザー指定：計算根拠を見せる正式な機能として採用）
  damageBreakdown?: DamageBreakdown | null;
  // 誘導ガイド（チュートリアル用）: trueの間、「ダメージ・計算式」欄をスポットライトで
  // 光らせ、「計算式」を開くよう誘導する（このコンポーネント自身はチュートリアルの
  // 手順を知らず、呼び出し側が段階を判断してここへ渡すだけ。highlightComboInfoと同じ考え方）
  highlightDamageFormula?: boolean;
  onFormulaOpened?: () => void;
  // trueの間、計算式を開いた時に「ストリートファイター6と同じ補正でダメージを計算」の
  // 一言を添える（チュートリアルキャラクター限定。2026-08-27ユーザー指定）
  showFormulaExplanation?: boolean;
  // Dゲージ増減欄の「合計⇄内訳」表示切替用。1ノードずつの増減（例:「+200→+200→-20000」）。
  // ダメージ/Dゲージ削り量/Dゲージ増減/SAゲージ増加の各欄は、未入力の間だけ呼び出し側
  // （SideDrawerPanel.tsx）が自動計算値でそのまま埋めるため、このコンポーネント側は
  // 「自動計算：X」「この値を使う」のような案内は持たない（2026-08-26ユーザー指定：
  // 自動で埋めて、間違っていたら直接修正する運用に統一）。totalExcludingEarlyRecoveryは
  // 「最初にゲージを消費する技より前の回復」を除いた場合の参考値。totalと異なる時だけ、
  // 合計欄に「-25500(-27500)」のように括弧書きで併記する
  dGaugeBreakdown?: { steps: GaugeStep[]; total: number; totalExcludingEarlyRecovery: number } | null;
  // SAゲージ増加欄の「合計⇄内訳」表示切替用。dGaugeBreakdownと同じ考え方（早期回復の概念が
  // 無いためtotalExcludingEarlyRecoveryは持たない）
  saGaugeBreakdown?: { steps: GaugeStep[]; total: number } | null;
  // このコンボを最後まで遂行するために最低限必要な開始時Dゲージ量。SF6は「ゲージが0でなければ
  // 消費行動を発動できる」仕様（名目コストを満額持っている必要はない）のため、単純な消費量の
  // 合計ではなくシミュレーションで求めた値（詳細はcomboGaugeCalc.tsのcalculateBranchDGaugeMinimumRequired
  // 参照）。0＝消費行動が経路上に無い、null＝技データ未登録
  dGaugeMinimumRequired?: number | null;
  // このノードがSA(superArt・特殊性能あり)で、まだ特殊性能を選ばず技名だけ（例:「SA1」）
  // で置かれている場合のみ渡される。渡された場合、このコンポーネントは「使用した特殊性能」を
  // 選ばせるUIを表示し、finishingSpecialVariantに保存する（呼び出し側の判定はSideDrawerPanel参照）
  finishingSuperArtMove?: { name: string; specialVariantOptions: string[] } | null;
  // このキャラに登録済みの、特殊性能なしの単純なSAの名前一覧。1件以上あれば「このノードの
  // 直後にSAへ繋いで終わる」場合の選択肢として表示する（木にSAのノードを追加しなくても
  // ダメージ・ゲージ計算に反映できるようにする機能。finishingSuperArtMoveと同時には
  // 出さない：このノード自身が既にSAである場合は対象外のため）
  finishingSuperArtOptions?: string[];
  // root〜このノードの経路上にある「OD版はレベル+1相当の性能になる」技（ビーム等）の一覧。
  // 末端ノードの「コンボの情報」欄から、経路の途中にあるノードのOD使用もまとめて確認・
  // 変更できるようにする（選択中のノードを1つずつ辿らなくても、最終的なゲージを見ている
  // 画面から直接調整できるようにしてほしい、というユーザー要望）
  odUsagesOnPath?: OdUsageOnPath[];
  onChangeOdUsage?: (nodeId: string, next: boolean) => void;
  // このノードの技（複数ヒット技は最終段）に登録済みの有利フレーム（自由記述）。
  // プラスフレーム欄の「地上/空中」トグルで参照・選択できるようにする。未登録/技データ
  // 未参照の場合は空文字または未指定
  groundPlusFrame?: string;
  airPlusFrame?: string;
  // trueの間、未入力（null/false/未選択）の項目は表示自体を省く。実際の編集画面では
  // 「空の入力欄が編集入り口になる」ため常にfalseで使うが、チュートリアルキャラクターの
  // 「コンボの情報」欄は初見の情報量を減らす目的で使う（呼び出し側のSideDrawerPanel.tsxが
  // characterIdで判定して渡す。2026-08-27ユーザー指定）
  hideEmptyFields?: boolean;
};

// 「通常」ボタンは出さない（カウンター/パニカンをどちらもオフにすれば同じ状態に戻せるため）。
// パニカンは表示スペースが空いた分、フルの「パニッシュカウンター」表記にする
const START_HIT_CONDITIONS: BranchStartHitCondition[] = ['カウンター', 'パニカン'];

const START_HIT_CONDITION_LABELS: Record<BranchStartHitCondition, string> = {
  通常: '通常',
  カウンター: 'カウンター',
  パニカン: 'パニッシュカウンター',
};

const START_HIT_CONDITION_RANK: Record<BranchStartHitCondition, number> = {
  通常: 0,
  カウンター: 1,
  パニカン: 2,
};

export function BranchStatsEditor({
  value,
  onChange,
  readOnly = false,
  requiredStartHitCondition = null,
  damageBreakdown = null,
  highlightDamageFormula = false,
  onFormulaOpened,
  showFormulaExplanation = false,
  dGaugeBreakdown = null,
  saGaugeBreakdown = null,
  dGaugeMinimumRequired = null,
  finishingSuperArtMove = null,
  finishingSuperArtOptions = [],
  odUsagesOnPath = [],
  onChangeOdUsage,
  groundPlusFrame = '',
  airPlusFrame = '',
  hideEmptyFields = false,
}: Props) {
  const stats = value ?? DEFAULT_BRANCH_STATS;
  // 計算式の内訳は普段は閉じておき、興味を持った人がボタンを押した時だけ見せる
  const [isFormulaOpen, setIsFormulaOpen] = useState(false);
  // Dゲージ増減／SAゲージ増加欄の表示モード。falseは合計（従来通りの編集可能な数値入力）、
  // trueは1ノードずつの内訳（読み取り専用のテキスト表示に切り替わる）
  const [isDGaugeBreakdownMode, setIsDGaugeBreakdownMode] = useState(false);
  const [isSaGaugeBreakdownMode, setIsSaGaugeBreakdownMode] = useState(false);

  const update = (patch: Partial<ComboBranchStats>) => {
    onChange({ ...stats, ...patch });
  };

  // 始動条件・SA締めのように、この枝のダメージ・ゲージ計算の前提そのものを変える変更は、
  // ダメージ/Dゲージ削り量/Dゲージ増減/SAゲージ増加の4欄も明示的に未入力（null）へ戻す。
  // これらの欄は「未入力の間だけ自動計算値で埋まる」仕様（SideDrawerPanel.tsx参照）なので、
  // ここでnullに戻すことで新しい前提での自動計算値が改めて反映される。すでに手動で入力
  // していた値もここでリセット対象になる点は、前提が変わった以上その値自体の根拠も
  // 変わっているため妥当（2026-08-28ユーザー報告：カウンター/SA締めを変えてもダメージ欄が
  // 追従しない不具合の修正）
  const updateAndResetAutoFields = (patch: Partial<ComboBranchStats>) => {
    onChange({
      ...stats,
      ...patch,
      damage: null,
      opponentDGaugeChip: null,
      dGaugeChange: null,
      saGaugeGain: null,
    });
  };

  // ジャストパリィ始動は常にパニッシュカウンター始動を伴う（実機仕様、パニッシュカウンターの
  // トグルとは別にオン/オフできるが、始動条件としては常に「パニッシュカウンター以上」を要求する）
  const justParryRequiredCondition: BranchStartHitCondition | null = stats.isJustParryStart
    ? 'パニカン'
    : null;

  // 経路上に「カウンター以上でないと繋がらない」ノードがある場合、およびジャストパリィ始動の
  // 場合、始動条件はそれ以上でなければならない（両方あればランクが高い方を採用）。
  // 手動入力がまだそれを満たしていなければ表示・実データの両方を自動で引き上げる
  // （「通常」を選べる状態のまま放置されないようにするための仕様。ユーザー確認済み）
  const effectiveRequiredCondition: BranchStartHitCondition | null =
    !requiredStartHitCondition
      ? justParryRequiredCondition
      : !justParryRequiredCondition
        ? requiredStartHitCondition
        : START_HIT_CONDITION_RANK[requiredStartHitCondition] >=
            START_HIT_CONDITION_RANK[justParryRequiredCondition]
          ? requiredStartHitCondition
          : justParryRequiredCondition;

  const satisfiesRequirement =
    !effectiveRequiredCondition ||
    (stats.startHitCondition !== null &&
      START_HIT_CONDITION_RANK[stats.startHitCondition] >= START_HIT_CONDITION_RANK[effectiveRequiredCondition]);
  const effectiveStartHitCondition = satisfiesRequirement
    ? stats.startHitCondition
    : effectiveRequiredCondition;

  useEffect(() => {
    if (readOnly || satisfiesRequirement || !effectiveRequiredCondition) return;
    updateAndResetAutoFields({ startHitCondition: effectiveRequiredCondition });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, satisfiesRequirement, effectiveRequiredCondition]);

  // hideEmptyFields時、各セクションを「未入力なら畳む」判定。実際の編集画面では
  // 常にfalse相当（空欄も編集の入り口として必要）なので通常は全て表示される
  const showPlusFrameSection =
    !hideEmptyFields ||
    stats.plusFrame !== null ||
    stats.opponentDGaugeChip !== null ||
    stats.plusFrameHitType !== null;
  const showRatingGrid =
    !hideEmptyFields ||
    [stats.damageRating, stats.dGaugeRating, stats.saGaugeRating, stats.carryRating].some(
      (rating) => rating !== null,
    );
  const showOverallRating = !hideEmptyFields || stats.overallRating !== null;
  const showThrowRange = !hideEmptyFields || stats.isThrowRange;
  const showOkizeme = !hideEmptyFields || stats.canOkizeme;
  const showStartCondition =
    !hideEmptyFields ||
    stats.startHitCondition !== null ||
    stats.isJustParryStart ||
    !!requiredStartHitCondition;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* コンボ/グループの締めのノード（このコンポーネント自体がそこにしか表示されない）を
          お気に入り登録できるようにする。評価項目ではなく単独の目印なので、一番目立つ
          最上部に置く（ユーザー要望） */}
      <button
        type="button"
        onClick={() => update({ isFavorite: !stats.isFavorite })}
        disabled={readOnly}
        style={{
          ...styles.favoriteButton,
          borderColor: stats.isFavorite ? 'var(--accent-amber-border)' : 'var(--border)',
          background: stats.isFavorite ? 'var(--accent-amber-bg)' : 'var(--bg-elevated)',
          color: stats.isFavorite ? 'var(--accent-amber-text)' : 'var(--text-secondary)',
          cursor: readOnly ? 'default' : 'pointer',
        }}
      >
        {stats.isFavorite ? '★ お気に入り登録済み' : '☆ お気に入りに登録'}
      </button>

      {/* ダメージ・計算式を囲んで誘導する。ドロワーは overflow:hidden/auto な祖先を
          複数持つため、画面全体を暗くする.tutorial-spotlight（box-shadowの9999px拡散）は
          ドロワーの外まで届かずクリップされてしまう。代わりに、①②③のステップで実績のある
          .tutorial-guide-pulse（このコンポーネント内で完結する光るリング）で囲む
          （2026-08-27ユーザー指定：ダメージ・計算式を囲んで計算式を開くよう誘導） */}
      <div
        className={highlightDamageFormula ? 'tutorial-guide-pulse' : undefined}
        style={{ display: 'grid', gap: 10, borderRadius: 10 }}
      >
        <NumberField
          label="ダメージ"
          value={stats.damage}
          onChange={(next) => update({ damage: next })}
          readOnly={readOnly}
        />

        {/* 経路上に技データが1件も無く計算対象が無い場合はボタン自体を出さない
            （手動でダメージ欄を確定しているかどうかは問わない） */}
        {damageBreakdown && (
          <div style={{ display: 'grid', gap: 6 }}>
            <button
              type="button"
              className="btn-ghost"
              style={styles.formulaToggle}
              onClick={() =>
                setIsFormulaOpen((open) => {
                  const next = !open;
                  if (next && highlightDamageFormula) onFormulaOpened?.();
                  return next;
                })
              }
            >
              <span>計算式</span>
              <span
                style={{
                  ...styles.formulaToggleChevron,
                  transform: isFormulaOpen ? 'rotate(180deg)' : 'none',
                }}
              >
                ⌄
              </span>
            </button>

            {isFormulaOpen && (
              <div style={styles.debugBreakdown}>
                {showFormulaExplanation && (
                  <div style={styles.formulaExplanation}>
                    ストリートファイター6と同じ補正でダメージを計算
                  </div>
                )}
                <div style={styles.debugBreakdownHeader}>
                  起点基準値{damageBreakdown.startBase}%
                  {damageBreakdown.rushTriggerPosition !== null &&
                    `／ラッシュ発生位置${damageBreakdown.rushTriggerPosition}発目〜`}
                </div>
                {damageBreakdown.entries.map((entry) => (
                  <div key={entry.position} style={styles.debugBreakdownRow}>
                    {entry.position}発目 {entry.hitLabel}
                    {entry.isSystemAction
                      ? ' : 敵にヒットしない行動のため補正対象外'
                      : entry.isSuperArt && entry.minDamageGuaranteePercent !== null
                        ? entry.percent === entry.minDamageGuaranteePercent
                          ? ` : SA最低保証${entry.minDamageGuaranteePercent}%が適用（自然計算が下回った）`
                          : ` : modifier="${entry.modifierText || 'なし'}"${entry.isRush ? '／ラッシュ後' : ''}（SA最低保証${entry.minDamageGuaranteePercent}%は未到達）`
                        : ` : modifier="${entry.modifierText || 'なし'}"${entry.isRush ? '／ラッシュ後' : ''}`}
                    {' → '}
                    {entry.isSystemAction
                      ? 'ダメージ0（位置のみ消費）'
                      : `${entry.damage} × ${entry.percent}% = ${Math.round(entry.contribution)}`}
                  </div>
                ))}
                <div style={styles.debugBreakdownRow}>合計：{damageBreakdown.total}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {damageBreakdown && <div style={styles.sectionDivider} />}

      {showPlusFrameSection && (
        <>
          <div style={styles.twoColRow}>
            <NumberField
              label="プラスフレーム"
              value={stats.plusFrame}
              onChange={(next) => update({ plusFrame: next })}
              readOnly={readOnly}
            />

            <NumberField
              label="Dゲージ削り量"
              value={stats.opponentDGaugeChip}
              onChange={(next) => update({ opponentDGaugeChip: next })}
              readOnly={readOnly}
            />
          </div>

          <div style={{ display: 'flex', gap: 4, marginTop: -4 }}>
            {(['ground', 'air'] as const).map((hitType) => {
              const active = stats.plusFrameHitType === hitType;
              return (
                <button
                  key={hitType}
                  type="button"
                  disabled={readOnly}
                  onClick={() => update({ plusFrameHitType: active ? null : hitType })}
                  style={{
                    ...styles.conditionButton,
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  {hitType === 'ground' ? '地上ヒット' : '空中ヒット'}
                </button>
              );
            })}
          </div>
          {stats.plusFrameHitType && (
            <PlusFrameRangePicker
              text={stats.plusFrameHitType === 'ground' ? groundPlusFrame : airPlusFrame}
              readOnly={readOnly}
              onPick={(next) => update({ plusFrame: next })}
            />
          )}
        </>
      )}

      <GaugeChangeField
        label="Dゲージ増減"
        value={stats.dGaugeChange}
        onChange={(next) => update({ dGaugeChange: next })}
        readOnly={readOnly}
        breakdown={dGaugeBreakdown}
        isBreakdownMode={isDGaugeBreakdownMode}
        onToggleBreakdownMode={() => setIsDGaugeBreakdownMode((open) => !open)}
      />

      {/* SF6は「ゲージが0でなければ消費行動を発動できる」仕様（名目コストを満額持っている
          必要はない）ため、消費行動の間に十分な回復があれば名目コストの合計よりずっと少ない
          ゲージで足りる。逆に回復を挟まず連続すると名目コストを超える量が必要になることもある
          （2026-08-26ユーザー指定：単純な消費量の合計ではなく実際に発動できるかをシミュレーション
          した最低限必要量を表示する）。消費行動が経路上に無ければ(0)表示しない */}
      {dGaugeMinimumRequired !== null && dGaugeMinimumRequired > 0 && (
        <p style={styles.minRequiredGaugeText}>
          最低限必要なDゲージ：{dGaugeMinimumRequired}
        </p>
      )}

      <GaugeChangeField
        label="SAゲージ増加"
        value={stats.saGaugeGain}
        onChange={(next) => update({ saGaugeGain: next })}
        readOnly={readOnly}
        breakdown={saGaugeBreakdown}
        isBreakdownMode={isSaGaugeBreakdownMode}
        onToggleBreakdownMode={() => setIsSaGaugeBreakdownMode((open) => !open)}
      />

      {showRatingGrid && (
        <div style={styles.ratingGrid}>
          <RatingField
            label="ダメージ評価"
            value={stats.damageRating}
            onChange={(next) => update({ damageRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="Dゲージ評価"
            value={stats.dGaugeRating}
            onChange={(next) => update({ dGaugeRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="SAゲージ評価"
            value={stats.saGaugeRating}
            onChange={(next) => update({ saGaugeRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="運び評価"
            value={stats.carryRating}
            onChange={(next) => update({ carryRating: next })}
            disabled={readOnly}
            compact
          />
        </div>
      )}

      {/* 総合評価だけは他の評価より目立たせたいため、ボタンサイズを縮めず単独で1行に配置する
          （ユーザー指定：「総合評価のサイズは変えずに他の評価の数字を小さくしていく」方針） */}
      {showOverallRating && (
        <RatingField
          label="総合評価"
          value={stats.overallRating}
          onChange={(next) => update({ overallRating: next })}
          disabled={readOnly}
        />
      )}

      {showThrowRange && (
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={stats.isThrowRange}
            disabled={readOnly}
            onChange={(event) => update({ isThrowRange: event.target.checked })}
          />
          投げ間合い
        </label>
      )}

      {showOkizeme && (
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={stats.canOkizeme}
            disabled={readOnly}
            onChange={(event) => update({ canOkizeme: event.target.checked })}
          />
          起き攻め可能
        </label>
      )}

      {showStartCondition && (
        <div style={styles.fieldLabel}>
          始動条件
          {requiredStartHitCondition && (
            <span style={styles.requiredHint}>
              経路上に「{START_HIT_CONDITION_LABELS[requiredStartHitCondition]}以上」でないと繋がらないノードがあるため、
              {START_HIT_CONDITION_LABELS[requiredStartHitCondition]}未満は選べません
            </span>
          )}
          {justParryRequiredCondition && (
            <span style={styles.requiredHint}>
              ジャストパリィ始動は常に「パニッシュカウンター」扱いになります
            </span>
          )}
          <div style={styles.threeColRow}>
            {START_HIT_CONDITIONS.map((condition) => {
              const active = effectiveStartHitCondition === condition;
              const belowRequirement =
                !!effectiveRequiredCondition &&
                START_HIT_CONDITION_RANK[condition] < START_HIT_CONDITION_RANK[effectiveRequiredCondition];
              const disabled = readOnly || belowRequirement;
              return (
                <button
                  key={condition}
                  type="button"
                  onClick={() => updateAndResetAutoFields({ startHitCondition: active ? null : condition })}
                  disabled={disabled}
                  style={{
                    ...styles.conditionButton,
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    cursor: disabled ? 'default' : 'pointer',
                    opacity: belowRequirement ? 0.4 : 1,
                  }}
                >
                  {START_HIT_CONDITION_LABELS[condition]}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => updateAndResetAutoFields({ isJustParryStart: !(stats.isJustParryStart ?? false) })}
              disabled={readOnly}
              style={{
                ...styles.conditionButton,
                borderColor: stats.isJustParryStart ? 'var(--accent)' : 'var(--border)',
                background: stats.isJustParryStart ? 'var(--accent)' : 'var(--bg-elevated)',
                color: stats.isJustParryStart ? '#fff' : 'var(--text-secondary)',
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              ジャストパリィ
            </button>
          </div>
        </div>
      )}

      {!finishingSuperArtMove && finishingSuperArtOptions.length > 0 && (
        <div style={styles.fieldLabel}>
          SAで締める
          <span style={styles.requiredHint}>
            この技の直後にSAへ繋いで終える場合に選びます。木にSAのノードを追加しなくても、
            ダメージ・ゲージの自動計算に反映されます
          </span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => updateAndResetAutoFields({ finishingSuperArtName: null })}
              disabled={readOnly}
              style={{
                ...styles.conditionButton,
                borderColor: stats.finishingSuperArtName === null ? 'var(--accent)' : 'var(--border)',
                background: stats.finishingSuperArtName === null ? 'var(--accent)' : 'var(--bg-elevated)',
                color: stats.finishingSuperArtName === null ? '#fff' : 'var(--text-secondary)',
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              使わない
            </button>
            {finishingSuperArtOptions.map((name) => {
              const active = stats.finishingSuperArtName === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => updateAndResetAutoFields({ finishingSuperArtName: active ? null : name })}
                  disabled={readOnly}
                  style={{
                    ...styles.conditionButton,
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {finishingSuperArtMove && finishingSuperArtMove.specialVariantOptions.length > 0 && (
        <div style={styles.fieldLabel}>
          使用した{finishingSuperArtMove.name}の特殊性能
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {finishingSuperArtMove.specialVariantOptions.map((variant) => {
              const active = (stats.finishingSpecialVariant ?? null) === variant;
              return (
                <button
                  key={variant}
                  type="button"
                  onClick={() => update({ finishingSpecialVariant: active ? null : variant })}
                  disabled={readOnly}
                  style={{
                    ...styles.conditionButton,
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  {variant}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {odUsagesOnPath.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={styles.fieldLabel}>経路上のOD使用</div>
          {odUsagesOnPath.map((entry) => (
            <OdLevelToggle
              key={entry.nodeId}
              label={entry.label}
              constraint={entry.constraint}
              usesOD={entry.usesOD}
              onChange={(next) => onChangeOdUsage?.(entry.nodeId, next)}
              readOnly={readOnly || !onChangeOdUsage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** プラスフレーム欄の「地上/空中」トグルの下に出す、技データの登録内容から選ぶUI。
 * 範囲としてパースできればチップボタン、できなければ生テキストの参考表示、
 * 空ならその旨のヒントを出す */
function PlusFrameRangePicker({
  text,
  readOnly,
  onPick,
}: {
  text: string;
  readOnly: boolean;
  onPick: (next: number) => void;
}) {
  if (!text) {
    return <p style={styles.plusFrameHint}>（このヒット方向の有利フレームは未登録です）</p>;
  }

  const values = parsePlusFrameRange(text);
  if (!values) {
    return <p style={styles.plusFrameHint}>登録内容：{text}</p>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {values.map((value) => (
        <button
          key={value}
          type="button"
          disabled={readOnly}
          onClick={() => onPick(value)}
          style={{
            ...styles.conditionButton,
            padding: '2px 8px',
            cursor: readOnly ? 'default' : 'pointer',
          }}
        >
          {value >= 0 ? `+${value}` : value}
        </button>
      ))}
    </div>
  );
}

// Dゲージ増減・SAゲージ増加で共用する、「合計⇄内訳」をワンボタンで切り替えられる欄。
// 内訳モードでは編集不可の読み取り専用テキストに切り替わる（合計モードに戻せば通常通り
// 編集できる）。内訳の各ステップは長い矢印区切りの文字列でも折り返して全文表示し、
// 省略（…）はしない（2026-08-26ユーザー指定）。合計モードでは、totalExcludingEarlyRecovery
// （Dゲージ限定・SAゲージ側は無し）がtotalと異なる時だけ、入力欄の右に括弧書きの参考値
// 「-25500(-27500)」を添える（2026-08-26ユーザー指定：内訳の1ステップずつを括弧で示す
// のではなく、合計欄側に括弧で併記する方式に変更）
function GaugeChangeField({
  label,
  value,
  onChange,
  readOnly,
  breakdown,
  isBreakdownMode,
  onToggleBreakdownMode,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  readOnly: boolean;
  breakdown?: { steps: GaugeStep[]; total: number; totalExcludingEarlyRecovery?: number } | null;
  isBreakdownMode: boolean;
  onToggleBreakdownMode: () => void;
}) {
  const hasEarlyRecoveryNote =
    breakdown?.totalExcludingEarlyRecovery !== undefined &&
    breakdown.totalExcludingEarlyRecovery !== breakdown.total;

  return (
    <div style={styles.fieldLabel}>
      <div style={styles.fieldLabelRow}>
        <span>{label}</span>
        {/* 「合計(-19600)」⇄「内訳(+200→+200→-20000)」をワンボタンで切り替える。
            内訳が無い（技データ未登録等）場合はボタン自体を出さない */}
        {breakdown && breakdown.steps.length > 0 && (
          <button
            type="button"
            className="btn-ghost"
            style={styles.autoCalcButton}
            onClick={onToggleBreakdownMode}
          >
            {isBreakdownMode ? '合計で見る' : '内訳で見る'}
          </button>
        )}
      </div>

      {isBreakdownMode && breakdown ? (
        <div style={styles.gaugeBreakdownText}>
          {breakdown.steps
            .map((step) => (step.value >= 0 ? `+${step.value}` : `${step.value}`))
            .join(' → ')}
        </div>
      ) : (
        <div style={styles.gaugeInputRow}>
          <input
            type="number"
            className="input-field"
            style={styles.numberInput}
            value={value ?? ''}
            readOnly={readOnly}
            onChange={(event) =>
              onChange(event.target.value === '' ? null : Number(event.target.value))
            }
          />
          {hasEarlyRecoveryNote && (
            <span
              style={styles.gaugeSecondaryTotal}
              title="Dゲージを使うまでの技の分を加算しなかった場合"
            >
              ({breakdown!.totalExcludingEarlyRecovery})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  readOnly?: boolean;
}) {
  return (
    <div style={styles.fieldLabel}>
      <span>{label}</span>
      <input
        type="number"
        className="input-field"
        style={styles.numberInput}
        value={value ?? ''}
        readOnly={readOnly}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
      />
    </div>
  );
}

function RatingField({
  label,
  value,
  onChange,
  disabled = false,
  // trueの時、総合評価より小さいボタンサイズを使う（ratingButtonCompact参照）。
  // 総合評価だけを目立たせるため、縮めるのは他の評価側という方針
  compact = false,
}: {
  label: string;
  value: Rating5 | null;
  onChange: (next: Rating5 | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      <div style={{ display: 'flex', gap: 4 }}>
        {([1, 2, 3, 4, 5] as Rating5[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            disabled={disabled}
            style={{
              ...(compact ? styles.ratingButtonCompact : styles.ratingButton),
              borderColor: value === n ? 'var(--accent)' : 'var(--border)',
              background: value === n ? 'var(--accent)' : 'var(--bg-elevated)',
              color: value === n ? '#fff' : 'var(--text-secondary)',
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  favoriteButton: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 10,
    border: '1.5px solid var(--border)',
    fontSize: 13,
    fontWeight: 800,
    textAlign: 'center',
  },
  fieldLabel: {
    display: 'grid',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontWeight: 700,
    minWidth: 0,
  },
  numberInput: {
    fontSize: 12,
    padding: '6px 10px',
  },
  fieldLabelRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  twoColRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  autoCalcButton: {
    fontSize: 11,
    padding: '2px 8px',
  },
  // Dゲージ/SAゲージ増減の内訳表示（例:「+200 → +200 → -20000」）。読み取り専用のテキストなので
  // input-fieldと縦幅を合わせつつ、編集不可であることが分かるよう文字色を少し落とす。
  // コンボが長く1行に収まらない場合も省略（…）せず、折り返して全文表示する
  // （2026-08-26ユーザー指定。white-space:nowrap/text-overflow:ellipsisは使わない）
  gaugeBreakdownText: {
    fontSize: 12,
    padding: '6px 10px',
    color: 'var(--text-secondary)',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: 1.6,
  },
  // 合計欄本体（input）＋「Dゲージを使うまでの技の分を除いた場合」の参考値（括弧書き）を
  // 横並びにする
  gaugeInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  gaugeSecondaryTotal: {
    flex: '0 0 auto',
    fontSize: 12,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  minRequiredGaugeText: {
    margin: 0,
    marginTop: -6,
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
  },
  plusFrameHint: {
    margin: 0,
    marginTop: -4,
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  formulaToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    fontSize: 12,
    padding: '4px 10px',
    border: 'none',
  },
  // 開閉で別の文字（⌃/⌄）に差し替えると字形の重心が微妙にずれて位置が上下して見えるため、
  // 同じ文字を180度回転させるだけにする（円い枠は常に同じ場所・同じ見た目のまま）
  formulaToggleChevron: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    lineHeight: 1,
    transition: 'transform 0.15s',
  },
  sectionDivider: {
    height: 2,
    margin: '2px 0',
    // 通常のvar(--border)よりも一段明るい区切り線用の色（見出し無しでも区切りが目立つように）
    background: 'var(--border-hover)',
  },
  // 計算式の内訳表示（元は調査用のデバッグ表示だったが、計算根拠を見せる機能として
  // 「計算式」ボタンの開閉式に変更した。2026-08-26ユーザー指定）。当初の赤枠・赤文字は
  // デバッグ表示時代の名残でサイトの雰囲気から浮いていたため、灰色の枠線・明るい白文字・
  // 背景(黒と枠線グレーの中間)へ変更した（2026-08-27ユーザー指定）
  debugBreakdown: {
    display: 'grid',
    gap: 3,
    marginTop: -2,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    fontFamily: 'monospace',
    fontSize: 10.5,
    color: 'var(--text-primary)',
  },
  debugBreakdownHeader: {
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  // チュートリアルキャラクター限定、計算式を開いた時に添える一言（2026-08-27ユーザー指定）
  formulaExplanation: {
    marginBottom: 4,
    paddingBottom: 6,
    borderBottom: '1px solid var(--border)',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--accent-blue-text)',
  },
  debugBreakdownRow: {
    lineHeight: 1.5,
  },
  // ダメージ評価/Dゲージ評価/SAゲージ評価/運び評価を2×2で並べるためのグリッド。
  // 総合評価はこのグリッドの外に単独で置き、サイズを変えずに目立たせる
  ratingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 10,
  },
  ratingButton: {
    width: 26,
    height: 26,
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
  ratingButtonCompact: {
    width: 19,
    height: 19,
    borderRadius: 6,
    border: '1px solid var(--border)',
    fontSize: 9,
    fontWeight: 800,
    cursor: 'pointer',
  },
  conditionButton: {
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 800,
    textAlign: 'center',
    cursor: 'pointer',
  },
  requiredHint: {
    fontSize: 10.5,
    fontWeight: 400,
    color: 'var(--text-muted)',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
};
