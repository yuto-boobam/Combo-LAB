// src/components/combo/BranchStatsEditor.tsx
// 枝（コンボ）の統計情報の編集UI。葉ノード、またはガード/空振り属性を持つノードで使う
// （表示するかどうかの判断は呼び出し側で行う。src/components/combo/SideDrawerPanel.tsx を参照）。

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BranchStartHitCondition, ComboBranchStats, Rating5 } from '../../types';
import type { DamageBreakdown, OdLevelConstraint } from '../../utils/comboGaugeCalc';
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
  // root〜このノードまでの技データから自動計算したSAゲージ増減。技データが1件も
  // 登録されていない経路ではnull
  autoSaGaugeChange?: number | null;
  // root〜このノードまでの技データから自動計算したDゲージ増減。キャンセルラッシュ中の
  // 抑制や連続ガード等の判定はできる範囲のみ反映（詳細はsrc/utils/comboGaugeCalc.ts参照）
  autoDGaugeChange?: number | null;
  // root〜このノードまでの経路上のSAヒットから自動計算した、相手のDゲージ削り量。
  // ジャストパリィ始動なら半分にする（詳細はsrc/utils/comboGaugeCalc.ts参照）
  autoOpponentDGaugeChip?: number | null;
  // root〜このノードまでの技データから自動計算したダメージ。標準コンボ補正テーブル・
  // ラッシュ攻撃の0.85倍・カウンター/パニカン始動・SAの最低保証を反映（詳細はsrc/utils/comboGaugeCalc.ts参照）
  autoDamage?: number | null;
  // ダメージ計算式の内訳。「計算式」ボタンを押した時だけ展開して見せる
  // （普段は閉じておく。2026-08-26ユーザー指定：計算根拠を見せる正式な機能として採用）
  damageBreakdown?: DamageBreakdown | null;
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
  autoSaGaugeChange = null,
  autoDGaugeChange = null,
  autoOpponentDGaugeChip = null,
  autoDamage = null,
  damageBreakdown = null,
  finishingSuperArtMove = null,
  finishingSuperArtOptions = [],
  odUsagesOnPath = [],
  onChangeOdUsage,
  groundPlusFrame = '',
  airPlusFrame = '',
}: Props) {
  const stats = value ?? DEFAULT_BRANCH_STATS;
  // 計算式の内訳は普段は閉じておき、興味を持った人がボタンを押した時だけ見せる
  const [isFormulaOpen, setIsFormulaOpen] = useState(false);

  const update = (patch: Partial<ComboBranchStats>) => {
    onChange({ ...stats, ...patch });
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
    onChange({ ...stats, startHitCondition: effectiveRequiredCondition });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, satisfiesRequirement, effectiveRequiredCondition]);

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

      <NumberField
        label="ダメージ"
        value={stats.damage}
        onChange={(next) => update({ damage: next })}
        readOnly={readOnly}
        autoValue={autoDamage}
      />

      {/* 経路上に技データが1件も無く計算対象が無い場合はボタン自体を出さない
          （手動でダメージ欄を確定しているかどうかは問わない） */}
      {damageBreakdown && (
        <div style={{ display: 'grid', gap: 6 }}>
          <button
            type="button"
            className="btn-ghost"
            style={styles.formulaToggle}
            onClick={() => setIsFormulaOpen((open) => !open)}
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

      {damageBreakdown && <div style={styles.sectionDivider} />}

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
          autoValue={autoOpponentDGaugeChip}
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

      <NumberField
        label="Dゲージ増減"
        value={stats.dGaugeChange}
        onChange={(next) => update({ dGaugeChange: next })}
        readOnly={readOnly}
        autoValue={autoDGaugeChange}
      />

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={stats.includesEarlyDGaugeRecovery ?? true}
          disabled={readOnly}
          onChange={(event) => update({ includesEarlyDGaugeRecovery: event.target.checked })}
        />
        Dゲージを使うまでの技の回復を含む
      </label>

      <NumberField
        label="SAゲージ増加"
        value={stats.saGaugeGain}
        onChange={(next) => update({ saGaugeGain: next })}
        readOnly={readOnly}
        autoValue={autoSaGaugeChange}
      />

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

      {/* 総合評価だけは他の評価より目立たせたいため、ボタンサイズを縮めず単独で1行に配置する
          （ユーザー指定：「総合評価のサイズは変えずに他の評価の数字を小さくしていく」方針） */}
      <RatingField
        label="総合評価"
        value={stats.overallRating}
        onChange={(next) => update({ overallRating: next })}
        disabled={readOnly}
      />

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={stats.isThrowRange}
          disabled={readOnly}
          onChange={(event) => update({ isThrowRange: event.target.checked })}
        />
        投げ間合い
      </label>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={stats.canOkizeme}
          disabled={readOnly}
          onChange={(event) => update({ canOkizeme: event.target.checked })}
        />
        起き攻め可能
      </label>

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
                onClick={() => update({ startHitCondition: active ? null : condition })}
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
            onClick={() => update({ isJustParryStart: !(stats.isJustParryStart ?? false) })}
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
              onClick={() => update({ finishingSuperArtName: null })}
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
                  onClick={() => update({ finishingSuperArtName: active ? null : name })}
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

function NumberField({
  label,
  value,
  onChange,
  readOnly = false,
  // 自動計算値。指定があればラベルの右側に「自動計算：X」＋「この値を使う」を表示する
  // （3列に並べても縦に間延びしないよう、入力欄の下ではなくタイトル横に配置する）
  autoValue = null,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  readOnly?: boolean;
  autoValue?: number | null;
}) {
  return (
    <div style={styles.fieldLabel}>
      <div style={styles.fieldLabelRow}>
        <span>{label}</span>
        {autoValue !== null && (
          <span style={styles.autoCalcInline}>
            自動計算：{autoValue}
            {!readOnly && value !== autoValue && (
              <button
                type="button"
                className="btn-ghost"
                style={styles.autoCalcButton}
                onClick={() => onChange(autoValue)}
              >
                この値を使う
              </button>
            )}
          </span>
        )}
      </div>
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
  autoCalcInline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 400,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
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
  // 「計算式」ボタンの開閉式に変更した。2026-08-26ユーザー指定）
  debugBreakdown: {
    display: 'grid',
    gap: 3,
    marginTop: -2,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px dashed var(--accent-rose-border)',
    background: 'var(--accent-rose-bg)',
    fontFamily: 'monospace',
    fontSize: 10.5,
    color: 'var(--text-secondary)',
  },
  debugBreakdownHeader: {
    fontWeight: 800,
    color: 'var(--accent-rose-text)',
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
