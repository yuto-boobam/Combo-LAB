// src/components/MoveNodeCircle.tsx
// 円形の技ノード（企画書7〜8ページ）。Rootedの矩形カード(TaskNodeCard)とは異なり、
// 基本は技名のみ表示する。ドラッグ&ドロップの実装パターンはTaskNodeCardを踏襲。

import { useState } from 'react';
import type { MoveNode } from '../types';
import { resolveNodeVisualStyle, NODE_BODY_COLOR_VAR, NODE_BORDER_COLOR_VAR } from '../utils/nodeVisualStyle';

export const NODE_DIAMETER = 96;

type DraggedNodeData = { id: string; parentId: string | null; index: number };

type Props = {
  node: MoveNode;
  isRoot?: boolean;
  isSelected: boolean;
  onClick: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  parentId: string | null;
  dragIndex: number;
  onDrop: (draggedData: DraggedNodeData) => void;
  readOnly?: boolean;
  // コピーモード関連（コピーモード中でない時はすべて未指定でよい）
  isCopyModeActive?: boolean;
  isCopyAnchor?: boolean;
  isCopyCandidate?: boolean;
  isCopySelected?: boolean;
  // クリップボードをドラッグ&ドロップで貼り付けられた時に呼ばれる
  onPasteDrop?: () => void;
};

export function MoveNodeCircle({
  node,
  isRoot = false,
  isSelected,
  onClick,
  isExpanded = true,
  onToggleExpand,
  parentId,
  dragIndex,
  onDrop,
  readOnly = false,
  isCopyModeActive = false,
  isCopyAnchor = false,
  isCopyCandidate = false,
  isCopySelected = false,
  onPasteDrop,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const isLeaf = node.children.length === 0;
  const visual = resolveNodeVisualStyle(node.attributes);

  // コピーモード中は「起点/候補ではないノード」をクリックできないようにするため、
  // 通常の選択リング（isSelected）ではなくコピー用の枠色を優先する
  const borderColor = isCopyAnchor || isCopySelected
    ? 'var(--accent)'
    : isDragOver || isSelected
      ? 'var(--accent)'
      : NODE_BORDER_COLOR_VAR[visual.borderColorKind];

  const isInactiveDuringCopyMode = isCopyModeActive && !isCopyAnchor && !isCopyCandidate;

  return (
    <div
      id={`node-${node.id}`}
      draggable={!isRoot && !readOnly && !isCopyModeActive}
      onDragStart={(event) => {
        if (readOnly || isCopyModeActive) return;
        event.dataTransfer.setData(
          'application/json',
          JSON.stringify({ id: node.id, parentId, index: dragIndex }),
        );
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        if (readOnly) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        if (readOnly) return;
        event.preventDefault();
        setIsDragOver(false);
        try {
          const data = JSON.parse(event.dataTransfer.getData('application/json'));
          if (data?.kind === 'clipboard-paste') {
            onPasteDrop?.();
          } else if (data?.id) {
            onDrop(data);
          }
        } catch (error) {
          console.error('Drop error', error);
        }
      }}
      onClick={onClick}
      className="flex flex-col items-center justify-center select-none"
      style={{
        width: NODE_DIAMETER,
        height: NODE_DIAMETER,
        borderRadius: '50%',
        position: 'relative',
        background: NODE_BODY_COLOR_VAR[visual.bodyColorKind],
        border: `${visual.borderWidth === 'thick' || isCopyAnchor || isCopySelected ? 3 : 1.5}px ${isCopyAnchor ? 'dashed' : visual.borderStyle} ${borderColor}`,
        boxShadow: isSelected ? '0 0 0 3px var(--accent-glow)' : 'none',
        padding: 6,
        textAlign: 'center',
        opacity: isInactiveDuringCopyMode ? 0.35 : 1,
        cursor: isInactiveDuringCopyMode ? 'default' : 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
      }}
    >
      {isCopySelected && (
        <span
          title="コピー対象"
          style={{
            position: 'absolute',
            top: -6,
            left: -6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          ✓
        </span>
      )}

      {visual.isSituational && (
        <span
          title="状況限定"
          style={{ position: 'absolute', top: -4, right: -2, fontSize: 14, lineHeight: 1 }}
        >
          📍
        </span>
      )}

      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text-secondary)',
          lineHeight: 1.25,
          wordBreak: 'break-word',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
        title={node.moveName}
      >
        {node.moveName}
      </span>

      {node.specialNote && (
        <span
          style={{
            fontSize: 9,
            color: 'var(--text-secondary)',
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
          title={node.specialNote}
        >
          {node.specialNote}
        </span>
      )}

      {/* 開閉トグル（子を持つノードのみ） */}
      {!isLeaf && onToggleExpand && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpand();
          }}
          title={isExpanded ? '子ノードを閉じる' : '子ノードを開く'}
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            width: 18,
            height: 18,
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
            width="8"
            height="8"
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
