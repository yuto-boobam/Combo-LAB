// src/pages/ComboTreePage.tsx
// コンボの木を表示・編集する画面（企画書7〜9ページ）。
// キャンバスの構造（レイアウト計算・パン・ズーム・接続線）はRootedのTreePage.tsxを踏襲するが、
// ノードは円形（MoveNodeCircle）で、追加はTab/Enterではなく常時表示のサイドドロワー経由。
//
// 1キャラは始動技ごとに複数の木（森）を持つ。すべての木は1本ずつのカード画面に分けず、
// この1つのキャンバス内に縦に並べて同時表示する（木ごとにラベルを付けて見分ける）。

import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppStore, useVisibleCharacters } from '../store';
import Header from '../components/Header';
import { MoveNodeCircle } from '../components/MoveNodeCircle';
import { SideDrawerPanel } from '../components/combo/SideDrawerPanel';
import type { ComboTree, MoveNode } from '../types';
import { resolveBorderColorKind, NODE_LINE_COLOR_VAR } from '../utils/nodeVisualStyle';
import { findNodeInComboTrees } from '../utils/comboTreeSearch';
import {
  computeTreeLayout,
  useNodeHeights,
  useTreeExpandAnimation,
  buildParentMap,
  ConnectionsOverlay,
  type DropZoneSpec,
  type NodePosition,
  type TreeColumn,
  type TreeLayout,
} from '../lib/tree';
import {
  TREE_LAYOUT_CONFIG,
  CANVAS_PADDING,
  TREE_BLOCK_GAP,
  EXIT_TRANSITION_MS,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
} from './ComboTreePage.config';

type DraggedNodeData = { id: string; parentId: string | null; index: number };

// 木をまたいでも接続線・ドロップ先を判別できるよう、どの木に属するかをタグ付けする
type TaggedColumn = TreeColumn<MoveNode> & { treeId: string };
type TaggedDropZone = DropZoneSpec & { treeId: string };

/** 接続線（親→子）は、子ノード自身の枠線色（カウンター/パニッシュカウンター/ラッシュ属性）に合わせる */
function getBranchLineColor(_column: TreeColumn<MoveNode>, childNode: MoveNode): string {
  return NODE_LINE_COLOR_VAR[resolveBorderColorKind(childNode.attributes)];
}

type TreeBlock = {
  tree: ComboTree;
  offsetY: number;
  columns: TaggedColumn[];
};

const {
  cardWidth: NODE_WIDTH,
  rootWidth: ROOT_WIDTH,
  dropZoneHeight: DROP_ZONE_HEIGHT,
} = TREE_LAYOUT_CONFIG;

function shiftPositions(
  positions: Map<string, NodePosition>,
  offsetY: number,
): Map<string, NodePosition> {
  const shifted = new Map<string, NodePosition>();
  positions.forEach((pos, id) => shifted.set(id, { ...pos, y: pos.y + offsetY }));
  return shifted;
}

export function ComboTreePage() {
  const characters = useVisibleCharacters();
  const isGuest = useAppStore((state) => state.isGuest);
  const selectedCharacterId = useAppStore((state) => state.selectedCharacterId);
  const goToCharacterHome = useAppStore((state) => state.goToCharacterHome);
  const collapsedNodeIds = useAppStore((state) => state.collapsedNodeIds);
  const toggleNodeExpanded = useAppStore((state) => state.toggleNodeExpanded);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const selectNode = useAppStore((state) => state.selectNode);
  const moveNode = useAppStore((state) => state.moveNode);
  const deleteComboTree = useAppStore((state) => state.deleteComboTree);
  const moveComboTree = useAppStore((state) => state.moveComboTree);
  const copyModeAnchorId = useAppStore((state) => state.copyModeAnchorId);
  const copySelectedIds = useAppStore((state) => state.copySelectedIds);
  const toggleCopySelection = useAppStore((state) => state.toggleCopySelection);
  const pasteClipboard = useAppStore((state) => state.pasteClipboard);

  const character = useMemo(
    () => characters.find((item) => item.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  );

  const trees = useMemo(() => character?.comboTrees ?? [], [character]);

  // ── コピーモード: 起点ノード＋その子孫だけが選択候補になる
  const copyCandidateIds = useMemo(() => {
    if (!copyModeAnchorId) return null;

    const anchorNode = findNodeInComboTrees(trees, copyModeAnchorId)?.node ?? null;
    if (!anchorNode) return null;

    const ids = new Set<string>();
    const collect = (node: MoveNode) => {
      ids.add(node.id);
      node.children.forEach(collect);
    };
    collect(anchorNode);
    return ids;
  }, [trees, copyModeAnchorId]);

  const copySelectedSet = useMemo(() => new Set(copySelectedIds), [copySelectedIds]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (copyModeAnchorId) {
        if (copyCandidateIds?.has(nodeId)) toggleCopySelection(nodeId);
        return;
      }
      selectNode(nodeId);
    },
    [copyModeAnchorId, copyCandidateIds, toggleCopySelection, selectNode],
  );

  // ── 画面比率（ズーム）
  const [zoom, setZoom] = useState(1);

  // ── ドラッグで画面を動かす（パン）
  const scrollRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const handleCanvasMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.button !== 0) return;

      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      panStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: scrollEl.scrollLeft,
        scrollTop: scrollEl.scrollTop,
      };
      setIsPanning(true);

      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const panState = panStateRef.current;
        const scrollTarget = scrollRef.current;
        if (!panState || !scrollTarget) return;

        scrollTarget.scrollLeft = panState.scrollLeft - (moveEvent.clientX - panState.startX);
        scrollTarget.scrollTop = panState.scrollTop - (moveEvent.clientY - panState.startY);
      };

      const handleMouseUp = () => {
        panStateRef.current = null;
        setIsPanning(false);
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [],
  );

  // ── ノードごとの開閉状態（木をまたいでもノードIDは一意なので共通のSetでよい）
  const collapsedSet = useMemo(() => new Set(collapsedNodeIds), [collapsedNodeIds]);

  const nodeHeights = useNodeHeights(zoom);

  // ── すべての木を縦に積み上げて1つのキャンバスにする
  const forest = useMemo(() => {
    let cursorY = 0;
    let maxWidth = 0;
    const blocks: TreeBlock[] = [];
    const positions = new Map<string, NodePosition>();
    const dropZones: TaggedDropZone[] = [];
    const parentOf = new Map<string, string>();

    trees.forEach((tree) => {
      const layout = computeTreeLayout(tree.root, collapsedSet, nodeHeights, TREE_LAYOUT_CONFIG);

      const columns: TaggedColumn[] = [];
      const visit = (node: MoveNode, depth: number) => {
        if (node.children.length === 0) return;
        if (depth > 0 && collapsedSet.has(node.id)) return;

        columns.push({ parentId: node.id, nodes: node.children, depth, treeId: tree.id });
        for (const child of node.children) {
          visit(child, depth + 1);
        }
      };
      visit(tree.root, 0);

      const offsetY = cursorY;
      shiftPositions(layout.positions, offsetY).forEach((pos, id) => positions.set(id, pos));
      layout.dropZones.forEach((dropZone) =>
        dropZones.push({ ...dropZone, y: dropZone.y + offsetY, treeId: tree.id }),
      );
      buildParentMap(tree.root).forEach((parentId, id) => parentOf.set(id, parentId));

      blocks.push({ tree, offsetY, columns });
      maxWidth = Math.max(maxWidth, layout.width);
      cursorY += layout.height + TREE_BLOCK_GAP;
    });

    const totalHeight = blocks.length > 0 ? cursorY - TREE_BLOCK_GAP : 0;
    const layout: TreeLayout = { positions, dropZones, width: maxWidth, height: totalHeight };

    return { blocks, layout, parentOf, columns: blocks.flatMap((block) => block.columns) };
  }, [trees, collapsedSet, nodeHeights]);

  const { exitingNodes, enteringNodes } = useTreeExpandAnimation(
    forest.layout,
    forest.parentOf,
    EXIT_TRANSITION_MS,
  );

  if (!character) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
        <Header onLogoClick={goToCharacterHome} />
        <main
          className="flex-1 flex items-center justify-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          <p>キャラクターが見つかりませんでした。</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Header
        onLogoClick={goToCharacterHome}
        title={`${character.name} のコンボ — ${trees.length}本`}
        character={character}
        rightSlot={<ZoomBar zoom={zoom} onChange={setZoom} />}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* ── ツリービュー本体 */}
        <div ref={scrollRef} className="flex-1 overflow-auto" style={{ position: 'relative' }}>
          {trees.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 h-full">
              <div className="text-6xl">🌳</div>
              <p style={{ color: 'var(--text-secondary)' }}>
                まだコンボの木がありません。右のパネルから始動技を入力して作成しましょう。
              </p>
            </div>
          ) : (
            <div
              style={{
                position: 'relative',
                width: (forest.layout.width + CANVAS_PADDING * 2) * zoom,
                height: (forest.layout.height + CANVAS_PADDING * 2) * zoom,
              }}
            >
              <div
                onMouseDown={handleCanvasMouseDown}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: forest.layout.width + CANVAS_PADDING * 2,
                  height: forest.layout.height + CANVAS_PADDING * 2,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  cursor: isPanning ? 'grabbing' : 'grab',
                  userSelect: isPanning ? 'none' : undefined,
                }}
              >
                <ConnectionsOverlay
                  columns={forest.columns}
                  zoom={zoom}
                  layout={forest.layout}
                  getLinkColor={getBranchLineColor}
                />

                {/* 木ごとのラベル・ルートノード */}
                {forest.blocks.map((block, blockIndex) => {
                  const rootPos = forest.layout.positions.get(block.tree.root.id);
                  if (!rootPos) return null;

                  return (
                    <TreeBlockHeader
                      key={block.tree.id}
                      tree={block.tree}
                      x={rootPos.x}
                      offsetY={block.offsetY}
                      onDelete={
                        isGuest
                          ? undefined
                          : () => {
                              const ok = window.confirm(`「${block.tree.label}」を削除しますか？`);
                              if (ok) deleteComboTree(character.id, block.tree.id);
                            }
                      }
                      onMoveUp={
                        isGuest || blockIndex === 0
                          ? undefined
                          : () => moveComboTree(character.id, block.tree.id, 'up')
                      }
                      onMoveDown={
                        isGuest || blockIndex === forest.blocks.length - 1
                          ? undefined
                          : () => moveComboTree(character.id, block.tree.id, 'down')
                      }
                    />
                  );
                })}

                {forest.blocks.map((block) => {
                  const rootPos = forest.layout.positions.get(block.tree.root.id);
                  if (!rootPos) return null;

                  return (
                    <div
                      key={block.tree.id}
                      style={{
                        position: 'absolute',
                        left: CANVAS_PADDING,
                        top: CANVAS_PADDING,
                        width: ROOT_WIDTH,
                        transform: `translate(${rootPos.x}px, ${rootPos.y}px)`,
                        transition: 'transform 220ms ease',
                      }}
                    >
                      <MoveNodeCircle
                        node={block.tree.root}
                        isRoot
                        isSelected={selectedNodeId === block.tree.root.id}
                        onClick={() => handleNodeClick(block.tree.root.id)}
                        isExpanded={!collapsedSet.has(block.tree.root.id)}
                        onToggleExpand={
                          block.tree.root.children.length > 0
                            ? () => toggleNodeExpanded(block.tree.root.id)
                            : undefined
                        }
                        parentId={null}
                        dragIndex={0}
                        readOnly={isGuest}
                        onDrop={(draggedData: DraggedNodeData) => {
                          if (draggedData.id === block.tree.root.id) return;
                          moveNode(character.id, block.tree.id, draggedData.id, block.tree.root.id);
                        }}
                        isCopyModeActive={copyModeAnchorId !== null}
                        isCopyAnchor={copyModeAnchorId === block.tree.root.id}
                        isCopyCandidate={copyCandidateIds?.has(block.tree.root.id) ?? false}
                        isCopySelected={copySelectedSet.has(block.tree.root.id)}
                        onPasteDrop={() => pasteClipboard(character.id, block.tree.id, block.tree.root.id)}
                      />
                    </div>
                  );
                })}

                {/* 各ノード */}
                {forest.columns.flatMap((column) =>
                  column.nodes.map((node, nodeIndex) => {
                    const pos = forest.layout.positions.get(node.id);
                    if (!pos) return null;

                    const renderPos = enteringNodes.get(node.id) ?? pos;

                    return (
                      <div
                        key={node.id}
                        style={{
                          position: 'absolute',
                          left: CANVAS_PADDING,
                          top: CANVAS_PADDING,
                          width: NODE_WIDTH,
                          transform: `translate(${renderPos.x}px, ${renderPos.y}px)`,
                          transition: 'transform 220ms ease',
                        }}
                      >
                        <MoveNodeCircle
                          node={node}
                          isSelected={selectedNodeId === node.id}
                          onClick={() => handleNodeClick(node.id)}
                          isExpanded={!collapsedSet.has(node.id)}
                          onToggleExpand={
                            node.children.length > 0 ? () => toggleNodeExpanded(node.id) : undefined
                          }
                          parentId={column.parentId}
                          dragIndex={nodeIndex}
                          readOnly={isGuest}
                          onDrop={(draggedData: DraggedNodeData) => {
                            if (draggedData.id === node.id) return;
                            moveNode(character.id, column.treeId, draggedData.id, node.id);
                          }}
                          isCopyModeActive={copyModeAnchorId !== null}
                          isCopyAnchor={copyModeAnchorId === node.id}
                          isCopyCandidate={copyCandidateIds?.has(node.id) ?? false}
                          isCopySelected={copySelectedSet.has(node.id)}
                          onPasteDrop={() => pasteClipboard(character.id, column.treeId, node.id)}
                        />
                      </div>
                    );
                  }),
                )}

                {/* 閉じて消えていくノード */}
                {Array.from(exitingNodes.entries())
                  .filter(([id]) => !forest.layout.positions.has(id))
                  .map(([id, pos]) => {
                    const node = findNodeInComboTrees(trees, id)?.node ?? null;
                    if (!node) return null;

                    return (
                      <div
                        key={id}
                        style={{
                          position: 'absolute',
                          left: CANVAS_PADDING,
                          top: CANVAS_PADDING,
                          width: NODE_WIDTH,
                          transform: `translate(${pos.x}px, ${pos.y}px)`,
                          transition: `transform ${EXIT_TRANSITION_MS}ms ease, opacity ${EXIT_TRANSITION_MS}ms ease`,
                          opacity: 0,
                          pointerEvents: 'none',
                        }}
                      >
                        <MoveNodeCircle
                          node={node}
                          isSelected={false}
                          onClick={() => {
                            // フェードアウト中は操作不可
                          }}
                          parentId={null}
                          dragIndex={0}
                          onDrop={() => {
                            // フェードアウト中は操作不可
                          }}
                        />
                      </div>
                    );
                  })}

                {/* 兄弟間ドロップゾーン（閲覧専用モードでは並び替え不可のため出さない） */}
                {!isGuest &&
                  forest.layout.dropZones.map((dropZone) => {
                    const tagged = dropZone as TaggedDropZone;
                    return (
                      <div
                        key={tagged.key}
                        style={{
                          position: 'absolute',
                          left: CANVAS_PADDING + tagged.x,
                          top: CANVAS_PADDING + tagged.y,
                          width: NODE_WIDTH,
                          height: DROP_ZONE_HEIGHT,
                        }}
                      >
                        <DropZone
                          onDrop={(data) => {
                            if (data.id === tagged.parentId) return;
                            moveNode(
                              character.id,
                              tagged.treeId,
                              data.id,
                              tagged.parentId,
                              tagged.insertIndex,
                            );
                          }}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* ── サイドドロワー（常時表示） */}
        <SideDrawerPanel characterId={character.id} comboTrees={trees} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 木ごとのラベル（始動技名・手数・削除ボタン）
// ────────────────────────────────────────────────────────────

function TreeBlockHeader({
  tree,
  x,
  offsetY,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  tree: ComboTree;
  x: number;
  offsetY: number;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: CANVAS_PADDING + x,
        top: CANVAS_PADDING + offsetY - 34,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>
        {tree.label}
      </span>

      {(onMoveUp || onMoveDown) && (
        <div style={{ display: 'flex', gap: 2 }}>
          <ReorderButton direction="up" onClick={onMoveUp} title="この木を1つ上に移動" />
          <ReorderButton direction="down" onClick={onMoveDown} title="この木を1つ下に移動" />
        </div>
      )}

      {onDelete && (
        <button
          type="button"
          className="btn-icon"
          onClick={onDelete}
          title="この木を削除"
          style={{ width: 18, height: 18 }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

function ReorderButton({
  direction,
  onClick,
  title,
}: {
  direction: 'up' | 'down';
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className="btn-icon"
      onClick={onClick}
      disabled={!onClick}
      title={title}
      style={{ width: 18, height: 18, opacity: onClick ? 1 : 0.3 }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        {direction === 'up' ? <polyline points="18,15 12,9 6,15" /> : <polyline points="6,9 12,15 18,9" />}
      </svg>
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// 兄弟間ドロップゾーン
// ────────────────────────────────────────────────────────────

function DropZone({ onDrop }: { onDrop: (data: DraggedNodeData) => void }) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setIsOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsOver(false);

        try {
          const rawData = event.dataTransfer.getData('application/json');
          const parsedData = JSON.parse(rawData) as Partial<DraggedNodeData>;

          if (parsedData && typeof parsedData.id === 'string') {
            onDrop({
              id: parsedData.id,
              parentId:
                typeof parsedData.parentId === 'string' ? parsedData.parentId : null,
              index: typeof parsedData.index === 'number' ? parsedData.index : 0,
            });
          }
        } catch (error) {
          console.error('Drop error', error);
        }
      }}
      className="flex-shrink-0 flex items-center justify-center transition-all duration-150"
      style={{
        height: DROP_ZONE_HEIGHT,
        width: '100%',
        position: 'relative',
        zIndex: 20,
      }}
    >
      <div
        className="w-full rounded-full transition-all duration-150 pointer-events-none"
        style={{
          height: isOver ? 4 : 0,
          background: 'var(--accent)',
          boxShadow: isOver ? '0 0 8px var(--accent)' : 'none',
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 画面比率（ズーム）バー
// ────────────────────────────────────────────────────────────

function ZoomBar({
  zoom,
  onChange,
}: {
  zoom: number;
  onChange: (zoom: number) => void;
}) {
  const clamp = (value: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));

  return (
    <div
      className="flex-shrink-0 flex items-center gap-2"
      style={{
        height: 32,
        padding: '0 10px',
        borderRadius: 11,
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
      }}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(zoom - ZOOM_STEP))}
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          background: 'transparent',
          color: '#e5e7eb',
          cursor: 'pointer',
          fontSize: 13,
          lineHeight: 1,
        }}
        title="縮小"
      >
        −
      </button>

      <input
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.05}
        value={zoom}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        style={{ width: 80, cursor: 'pointer' }}
      />

      <button
        type="button"
        onClick={() => onChange(clamp(zoom + ZOOM_STEP))}
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          background: 'transparent',
          color: '#e5e7eb',
          cursor: 'pointer',
          fontSize: 13,
          lineHeight: 1,
        }}
        title="拡大"
      >
        ＋
      </button>

      <button
        type="button"
        onClick={() => onChange(1)}
        style={{
          minWidth: 34,
          textAlign: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: '#94a3b8',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
        title="100%に戻す"
      >
        {Math.round(zoom * 100)}%
      </button>
    </div>
  );
}
