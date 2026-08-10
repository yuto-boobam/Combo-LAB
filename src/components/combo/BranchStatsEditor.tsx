// src/components/combo/BranchStatsEditor.tsx
// 枝（コンボ）の統計情報の編集UI。葉ノード、またはコンボ締め属性を持つノードで使う
// （表示するかどうかの判断は呼び出し側で行う。src/utils/branchStats.ts も参照）。

import type { CSSProperties } from 'react';
import type { ComboBranchStats, Rating5 } from '../../types';

type Props = {
  value: ComboBranchStats | null;
  onChange: (next: ComboBranchStats | null) => void;
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
};

export function BranchStatsEditor({ value, onChange }: Props) {
  const stats = value ?? DEFAULT_STATS;

  const update = (patch: Partial<ComboBranchStats>) => {
    onChange({ ...stats, ...patch });
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <NumberField label="ダメージ" value={stats.damage} onChange={(next) => update({ damage: next })} />
      <NumberField
        label="Dゲージ増減（回収+ / 消費-）"
        value={stats.dGaugeChange}
        onChange={(next) => update({ dGaugeChange: next })}
      />
      <NumberField
        label="SAゲージ増加"
        value={stats.saGaugeGain}
        onChange={(next) => update({ saGaugeGain: next })}
      />
      <NumberField
        label="プラスフレーム"
        value={stats.plusFrame}
        onChange={(next) => update({ plusFrame: next })}
      />

      <RatingField
        label="ダメージ評価"
        value={stats.damageRating}
        onChange={(next) => update({ damageRating: next })}
      />
      <RatingField
        label="Dゲージ評価"
        value={stats.dGaugeRating}
        onChange={(next) => update({ dGaugeRating: next })}
      />
      <RatingField
        label="SAゲージ評価"
        value={stats.saGaugeRating}
        onChange={(next) => update({ saGaugeRating: next })}
      />
      <RatingField
        label="総合評価"
        value={stats.overallRating}
        onChange={(next) => update({ overallRating: next })}
      />

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={stats.isThrowRange}
          onChange={(event) => update({ isThrowRange: event.target.checked })}
        />
        投げ間合い
      </label>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={stats.canOkizeme}
          onChange={(event) => update({ canOkizeme: event.target.checked })}
        />
        起き攻め可能
      </label>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      <input
        type="number"
        className="input-field"
        style={styles.numberInput}
        value={value ?? ''}
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
}: {
  label: string;
  value: Rating5 | null;
  onChange: (next: Rating5 | null) => void;
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
            style={{
              ...styles.ratingButton,
              borderColor: value === n ? 'var(--accent)' : 'var(--border)',
              background: value === n ? 'var(--accent)' : 'var(--bg-elevated)',
              color: value === n ? '#fff' : 'var(--text-secondary)',
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
  ratingButton: {
    width: 26,
    height: 26,
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
