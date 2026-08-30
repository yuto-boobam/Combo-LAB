// src/components/MoveNodeCircle.tsx
// 角丸長方形の技ノード（企画書7〜8ページ）。Rootedの矩形カード(TaskNodeCard)とは異なり、
// 基本は技名のみ表示する。ドラッグ&ドロップの実装パターンはTaskNodeCardを踏襲。
// 幅は固定し、高さは技名の行数（最大2行）に応じて伸縮させることで、
// 円形だった頃より縦のスペースを取らないようにしている。

import { useState } from 'react';
import type { MoveNode } from '../types';
import {
  resolveNodeVisualStyle,
  NODE_BODY_COLOR_VAR,
  NODE_BORDER_COLOR_VAR,
  CANCEL_RUSH_MOVE_NAME,
} from '../utils/nodeVisualStyle';
import { NODE_DEFAULT_HEIGHT, isTutorialNode, nodeWidthFor } from '../utils/nodeSizing';
import { applyManualLineBreaks } from '../utils/textDisplay';

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
  // グループ化モード関連（コピーモードと同じ考え方。グループ化モード中でない時はすべて未指定でよい）
  isGroupModeActive?: boolean;
  isGroupAnchor?: boolean;
  isGroupCandidate?: boolean;
  isGroupSelected?: boolean;
  // 展開表示中の名前付きグループの先頭ノードにのみ渡す。「折りたたむ」バッジを出す
  groupBadge?: { groupName: string; onCollapse: () => void };
  // クリップボードをドラッグ&ドロップで貼り付けられた時に呼ばれる
  onPasteDrop?: () => void;
  // trueの間、枠をパルスさせて注意を引く（誘導ガイド向け。呼び出し側が
  // 「今このノードをクリックしてほしい」を判断する）
  isGuideTarget?: boolean;
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
  isGroupModeActive = false,
  isGroupAnchor = false,
  isGroupCandidate = false,
  isGroupSelected = false,
  groupBadge,
  onPasteDrop,
  isGuideTarget = false,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const isLeaf = node.children.length === 0;
  const visual = resolveNodeVisualStyle(node.moveName, node.attributes);

  // 「キャンセルラッシュ」は名前が長く見切れやすいため、呼び名が未設定の場合に限り
  // デフォルトで改行位置を指定する（呼び名が設定されていればそちらを優先する）
  const displayLabel =
    !node.displayName && node.moveName === CANCEL_RUSH_MOVE_NAME
      ? 'キャンセル｜ラッシュ'
      : node.displayName || node.moveName;

  const isPicked = isCopyAnchor || isCopySelected || isGroupAnchor || isGroupSelected;

  // コピー/グループ化モード中は「起点/候補ではないノード」をクリックできないようにするため、
  // 通常の選択リング（isSelected）ではなくそれ専用の枠色を優先する
  const borderColor = isPicked
    ? 'var(--accent)'
    : isDragOver || isSelected
      ? 'var(--accent)'
      : NODE_BORDER_COLOR_VAR[visual.borderColorKind];

  const isDisabledMode = isCopyModeActive || isGroupModeActive;
  const isInactiveDuringMode =
    (isCopyModeActive && !isCopyAnchor && !isCopyCandidate) ||
    (isGroupModeActive && !isGroupAnchor && !isGroupCandidate);

  return (
    <div
      id={`node-${node.id}`}
      draggable={!isRoot && !readOnly && !isDisabledMode}
      onDragStart={(event) => {
        if (readOnly || isDisabledMode) return;
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
        width: nodeWidthFor(node),
        minHeight: NODE_DEFAULT_HEIGHT,
        borderRadius: 'var(--radius-lg)',
        position: 'relative',
        background: NODE_BODY_COLOR_VAR[visual.bodyColorKind],
        border: `${visual.borderWidth === 'thick' || isPicked ? 3 : 1.5}px ${isCopyAnchor || isGroupAnchor ? 'dashed' : visual.borderStyle} ${borderColor}`,
        boxShadow: isSelected ? '0 0 0 3px var(--accent-glow)' : 'none',
        padding: '5px 6px',
        textAlign: 'center',
        opacity: isInactiveDuringMode ? 0.35 : 1,
        cursor: isInactiveDuringMode ? 'default' : 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
        ...(isGuideTarget ? { animation: 'tutorialGuidePulse 1.6s ease-in-out infinite' } : {}),
      }}
    >
      {(isCopySelected || isGroupSelected) && (
        <span
          title={isGroupSelected ? 'グループ化対象' : 'コピー対象'}
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

      {groupBadge && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            groupBadge.onCollapse();
          }}
          title={`「${groupBadge.groupName}」として折りたたむ`}
          style={{
            position: 'absolute',
            left: -5,
            bottom: -5,
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '1.5px solid var(--accent)',
            background: 'var(--bg-surface)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            cursor: 'pointer',
          }}
        >
          🔗
        </button>
      )}

      {visual.hasDelay && (
        <span
          title={node.specialNote || 'ディレイ'}
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: 'var(--node-delay-badge)',
            border: '1.5px solid var(--bg-surface)',
          }}
        />
      )}

      {node.branchStats?.isFavorite && (
        <span
          title="お気に入り登録済み"
          style={{
            position: 'absolute',
            bottom: -6,
            right: -6,
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          ⭐
        </span>
      )}

      <span
        style={{
          fontSize: 10,
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
        title={
          isRoot && node.startingMoveOptions && node.startingMoveOptions.length > 0
            ? `汎用コンボ（対象の始動技: ${node.startingMoveOptions.map((chain) => chain.join('→')).join(' / ')}）`
            : node.moveName
        }
      >
        {applyManualLineBreaks(displayLabel)}
      </span>

      {node.specialNote && (
        <span
          style={{
            // デフォルトズームを100%→75%に下げた分を考慮しつつ、大きすぎると
            // 幅に収まらずすぐ省略記号(…)で見切れてしまうため、8pxと12pxの間で調整
            // （ユーザー確認済み）。あわせてこの特殊記入があるノードだけ横幅を広げている
            // （nodeWidthFor参照）。チュートリアル用ノードだけは説明文が長めなため、
            // 省略せず折り返して全文見せる（実キャラのノードは従来通り1行で省略表示）
            fontSize: 10,
            color: 'var(--text-secondary)',
            marginTop: 1,
            maxWidth: '100%',
            ...(isTutorialNode(node)
              ? { overflowWrap: 'break-word' as const }
              : {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }),
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
