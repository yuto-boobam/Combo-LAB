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
import { GroupPillNode } from '../components/GroupPillNode';
import { SideDrawerPanel } from '../components/combo/SideDrawerPanel';
import type { ComboTree, MoveNode } from '../types';
import { resolveBorderColorKind, NODE_LINE_COLOR_VAR } from '../utils/nodeVisualStyle';
import { findNodeInComboTrees } from '../utils/comboTreeSearch';
import { nodeWidthFor } from '../utils/nodeSizing';
import {
  computeTreeLayout,
  useNodeHeights,
  useTreeExpandAnimation,
  buildParentMap,
  buildGroupView,
  ConnectionsOverlay,
  type DropZoneSpec,
  type GroupPillMeta,
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

/** 接続線（親→子）は、子ノード自身の枠線色（カウンター/パニッシュカウンター/ラッシュ属性、またはキャンセルラッシュ技名）に合わせる */
function getBranchLineColor(_column: TreeColumn<MoveNode>, childNode: MoveNode): string {
  return NODE_LINE_COLOR_VAR[resolveBorderColorKind(childNode.moveName, childNode.attributes)];
}

type TreeBlock = {
  tree: ComboTree;
  viewRoot: MoveNode;
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

// computeTreeLayoutへ渡すノードごとの幅の上書き。特殊記入があるノードだけ
// nodeWidthForが広めの値を返すため、木のレイアウト計算とMoveNodeCircleの実際の
// 見た目がズレないようにする
function collectNodeWidths(node: MoveNode, widths: Record<string, number>): void {
  widths[node.id] = nodeWidthFor(node);
  node.children.forEach((child) => collectNodeWidths(child, widths));
}

export function ComboTreePage() {
  const characters = useVisibleCharacters();
  const isGuest = useAppStore((state) => state.isGuest);
  const selectedCharacterId = useAppStore((state) => state.selectedCharacterId);
  const goToCharacterSelect = useAppStore((state) => state.goToCharacterSelect);
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
  const groupModeActive = useAppStore((state) => state.groupModeActive);
  const groupModeAnchorId = useAppStore((state) => state.groupModeAnchorId);
  const groupSelectedIds = useAppStore((state) => state.groupSelectedIds);
  const setGroupModeAnchor = useAppStore((state) => state.setGroupModeAnchor);
  const setGroupSelectedIds = useAppStore((state) => state.setGroupSelectedIds);
  const expandedGroupIds = useAppStore((state) => state.expandedGroupIds);
  const toggleGroupExpanded = useAppStore((state) => state.toggleGroupExpanded);
  const matchModeAnchorId = useAppStore((state) => state.matchModeAnchorId);
  const setMatchSelectedIds = useAppStore((state) => state.setMatchSelectedIds);
  const matchedAnchorIds = useAppStore((state) => state.matchedAnchorIds);
  const startEditingMatch = useAppStore((state) => state.startEditingMatch);

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

  // ── グループ化モード: 起点から分岐のない一本道だけが選択候補になる
  const groupChainIds = useMemo(() => {
    if (!groupModeAnchorId) return null;

    const anchorNode = findNodeInComboTrees(trees, groupModeAnchorId)?.node ?? null;
    if (!anchorNode) return null;

    const chain: string[] = [];
    let cursor: MoveNode | null = anchorNode;
    while (cursor) {
      chain.push(cursor.id);
      cursor = cursor.children.length === 1 ? cursor.children[0] : null;
    }
    return chain;
  }, [trees, groupModeAnchorId]);

  const groupCandidateIds = useMemo(
    () => (groupChainIds ? new Set(groupChainIds) : null),
    [groupChainIds],
  );

  const groupSelectedSet = useMemo(() => new Set(groupSelectedIds), [groupSelectedIds]);

  const expandedGroupSet = useMemo(() => new Set(expandedGroupIds), [expandedGroupIds]);

  // ── 一致検索モード: 起点から分岐のない一本道だけが選択候補になる（グループ化モードと同じ考え方）
  const matchChainIds = useMemo(() => {
    if (!matchModeAnchorId) return null;

    const anchorNode = findNodeInComboTrees(trees, matchModeAnchorId)?.node ?? null;
    if (!anchorNode) return null;

    const chain: string[] = [];
    let cursor: MoveNode | null = anchorNode;
    while (cursor) {
      chain.push(cursor.id);
      cursor = cursor.children.length === 1 ? cursor.children[0] : null;
    }
    return chain;
  }, [trees, matchModeAnchorId]);

  const matchCandidateIds = useMemo(
    () => (matchChainIds ? new Set(matchChainIds) : null),
    [matchChainIds],
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (copyModeAnchorId) {
        if (copyCandidateIds?.has(nodeId)) toggleCopySelection(nodeId);
        return;
      }
      if (groupModeActive) {
        if (!groupModeAnchorId) {
          // 次の枝の起点待ち。分岐の有無に関わらずどのノードでも起点にできる
          setGroupModeAnchor(nodeId);
          return;
        }
        if (groupChainIds && groupModeAnchorId !== nodeId && groupCandidateIds?.has(nodeId)) {
          const index = groupChainIds.indexOf(nodeId);
          setGroupSelectedIds(groupChainIds.slice(1, index + 1));
        }
        return;
      }
      if (matchModeAnchorId) {
        if (matchChainIds && matchModeAnchorId !== nodeId && matchCandidateIds?.has(nodeId)) {
          const index = matchChainIds.indexOf(nodeId);
          setMatchSelectedIds(matchChainIds.slice(1, index + 1));
        }
        return;
      }
      if (matchedAnchorIds?.includes(nodeId)) {
        // 一致箇所の一覧に含まれるノードをクリックしたら、編集前スナップショットを取って選択する
        startEditingMatch(nodeId);
        return;
      }
      selectNode(nodeId);
    },
    [
      copyModeAnchorId,
      copyCandidateIds,
      toggleCopySelection,
      groupModeActive,
      groupModeAnchorId,
      groupChainIds,
      groupCandidateIds,
      setGroupModeAnchor,
      setGroupSelectedIds,
      matchModeAnchorId,
      matchChainIds,
      matchCandidateIds,
      setMatchSelectedIds,
      matchedAnchorIds,
      startEditingMatch,
      selectNode,
    ],
  );

  // ── 画面比率（ズーム）。デフォルトは100%のまま
  // （ノードが大きすぎる問題はズームではなくノード自体の寸法を縮小して対応。nodeSizing.ts参照）
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

  const groupNameById = useMemo(
    () => new Map((character?.namedComboGroups ?? []).map((group) => [group.id, group.name])),
    [character],
  );

  // ── すべての木を縦に積み上げて1つのキャンバスにする。
  // 各木は描画直前に buildGroupView で「表示用の木」に変換してからレイアウト計算に渡す
  // （折りたたまれたグループ区間を1個の合成ノードに差し替える。実データには一切手を入れない）
  const forest = useMemo(() => {
    let cursorY = 0;
    let maxWidth = 0;
    const blocks: TreeBlock[] = [];
    const positions = new Map<string, NodePosition>();
    const dropZones: TaggedDropZone[] = [];
    const parentOf = new Map<string, string>();
    const pillMetaById = new Map<string, GroupPillMeta>();
    const expandedGroupStartMetaById = new Map<string, GroupPillMeta>();

    trees.forEach((tree) => {
      const groupView = buildGroupView(tree.root, groupNameById, expandedGroupSet);
      const viewRoot = groupView.viewRoot;
      groupView.pillMetaById.forEach((meta, id) => pillMetaById.set(id, meta));
      groupView.expandedGroupStartMetaById.forEach((meta, id) => expandedGroupStartMetaById.set(id, meta));

      const nodeWidths: Record<string, number> = {};
      collectNodeWidths(viewRoot, nodeWidths);
      const layout = computeTreeLayout(viewRoot, collapsedSet, nodeHeights, TREE_LAYOUT_CONFIG, nodeWidths);

      const columns: TaggedColumn[] = [];
      const visit = (node: MoveNode, depth: number) => {
        if (node.children.length === 0) return;
        if (collapsedSet.has(node.id)) return;

        columns.push({ parentId: node.id, nodes: node.children, depth, treeId: tree.id });
        for (const child of node.children) {
          visit(child, depth + 1);
        }
      };
      visit(viewRoot, 0);

      const offsetY = cursorY;
      shiftPositions(layout.positions, offsetY).forEach((pos, id) => positions.set(id, pos));
      layout.dropZones.forEach((dropZone) =>
        dropZones.push({ ...dropZone, y: dropZone.y + offsetY, treeId: tree.id }),
      );
      buildParentMap(viewRoot).forEach((parentId, id) => parentOf.set(id, parentId));

      blocks.push({ tree, viewRoot, offsetY, columns });
      maxWidth = Math.max(maxWidth, layout.width);
      cursorY += layout.height + TREE_BLOCK_GAP;
    });

    const totalHeight = blocks.length > 0 ? cursorY - TREE_BLOCK_GAP : 0;
    const layout: TreeLayout = { positions, dropZones, width: maxWidth, height: totalHeight };

    return {
      blocks,
      layout,
      parentOf,
      pillMetaById,
      expandedGroupStartMetaById,
      columns: blocks.flatMap((block) => block.columns),
    };
  }, [trees, collapsedSet, nodeHeights, groupNameById, expandedGroupSet]);

  const { exitingNodes, enteringNodes } = useTreeExpandAnimation(
    forest.layout,
    forest.parentOf,
    EXIT_TRANSITION_MS,
  );

  if (!character) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
        <Header onLogoClick={goToCharacterSelect} />
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
        onLogoClick={goToCharacterSelect}
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
                  const rootPos = forest.layout.positions.get(block.viewRoot.id);
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
                  const rootPos = forest.layout.positions.get(block.viewRoot.id);
                  if (!rootPos) return null;

                  const rootId = block.viewRoot.id;
                  const pillMeta = forest.pillMetaById.get(rootId);

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
                      {pillMeta ? (
                        <GroupPillNode
                          id={rootId}
                          groupName={pillMeta.groupName}
                          memberCount={pillMeta.memberIds.length}
                          hasChildren={block.viewRoot.children.length > 0}
                          isExpanded={!collapsedSet.has(rootId)}
                          onExpand={() => toggleGroupExpanded(rootId)}
                          onToggleExpand={
                            block.viewRoot.children.length > 0
                              ? () => toggleNodeExpanded(rootId)
                              : undefined
                          }
                          parentId={null}
                          dragIndex={0}
                          readOnly={isGuest}
                          isDisabledByOtherMode={copyModeAnchorId !== null || groupModeActive}
                        />
                      ) : (
                        <MoveNodeCircle
                          node={block.viewRoot}
                          isRoot
                          isSelected={selectedNodeId === rootId}
                          onClick={() => handleNodeClick(rootId)}
                          isExpanded={!collapsedSet.has(rootId)}
                          onToggleExpand={
                            block.viewRoot.children.length > 0 ? () => toggleNodeExpanded(rootId) : undefined
                          }
                          parentId={null}
                          dragIndex={0}
                          readOnly={isGuest}
                          onDrop={(draggedData: DraggedNodeData) => {
                            if (draggedData.id === rootId) return;
                            moveNode(character.id, block.tree.id, draggedData.id, rootId);
                          }}
                          isCopyModeActive={copyModeAnchorId !== null}
                          isCopyAnchor={copyModeAnchorId === rootId}
                          isCopyCandidate={copyCandidateIds?.has(rootId) ?? false}
                          isCopySelected={copySelectedSet.has(rootId)}
                          isGroupModeActive={groupModeActive && groupModeAnchorId !== null}
                          isGroupAnchor={groupModeAnchorId === rootId}
                          isGroupCandidate={groupCandidateIds?.has(rootId) ?? false}
                          isGroupSelected={groupSelectedSet.has(rootId)}
                          groupBadge={
                            forest.expandedGroupStartMetaById.has(rootId)
                              ? {
                                  groupName: forest.expandedGroupStartMetaById.get(rootId)!.groupName,
                                  onCollapse: () => toggleGroupExpanded(rootId),
                                }
                              : undefined
                          }
                          onPasteDrop={() => pasteClipboard(character.id, block.tree.id, rootId)}
                        />
                      )}
                    </div>
                  );
                })}

                {/* 各ノード */}
                {forest.columns.flatMap((column) =>
                  column.nodes.map((node, nodeIndex) => {
                    const pos = forest.layout.positions.get(node.id);
                    if (!pos) return null;

                    const renderPos = enteringNodes.get(node.id) ?? pos;
                    const pillMeta = forest.pillMetaById.get(node.id);

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
                        {pillMeta ? (
                          <GroupPillNode
                            id={node.id}
                            groupName={pillMeta.groupName}
                            memberCount={pillMeta.memberIds.length}
                            hasChildren={node.children.length > 0}
                            isExpanded={!collapsedSet.has(node.id)}
                            onExpand={() => toggleGroupExpanded(node.id)}
                            onToggleExpand={
                              node.children.length > 0 ? () => toggleNodeExpanded(node.id) : undefined
                            }
                            parentId={column.parentId}
                            dragIndex={nodeIndex}
                            readOnly={isGuest}
                            isDisabledByOtherMode={copyModeAnchorId !== null || groupModeActive}
                          />
                        ) : (
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
                            isGroupModeActive={groupModeActive && groupModeAnchorId !== null}
                            isGroupAnchor={groupModeAnchorId === node.id}
                            isGroupCandidate={groupCandidateIds?.has(node.id) ?? false}
                            isGroupSelected={groupSelectedSet.has(node.id)}
                            groupBadge={
                              forest.expandedGroupStartMetaById.has(node.id)
                                ? {
                                    groupName: forest.expandedGroupStartMetaById.get(node.id)!.groupName,
                                    onCollapse: () => toggleGroupExpanded(node.id),
                                  }
                                : undefined
                            }
                            onPasteDrop={() => pasteClipboard(character.id, column.treeId, node.id)}
                          />
                        )}
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
