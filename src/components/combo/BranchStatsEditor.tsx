// src/components/combo/BranchStatsEditor.tsx
// 枝（コンボ）の統計情報の編集UI。葉ノード、またはガード/空振り属性を持つノードで使う
// （表示するかどうかの判断は呼び出し側で行う。src/components/combo/SideDrawerPanel.tsx を参照）。

import type { CSSProperties } from 'react';
import type { BranchStartHitCondition, ComboBranchStats, Rating5 } from '../../types';

type Props = {
  value: ComboBranchStats | null;
  onChange: (next: ComboBranchStats | null) => void;
  readOnly?: boolean;
  // root〜このノードまでの技データから自動計算したSAゲージ増減。技データが1件も
  // 登録されていない経路ではnull（自動計算のうちSAゲージだけ実装済み。ダメージは未実装）
  autoSaGaugeChange?: number | null;
  // root〜このノードまでの技データから自動計算したDゲージ増減。キャンセルラッシュ中の
  // 抑制や連続ガード等の判定はできる範囲のみ反映（詳細はsrc/utils/comboGaugeCalc.ts参照）
  autoDGaugeChange?: number | null;
};

const DEFAULT_STATS: ComboBranchStats = {
  damage: null,
  dGaugeChange: null,
  saGaugeGain: null,
  damageRating: null,
  dGaugeRating: null,
  saGaugeRating: null,
  overallRating: null,
  plusFrame: null,
  isThrowRange: false,
  canOkizeme: false,
  startHitCondition: null,
  isJustParryStart: false,
  isRushStart: false,
  usesCA: false,
};

const START_HIT_CONDITIONS: BranchStartHitCondition[] = ['通常', 'カウンター', 'パニカン'];

export function BranchStatsEditor({
  value,
  onChange,
  readOnly = false,
  autoSaGaugeChange = null,
  autoDGaugeChange = null,
}: Props) {
  const stats = value ?? DEFAULT_STATS;

  const update = (patch: Partial<ComboBranchStats>) => {
    onChange({ ...stats, ...patch });
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <NumberField
        label="ダメージ"
        value={stats.damage}
        onChange={(next) => update({ damage: next })}
        readOnly={readOnly}
      />
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
        <div style={{ display: 'flex', gap: 4 }}>
          {START_HIT_CONDITIONS.map((condition) => {
            const active = (stats.startHitCondition ?? null) === condition;
            return (
              <button
                key={condition}
                type="button"
                onClick={() => update({ startHitCondition: active ? null : condition })}
                disabled={readOnly}
                style={{
                  ...styles.conditionButton,
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  cursor: readOnly ? 'default' : 'pointer',
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
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
};
