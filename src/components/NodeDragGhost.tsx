// src/components/NodeDragGhost.tsx
// 以前のHTML5標準D&D実装では、ブラウザが自動でドラッグ中の要素の複製（ゴースト画像）を
// カーソルに追従させて表示していた。mousedownベースの自前実装（nodeDragController.ts）に
// 置き換えた際にこの見た目が失われていたため、代替として小さなラベルをカーソルに追従させる
// （2026-09-30ユーザー要望：「ドラッグしている対象を動かしているように見せる」）。
// ComboTreePage.tsxのルート付近に1つだけマウントする（position: fixedでスクロール/
// ズームの影響を受けないようにし、pointerEvents: noneでelementFromPointによる
// ドロップ先のヒットテストを妨げないようにする）

import { useDragGhostState } from '../utils/nodeDragController';

// カーソル自体の下に重なって見えづらくならないよう、少しだけ右下へずらして表示する
const CURSOR_OFFSET_X = 14;
const CURSOR_OFFSET_Y = 10;

export function NodeDragGhost() {
  const ghost = useDragGhostState();
  if (!ghost) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: ghost.x + CURSOR_OFFSET_X,
        top: ghost.y + CURSOR_OFFSET_Y,
        zIndex: 100,
        pointerEvents: 'none',
        maxWidth: 160,
        padding: '5px 10px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elevated)',
        border: '1.5px solid var(--accent)',
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.35)',
        color: 'var(--text-primary)',
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: 0.92,
        transform: 'rotate(-2deg)',
      }}
    >
      {ghost.label}
    </div>
  );
}
