// src/components/combo/ClipboardPreview.tsx
// コピー確定済みのクリップボードをドロワー下部にミニツリーで表示する。
// このパネル自体をドラッグして、キャンバス上の好きなノードへドロップすると、
// クリップボードの内容がまるごとそのノードの子として貼り付けられる
// （実際の貼り付け処理はnodeDragController.tsのstartNodeDragが行う）。

import type { CSSProperties } from 'react';
import { useAppStore } from '../../store';
import { startNodeDrag } from '../../utils/nodeDragController';
import { ChainPreviewRow } from './ChainPreviewRow';

export function ClipboardPreview({ characterId }: { characterId: string }) {
  const clipboard = useAppStore((state) => state.clipboard);
  const clearClipboard = useAppStore((state) => state.clearClipboard);

  if (!clipboard || clipboard.length === 0) return null;

  return (
    <div
      onMouseDown={(event) =>
        startNodeDrag(characterId, { kind: 'clipboard-paste' }, event, `クリップボード（${clipboard.length}個）`)
      }
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
        {clipboard.map((fragment) => (
          <ChainPreviewRow key={fragment.id} root={fragment} />
        ))}
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
};
