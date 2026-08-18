// src/components/GroupPillNode.tsx
// 「共通区間を名前付きグループとして折りたたむ」機能で、折りたたみ中の区間を
// 1個のノードとして表示するための専用コンポーネント（企画: MoveNodeCircleの技名表示を
// グループ名表示に差し替えたもの）。
//
// 折りたたみ中は編集不可の純粋な表示物にする。クリックは展開のみを行い、選択編集・
// D&D先としての子ノード追加は受け付けない（展開すれば実ノードに対して通常通り行える）。
// 位置移動（自分をドラッグして並び替える）自体はグループ区間ごと正しく動くため許可する。

import { NODE_WIDTH, NODE_DEFAULT_HEIGHT } from './MoveNodeCircle';

type Props = {
  id: string;
  groupName: string;
  memberCount: number;
  hasChildren: boolean;
  isExpanded: boolean;
  onExpand: () => void;
  onToggleExpand?: () => void;
  parentId: string | null;
  dragIndex: number;
  readOnly?: boolean;
  // コピー/グループ化モード中（自分は候補になり得ない）は展開操作を無効化し、薄く表示する
  isDisabledByOtherMode?: boolean;
};

export function GroupPillNode({
  id,
  groupName,
  memberCount,
  hasChildren,
  isExpanded,
  onExpand,
  onToggleExpand,
  parentId,
  dragIndex,
  readOnly = false,
  isDisabledByOtherMode = false,
}: Props) {
  return (
    <div
      id={`node-${id}`}
      draggable={!readOnly && !isDisabledByOtherMode}
      onDragStart={(event) => {
        if (readOnly || isDisabledByOtherMode) return;
        event.dataTransfer.setData('application/json', JSON.stringify({ id, parentId, index: dragIndex }));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={isDisabledByOtherMode ? undefined : onExpand}
      title={isDisabledByOtherMode ? undefined : 'クリックして展開'}
      className="flex flex-col items-center justify-center select-none"
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_DEFAULT_HEIGHT,
        borderRadius: 'var(--radius-lg)',
        position: 'relative',
        background: 'var(--bg-elevated)',
        border: '2px dashed var(--accent)',
        padding: '6px 7px',
        textAlign: 'center',
        opacity: isDisabledByOtherMode ? 0.35 : 1,
        cursor: isDisabledByOtherMode ? 'default' : 'pointer',
        transition: 'border-color 0.15s, opacity 0.15s',
      }}
    >
      <span
        title={`${memberCount}個の技をまとめています`}
        style={{
          position: 'absolute',
          top: -5,
          left: -5,
          minWidth: 16,
          height: 16,
          padding: '0 3px',
          borderRadius: 999,
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 900,
        }}
      >
        {memberCount}
      </span>

      <span style={{ fontSize: 12, lineHeight: 1 }}>🔗</span>

      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--accent)',
          lineHeight: 1.2,
          wordBreak: 'break-word',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
        title={groupName}
      >
        {groupName}
      </span>

      {hasChildren && onToggleExpand && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpand();
          }}
          title={isExpanded ? '子ノードを閉じる' : '子ノードを開く'}
          style={{
            position: 'absolute',
            right: -5,
            bottom: -5,
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '1.5px solid var(--border)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg
            width="7"
            height="7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms',
            }}
          >
            <polyline points="9,6 15,12 9,18" />
          </svg>
        </button>
      )}
    </div>
  );
}
