// src/components/combo/OdLevelToggle.tsx
// 「OD版はレベル+1相当の性能になる」技（イングリッドのビーム等）用の通常/OD切り替え。
// constraintに応じて選べない方をグレーアウトする（始動条件のカウンター制約と同じ考え方）。
// 選択中のノード欄（そのノード自身）・コンボの情報欄（経路上の全ビームをまとめて確認）の
// 両方から使う共通コンポーネント

import type { CSSProperties } from 'react';
import type { OdLevelConstraint } from '../../utils/comboGaugeCalc';

export function OdLevelToggle({
  label,
  constraint,
  usesOD,
  onChange,
  readOnly,
}: {
  // 経路上の複数ノードをまとめて表示する時だけ渡す（技名等）。単体表示では省略可
  label?: string;
  constraint: OdLevelConstraint;
  usesOD: boolean;
  onChange: (next: boolean) => void;
  readOnly: boolean;
}) {
  const normalDisabled = readOnly || constraint === 'odOnly';
  const odDisabled = readOnly || constraint === 'normalOnly';

  const buttonStyle = (active: boolean, disabled: boolean): CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 800,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled && !active ? 0.4 : 1,
  });

  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)' }}>
      {label ? `${label}：OD使用` : 'OD使用'}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          type="button"
          disabled={normalDisabled}
          onClick={() => onChange(false)}
          style={buttonStyle(!usesOD, normalDisabled)}
        >
          通常
        </button>
        <button
          type="button"
          disabled={odDisabled}
          onClick={() => onChange(true)}
          style={buttonStyle(usesOD, odDisabled)}
        >
          OD
        </button>
      </div>
    </div>
  );
}
