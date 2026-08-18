// src/components/combo/ChainPreviewRow.tsx
// 「技名チップをまとめて1行のチェーンで見せる」表示を、クリップボードプレビューと
// 一致箇所への一括反映機能（変更前/変更後プレビュー、一致箇所一覧）とで共用する。

import type { CSSProperties } from 'react';
import type { MoveNode } from '../../types';
import { buildPreviewChain } from '../../utils/previewChain';

export function ChainPreviewRow({ root }: { root: MoveNode }) {
  const { items, moreBranches } = buildPreviewChain(root);

  return (
    <div style={styles.branchRow}>
      {items.map((item, index) => (
        <span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {index > 0 && <span style={styles.arrow}>→</span>}
          <span style={styles.chip}>{item.moveName}</span>
        </span>
      ))}
      {moreBranches > 0 && <span style={styles.moreBranches}>＋他{moreBranches}分岐</span>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  branchRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  arrow: {
    color: 'var(--text-muted)',
    fontSize: 11,
  },
  chip: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-primary)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '3px 9px',
  },
  moreBranches: {
    fontSize: 10,
    color: 'var(--text-muted)',
    marginLeft: 4,
  },
};
