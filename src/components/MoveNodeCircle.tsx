// src/components/MoveNodeCircle.tsx
// 角丸長方形の技ノード（企画書7〜8ページ）。Rootedの矩形カード(TaskNodeCard)とは異なり、
// 基本は技名のみ表示する。ドラッグ&ドロップの実装パターンはTaskNodeCardを踏襲。
// 幅は固定し、高さは技名の行数（最大2行）に応じて伸縮させることで、
// 円形だった頃より縦のスペースを取らないようにしている。

import { useState } from 'react';
import type { MoveNode } from '../types';
import { resolveNodeVisualStyle, NODE_BODY_COLOR_VAR, NODE_BORDER_COLOR_VAR } from '../utils/nodeVisualStyle';

export const NODE_WIDTH = 72;
// 実測前（マウント直後）の仮の高さ。1〜2行の技名がだいたい収まる目安値で、
// 実際の高さはuseNodeHeightsの実測値にすぐ置き換わる
export const NODE_DEFAULT_HEIGHT = 44;

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
        width: NODE_WIDTH,
        minHeight: NODE_DEFAULT_HEIGHT,
        borderRadius: 'var(--radius-lg)',
        position: 'relative',
        background: NODE_BODY_COLOR_VAR[visual.bodyColorKind],
        border: `${visual.borderWidth === 'thick' || isCopyAnchor || isCopySelected ? 3 : 1.5}px ${isCopyAnchor ? 'dashed' : visual.borderStyle} ${borderColor}`,
        boxShadow: isSelected ? '0 0 0 3px var(--accent-glow)' : 'none',
        padding: '6px 7px',
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
            top: -5,
            left: -5,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 900,
          }}
        >
          ✓
        </span>
      )}

      {visual.isSituational && (
        <span
          title="状況限定"
          style={{ position: 'absolute', top: -3, right: -2, fontSize: 12, lineHeight: 1 }}
        >
          📍
        </span>
      )}

      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-secondary)',
          lineHeight: 1.2,
          wordBreak: 'break-word',
          // 呼び名に含まれる改行（ストック段階などを2行目に分けたい場合）をそのまま活かす
          whiteSpace: 'pre-line',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
        title={node.moveName}
      >
        {node.displayName || node.moveName}
      </span>

      {node.specialNote && (
        <span
          style={{
            fontSize: 8,
            color: 'var(--text-secondary)',
            marginTop: 1,
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
