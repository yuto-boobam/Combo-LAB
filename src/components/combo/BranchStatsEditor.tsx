// src/components/combo/BranchStatsEditor.tsx
// 枝（コンボ）の統計情報の編集UI。葉ノード、またはガード/空振り属性を持つノードで使う
// （表示するかどうかの判断は呼び出し側で行う。src/components/combo/SideDrawerPanel.tsx を参照）。

import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { BranchStartHitCondition, ComboBranchStats, Rating5 } from '../../types';
import type { DamageBreakdown, OdLevelConstraint } from '../../utils/comboGaugeCalc';
import { DEFAULT_BRANCH_STATS } from '../../utils/branchStatsDefaults';
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
  // root〜このノードまでの技データから自動計算したダメージ。標準コンボ補正テーブル・
  // ラッシュ攻撃の0.85倍・カウンター/パニカン始動・SAの最低保証を反映（詳細はsrc/utils/comboGaugeCalc.ts参照）
  autoDamage?: number | null;
  // 【一時的なデバッグ表示】ダメージ計算の食い違いを特定するための内訳。
  // 原因を特定したら、このpropとJSXごと削除する
  damageBreakdown?: DamageBreakdown | null;
  // このノードがSA(superArt・特殊性能あり)で、まだ特殊性能を選ばず技名だけ（例:「SA1」）
  // で置かれている場合のみ渡される。渡された場合、このコンポーネントは「使用した特殊性能」を
  // 選ばせるUIを表示し、finishingSpecialVariantに保存する（呼び出し側の判定はSideDrawerPanel参照）
  finishingSuperArtMove?: { name: string; specialVariantOptions: string[] } | null;
  // root〜このノードの経路上にある「OD版はレベル+1相当の性能になる」技（ビーム等）の一覧。
  // 末端ノードの「コンボの情報」欄から、経路の途中にあるノードのOD使用もまとめて確認・
  // 変更できるようにする（選択中のノードを1つずつ辿らなくても、最終的なゲージを見ている
  // 画面から直接調整できるようにしてほしい、というユーザー要望）
  odUsagesOnPath?: OdUsageOnPath[];
  onChangeOdUsage?: (nodeId: string, next: boolean) => void;
};

const START_HIT_CONDITIONS: BranchStartHitCondition[] = ['通常', 'カウンター', 'パニカン'];

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
  autoDamage = null,
  damageBreakdown = null,
  finishingSuperArtMove = null,
  odUsagesOnPath = [],
  onChangeOdUsage,
}: Props) {
  const stats = value ?? DEFAULT_BRANCH_STATS;

  const update = (patch: Partial<ComboBranchStats>) => {
    onChange({ ...stats, ...patch });
  };

  // 経路上に「カウンター以上でないと繋がらない」ノードがあれば、始動条件はそれ以上でなければ
  // ならない。手動入力がまだそれを満たしていなければ表示・実データの両方を自動で引き上げる
  // （「通常」を選べる状態のまま放置されないようにするための仕様。ユーザー確認済み）
  const satisfiesRequirement =
    !requiredStartHitCondition ||
    (stats.startHitCondition !== null &&
      START_HIT_CONDITION_RANK[stats.startHitCondition] >= START_HIT_CONDITION_RANK[requiredStartHitCondition]);
  const effectiveStartHitCondition = satisfiesRequirement
    ? stats.startHitCondition
    : requiredStartHitCondition;

  useEffect(() => {
    if (readOnly || satisfiesRequirement || !requiredStartHitCondition) return;
    onChange({ ...stats, startHitCondition: requiredStartHitCondition });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, satisfiesRequirement, requiredStartHitCondition]);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <NumberField
        label="ダメージ"
        value={stats.damage}
        onChange={(next) => update({ damage: next })}
        readOnly={readOnly}
      />
      {autoDamage !== null && (
        <div style={styles.autoCalcRow}>
          <span>自動計算：{autoDamage}</span>
          {!readOnly && stats.damage !== autoDamage && (
            <button
              type="button"
              className="btn-ghost"
              style={styles.autoCalcButton}
              onClick={() => update({ damage: autoDamage })}
            >
              この値を使う
            </button>
          )}
        </div>
      )}
      {/* 【一時的なデバッグ表示】原因を特定したらこのブロックごと削除する */}
      {damageBreakdown && (
        <div style={styles.debugBreakdown}>
          <div style={styles.debugBreakdownHeader}>
            計算式デバッグ：起点基準値{damageBreakdown.startBase}%
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
      <NumberField
        label="Dゲージ増減（回収+ / 消費-）"
        value={stats.dGaugeChange}
        onChange={(next) => update({ dGaugeChange: next })}
        readOnly={readOnly}
      />
      {autoDGaugeChange !== null && (
        <div style={styles.autoCalcRow}>
          <span>自動計算：{autoDGaugeChange}</span>
          {!readOnly && stats.dGaugeChange !== autoDGaugeChange && (
            <button
              type="button"
              className="btn-ghost"
              style={styles.autoCalcButton}
              onClick={() => update({ dGaugeChange: autoDGaugeChange })}
            >
              この値を使う
            </button>
          )}
        </div>
      )}

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
      />
      {autoSaGaugeChange !== null && (
        <div style={styles.autoCalcRow}>
          <span>自動計算：{autoSaGaugeChange}</span>
          {!readOnly && stats.saGaugeGain !== autoSaGaugeChange && (
            <button
              type="button"
              className="btn-ghost"
              style={styles.autoCalcButton}
              onClick={() => update({ saGaugeGain: autoSaGaugeChange })}
            >
              この値を使う
            </button>
          )}
        </div>
      )}
      <NumberField
        label="プラスフレーム"
        value={stats.plusFrame}
        onChange={(next) => update({ plusFrame: next })}
        readOnly={readOnly}
      />

      <RatingField
        label="ダメージ評価"
        value={stats.damageRating}
        onChange={(next) => update({ damageRating: next })}
        disabled={readOnly}
      />
      <RatingField
        label="Dゲージ評価"
        value={stats.dGaugeRating}
        onChange={(next) => update({ dGaugeRating: next })}
        disabled={readOnly}
      />
      <RatingField
        label="SAゲージ評価"
        value={stats.saGaugeRating}
        onChange={(next) => update({ saGaugeRating: next })}
        disabled={readOnly}
      />
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
            経路上に「{requiredStartHitCondition}以上」でないと繋がらないノードがあるため、
            {requiredStartHitCondition}未満は選べません
          </span>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          {START_HIT_CONDITIONS.map((condition) => {
            const active = effectiveStartHitCondition === condition;
            const belowRequirement =
              !!requiredStartHitCondition &&
              START_HIT_CONDITION_RANK[condition] < START_HIT_CONDITION_RANK[requiredStartHitCondition];
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
                {condition}
              </button>
            );
          })}
        </div>
      </div>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={stats.isJustParryStart ?? false}
          disabled={readOnly}
          onChange={(event) => update({ isJustParryStart: event.target.checked })}
        />
        ジャストパリィ始動
      </label>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={stats.isRushStart ?? false}
          disabled={readOnly}
          onChange={(event) => update({ isRushStart: event.target.checked })}
        />
        ラッシュ始動
      </label>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={stats.usesCA ?? false}
          disabled={readOnly}
          onChange={(event) => update({ usesCA: event.target.checked })}
        />
        CA使用
      </label>

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
    <label style={styles.fieldLabel}>
      {label}
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
    </label>
  );
}

function RatingField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: Rating5 | null;
  onChange: (next: Rating5 | null) => void;
  disabled?: boolean;
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
              ...styles.ratingButton,
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
  fieldLabel: {
    display: 'grid',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontWeight: 700,
  },
  numberInput: {
    fontSize: 12,
    padding: '6px 10px',
  },
  autoCalcRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: -4,
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  autoCalcButton: {
    fontSize: 11,
    padding: '2px 8px',
  },
  // 【一時的なデバッグ表示用】原因を特定したら他のdebugBreakdown*スタイルと一緒に削除する
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
  ratingButton: {
    width: 26,
    height: 26,
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
  conditionButton: {
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 800,
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
