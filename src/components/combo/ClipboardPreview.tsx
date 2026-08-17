// src/components/combo/ClipboardPreview.tsx
// コピー確定済みのクリップボードをドロワー下部にミニツリーで表示する。
// このパネル自体をドラッグして、キャンバス上の好きなノードへドロップすると、
// クリップボードの内容がまるごとそのノードの子として貼り付けられる
// （実際の貼り付け処理はドロップ先の MoveNodeCircle の onPasteDrop 経由で行う。
// このコンポーネントは「これは貼り付け操作である」という印をドラッグデータに付けるだけ）。

import type { CSSProperties } from 'react';
import { useAppStore } from '../../store';
import type { MoveNode } from '../../types';

const MAX_CHAIN_LENGTH = 4;

type ChainItem = { id: string; moveName: string };

/** 1本の枝を「単一の子」を辿れる限りチェーンとして表示する。
 * 4つを超える場合は最初の2つ・最後の2つだけを表示し、間を省略する。
 * 途中で枝分かれしたら、そこで表示を打ち切り件数だけ添える。 */
function buildPreviewChain(root: MoveNode): { items: ChainItem[]; moreBranches: number } {
  const items: ChainItem[] = [];
  let cursor: MoveNode = root;

  while (true) {
    items.push({ id: cursor.id, moveName: cursor.moveName });
    if (cursor.children.length !== 1) break;
    cursor = cursor.children[0];
  }

  const moreBranches = cursor.children.length > 1 ? cursor.children.length : 0;

  if (items.length <= MAX_CHAIN_LENGTH) return { items, moreBranches };

  return {
    items: [...items.slice(0, 2), { id: `${root.id}-ellipsis`, moveName: '…' }, ...items.slice(-2)],
    moreBranches,
  };
}

export function ClipboardPreview() {
  const clipboard = useAppStore((state) => state.clipboard);
  const clearClipboard = useAppStore((state) => state.clearClipboard);

  if (!clipboard || clipboard.length === 0) return null;

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/json', JSON.stringify({ kind: 'clipboard-paste' }));
        // MoveNodeCircle 側の onDragOver は常に dropEffect='move' を指定するため、
        // ここを 'copy' にすると effectAllowed と不一致になりドロップ自体がブロックされる
        // （実際の処理内容が貼り付けかどうかは onDrop 側で判定するので、ここは
        // 既存のノード移動ドラッグと同じ 'move' に揃えておけばよい）
        event.dataTransfer.effectAllowed = 'move';
      }}
      style={styles.box}
      title="ドラッグしてキャンバス上のノードにドロップすると貼り付けられます"
    >
      <div style={styles.header}>
        <span style={styles.title}>現在コピーしているノード</span>
        <button type="button" className="btn-icon" onClick={clearClipboard} title="クリップボードをクリア">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p style={styles.hint}>ここをドラッグして、ツリー上の貼り付け先ノードにドロップしてください</p>

      <div style={styles.branchList}>
        {clipboard.map((fragment) => {
          const { items, moreBranches } = buildPreviewChain(fragment);
          return (
            <div key={fragment.id} style={styles.branchRow}>
              {items.map((item, index) => (
                <span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {index > 0 && <span style={styles.arrow}>→</span>}
                  <span style={styles.chip}>{item.moveName}</span>
                </span>
              ))}
              {moreBranches > 0 && <span style={styles.moreBranches}>＋他{moreBranches}分岐</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  box: {
    border: '1px dashed var(--accent)',
    borderRadius: 14,
    background: 'var(--bg-elevated)',
    padding: 12,
    cursor: 'grab',
    display: 'grid',
    gap: 8,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 13,
    fontWeight: 900,
    color: 'var(--text-primary)',
  },
  hint: {
    fontSize: 11,
    lineHeight: 1.6,
    color: 'var(--text-muted)',
  },
  branchList: {
    display: 'grid',
    gap: 8,
  },
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
