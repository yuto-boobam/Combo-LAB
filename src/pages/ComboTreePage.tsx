// src/pages/ComboTreePage.tsx
// コンボの木を表示・編集する画面（企画書7〜9ページ）。
// キャンバスの構造（レイアウト計算・パン・ズーム・接続線）はRootedのTreePage.tsxを踏襲するが、
// ノードは円形（MoveNodeCircle）で、追加はTab/Enterではなく常時表示のサイドドロワー経由。

import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store';
import Header from '../components/Header';
import { MoveNodeCircle } from '../components/MoveNodeCircle';
import { SideDrawerPanel } from '../components/combo/SideDrawerPanel';
import type { MoveNode } from '../types';
import {
  computeTreeLayout,
  useNodeHeights,
  useTreeExpandAnimation,
  findNode,
  buildParentMap,
  ConnectionsOverlay,
  type TreeColumn,
} from '../lib/tree';
import {
  TREE_LAYOUT_CONFIG,
  CANVAS_PADDING,
  EXIT_TRANSITION_MS,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
} from './ComboTreePage.config';

type DraggedNodeData = { id: string; parentId: string | null; index: number };

const {
  cardWidth: NODE_WIDTH,
  rootWidth: ROOT_WIDTH,
  dropZoneHeight: DROP_ZONE_HEIGHT,
} = TREE_LAYOUT_CONFIG;

export function ComboTreePage() {
  const characters = useAppStore((state) => state.characters);
  const selectedCharacterId = useAppStore((state) => state.selectedCharacterId);
  const selectedComboTreeId = useAppStore((state) => state.selectedComboTreeId);
  const goToCharacterHome = useAppStore((state) => state.goToCharacterHome);
  const collapsedNodeIds = useAppStore((state) => state.collapsedNodeIds);
  const toggleNodeExpanded = useAppStore((state) => state.toggleNodeExpanded);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const selectNode = useAppStore((state) => state.selectNode);
  const moveNode = useAppStore((state) => state.moveNode);

  const character = useMemo(
    () => characters.find((item) => item.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  );

  const tree = useMemo(
    () => character?.comboTrees.find((item) => item.id === selectedComboTreeId) ?? null,
    [character, selectedComboTreeId],
  );

  const root = tree?.root ?? null;

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

  // ── ノードごとの開閉状態
  const collapsedSet = useMemo(() => new Set(collapsedNodeIds), [collapsedNodeIds]);

  // ── 列（カラム）の構築
  const columns = useMemo<TreeColumn<MoveNode>[]>(() => {
    if (!root) return [];

    const nextColumns: TreeColumn<MoveNode>[] = [];

    const visit = (node: MoveNode, depth: number) => {
      if (node.children.length === 0) return;
      if (depth > 0 && collapsedSet.has(node.id)) return;

      nextColumns.push({ parentId: node.id, nodes: node.children, depth });
      for (const child of node.children) {
        visit(child, depth + 1);
      }
    };

    visit(root, 0);
    return nextColumns;
  }, [root, collapsedSet]);

  const parentOf = useMemo(
    () => (root ? buildParentMap(root) : new Map<string, string>()),
    [root],
  );

  const nodeHeights = useNodeHeights(zoom);

  const layout = useMemo(() => {
    if (!root) return null;
    return computeTreeLayout(root, collapsedSet, nodeHeights, TREE_LAYOUT_CONFIG);
  }, [root, collapsedSet, nodeHeights]);

  const { exitingNodes, enteringNodes } = useTreeExpandAnimation(
    layout,
    parentOf,
    EXIT_TRANSITION_MS,
  );

  if (!character || !tree || !root) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
        <Header onLogoClick={goToCharacterHome} />
        <main
          className="flex-1 flex items-center justify-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          <p>コンボの木が見つかりませんでした。</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Header
        onLogoClick={goToCharacterHome}
        title={`${character.name} / ${tree.label}`}
        rightSlot={<ZoomBar zoom={zoom} onChange={setZoom} />}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* ── ツリービュー本体 */}
        <div ref={scrollRef} className="flex-1 overflow-auto" style={{ position: 'relative' }}>
          <div
            style={{
              position: 'relative',
              width: ((layout?.width ?? 0) + CANVAS_PADDING * 2) * zoom,
              height: ((layout?.height ?? 0) + CANVAS_PADDING * 2) * zoom,
            }}
          >
            <div
              onMouseDown={handleCanvasMouseDown}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: (layout?.width ?? 0) + CANVAS_PADDING * 2,
                height: (layout?.height ?? 0) + CANVAS_PADDING * 2,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                cursor: isPanning ? 'grabbing' : 'grab',
                userSelect: isPanning ? 'none' : undefined,
              }}
            >
              <ConnectionsOverlay columns={columns} zoom={zoom} layout={layout} />

              {/* ルートノード */}
              <div
                style={{
                  position: 'absolute',
                  left: CANVAS_PADDING,
                  top: CANVAS_PADDING,
                  width: ROOT_WIDTH,
                  transform: `translate(${layout?.positions.get(root.id)?.x ?? 0}px, ${layout?.positions.get(root.id)?.y ?? 0}px)`,
                  transition: 'transform 220ms ease',
                }}
              >
                <MoveNodeCircle
                  node={root}
                  isRoot
                  isSelected={selectedNodeId === root.id}
                  onClick={() => selectNode(root.id)}
                  isExpanded={!collapsedSet.has(root.id)}
                  onToggleExpand={
                    root.children.length > 0 ? () => toggleNodeExpanded(root.id) : undefined
                  }
                  parentId={null}
                  dragIndex={0}
                  onDrop={(draggedData: DraggedNodeData) => {
                    if (draggedData.id === root.id) return;
                    moveNode(character.id, tree.id, draggedData.id, root.id);
                  }}
                />
              </div>

              {/* 各ノード */}
              {columns.flatMap((column) =>
                column.nodes.map((node, nodeIndex) => {
                  const pos = layout?.positions.get(node.id);
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
                        onClick={() => selectNode(node.id)}
                        isExpanded={!collapsedSet.has(node.id)}
                        onToggleExpand={
                          node.children.length > 0 ? () => toggleNodeExpanded(node.id) : undefined
                        }
                        parentId={column.parentId}
                        dragIndex={nodeIndex}
                        onDrop={(draggedData: DraggedNodeData) => {
                          if (draggedData.id === node.id) return;
                          moveNode(character.id, tree.id, draggedData.id, node.id);
                        }}
                      />
                    </div>
                  );
                }),
              )}

              {/* 閉じて消えていくノード */}
              {Array.from(exitingNodes.entries())
                .filter(([id]) => !layout?.positions.has(id))
                .map(([id, pos]) => {
                  const node = findNode(root, id);
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

              {/* 兄弟間ドロップゾーン */}
              {layout?.dropZones.map((dropZone) => (
                <div
                  key={dropZone.key}
                  style={{
                    position: 'absolute',
                    left: CANVAS_PADDING + dropZone.x,
                    top: CANVAS_PADDING + dropZone.y,
                    width: NODE_WIDTH,
                    height: DROP_ZONE_HEIGHT,
                  }}
                >
                  <DropZone
                    onDrop={(data) => {
                      if (data.id === dropZone.parentId) return;
                      moveNode(
                        character.id,
                        tree.id,
                        data.id,
                        dropZone.parentId,
                        dropZone.insertIndex,
                      );
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── サイドドロワー（常時表示） */}
        <SideDrawerPanel characterId={character.id} treeId={tree.id} root={root} />
      </div>
    </div>
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
