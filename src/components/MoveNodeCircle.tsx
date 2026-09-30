// src/components/MoveNodeCircle.tsx
// 角丸長方形の技ノード（企画書7〜8ページ）。Rootedの矩形カード(TaskNodeCard)とは異なり、
// 基本は技名のみ表示する。ドラッグ&ドロップの実装パターンはTaskNodeCardを踏襲。
// 幅は固定し、高さは技名の行数（最大2行）に応じて伸縮させることで、
// 円形だった頃より縦のスペースを取らないようにしている。

import type { MoveNode } from '../types';
import {
  resolveNodeVisualStyle,
  NODE_BODY_COLOR_VAR,
  NODE_BORDER_COLOR_VAR,
} from '../utils/nodeVisualStyle';
import { NODE_DEFAULT_HEIGHT, isTutorialNode, nodeWidthFor } from '../utils/nodeSizing';
import { applyManualLineBreaks, resolveDisplayLabel } from '../utils/textDisplay';
import { useDragOverZone, useIsDragSource } from '../utils/nodeDragController';

type Props = {
  node: MoveNode;
  isRoot?: boolean;
  isSelected: boolean;
  onClick: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  // ドラッグ開始（mousedown）時に呼ぶ。ドラッグ元・ドロップ先の判定や実際の付け替え/
  // 並び替え処理はすべてnodeDragController.tsのstartNodeDragが行うため、呼び出し側
  // （ComboTreePage.tsx）はcharacterId・このノードのidとparentIdを渡すだけの
  // 薄いラッパーを渡せばよい（isRootのノード等、渡さない場合はドラッグ不可になる）
  onDragMouseDown?: (event: React.MouseEvent) => void;
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
  onDragMouseDown,
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
  isGuideTarget = false,
}: Props) {
  const isLeaf = node.children.length === 0;
  const visual = resolveNodeVisualStyle(node.moveName, node.attributes);

  const displayLabel = resolveDisplayLabel(node);

  const isPicked = isCopyAnchor || isCopySelected || isGroupAnchor || isGroupSelected;
  // 他のノードをドラッグ中、自分の上にカーソルが重なっているか、重なっているなら
  // 子として追加('child')・直前/直後に兄弟として挿入('before'/'after')のどれを指しているか。
  // 以前のHTML5 D&D実装ではonDragOver由来のisDragOver状態でこの枠色ハイライトを出していた
  const dragOverZone = useDragOverZone(node.id);
  const isDragOverChild = dragOverZone === 'child';
  // 自分自身がドラッグされている最中か。以前はブラウザの標準D&Dが自動でドラッグ元を
  // 半透明にしていたが、mousedownベースの自前実装ではその見た目が無いため、ここで代替する
  const isDragSource = useIsDragSource(node.id);

  // コピー/グループ化モード中は「起点/候補ではないノード」をクリックできないようにするため、
  // 通常の選択リング（isSelected）ではなくそれ専用の枠色を優先する
  const borderColor = isPicked
    ? 'var(--accent)'
    : isDragOverChild || isSelected
      ? 'var(--accent)'
      : NODE_BORDER_COLOR_VAR[visual.borderColorKind];

  const isDisabledMode = isCopyModeActive || isGroupModeActive;
  const isInactiveDuringMode =
    (isCopyModeActive && !isCopyAnchor && !isCopyCandidate) ||
    (isGroupModeActive && !isGroupAnchor && !isGroupCandidate);

  return (
    <div
      id={`node-${node.id}`}
      onMouseDown={(event) => {
        if (isRoot || readOnly || isDisabledMode) return;
        onDragMouseDown?.(event);
      }}
      onClick={onClick}
      className="flex flex-col items-center justify-center select-none"
      style={{
        width: nodeWidthFor(node),
        minHeight: NODE_DEFAULT_HEIGHT,
        borderRadius: 'var(--radius-lg)',
        position: 'relative',
        background: NODE_BODY_COLOR_VAR[visual.bodyColorKind],
        border: `${visual.borderWidth === 'thick' || isPicked || isDragOverChild ? 3 : 1.5}px ${isCopyAnchor || isGroupAnchor ? 'dashed' : visual.borderStyle} ${borderColor}`,
        boxShadow: isSelected || isDragOverChild ? '0 0 0 3px var(--accent-glow)' : 'none',
        padding: '5px 6px',
        textAlign: 'center',
        opacity: isDragSource ? 0.4 : isInactiveDuringMode ? 0.35 : 1,
        cursor: isInactiveDuringMode ? 'default' : 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
        ...(isGuideTarget ? { animation: 'tutorialGuidePulse 1.6s ease-in-out infinite' } : {}),
      }}
    >
      {/* ドロップ先の上寄り/下寄りにカーソルがある間だけ、挿入先を示す線を出す
          （中央付近＝子として追加ならisDragOverChildのボーダー光で示すため、ここでは出さない） */}
      {(dragOverZone === 'before' || dragOverZone === 'after') && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            [dragOverZone === 'before' ? 'top' : 'bottom']: -4,
            height: 3,
            borderRadius: 999,
            background: 'var(--accent)',
            boxShadow: '0 0 6px var(--accent)',
            pointerEvents: 'none',
          }}
        />
      )}

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

      {/* ディレイ・コンボ終了は、チェックを入れたこと自体が見た目でも分かるよう
          小さなバッジで示す（2026-09-30ユーザー要望）。両方並ぶ場合に重ならないよう
          1つの行にまとめる。ディレイ＝丸・ピンク、コンボ終了＝角・赤で形と色の両方を
          変え、小さいサイズでも見分けやすくしている */}
      {(visual.hasDelay || visual.hasComboEnd) && (
        <div style={{ position: 'absolute', top: -2, right: -2, display: 'flex', gap: 3 }}>
          {visual.hasDelay && (
            <span
              title={node.specialNote || 'ディレイ'}
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: 'var(--node-delay-badge)',
                border: '1.5px solid var(--bg-surface)',
              }}
            />
          )}
          {visual.hasComboEnd && (
            <span
              title="コンボ終了（ここで1本のコンボが終わり、以降は別のコンボとして計算されます）"
              style={{
                width: 11,
                height: 11,
                borderRadius: 3,
                background: 'var(--node-combo-end-badge)',
                border: '1.5px solid var(--bg-surface)',
              }}
            />
          )}
        </div>
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
            ? `汎用コンボ（対象の始動技: ${node.startingMoveOptions.map((chain) => chain.join('→')).join('、')}）`
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
