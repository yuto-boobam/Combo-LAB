// src/components/combo/HitSelectionToggle.tsx
// 複数ヒット技（技データのMoveStats.isMultiHit）で、実際に何段目が当たったかを選ぶ
// トグル。1〜最終段の番号を並べ、当たった段だけクリックする（2026-08-28ユーザー指定：
// 開始/終了の2列より、当たった段をそのままクリックする方がシンプル）。
// OdLevelToggleと同じ見た目・考え方の共通コンポーネント。

import type { CSSProperties } from 'react';

export function HitSelectionToggle({
  hitTotal,
  selectedHits,
  onChange,
  readOnly,
}: {
  // その技の全段数（MoveStats.hits.length）
  hitTotal: number;
  // 実際に当たった段番号の一覧（1始まり）。空配列は「全段当たった」扱い
  selectedHits: number[];
  onChange: (next: number[] | null) => void;
  readOnly: boolean;
}) {
  const buttonStyle = (active: boolean): CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 800,
    cursor: readOnly ? 'default' : 'pointer',
  });

  const selectedSet = new Set(selectedHits);

  const toggle = (n: number) => {
    const next = selectedSet.has(n)
      ? selectedHits.filter((hit) => hit !== n)
      : [...selectedHits, n].sort((a, b) => a - b);
    // 全段選んだ状態、または1つも選ばない状態は「全段当たった」扱いに戻す
    onChange(next.length === 0 || next.length === hitTotal ? null : next);
  };

  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)' }}>
      ヒット数（当たった段だけ選ぶ・全{hitTotal}段）
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Array.from({ length: hitTotal }, (_, index) => index + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => toggle(n)}
            style={buttonStyle(selectedSet.has(n))}
          >
            {n}段目
          </button>
        ))}
      </div>
    </div>
  );
}
