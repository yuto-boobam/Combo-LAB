// src/pages/ComboTreePage.tsx
// コンボの木を表示・編集する画面（企画書7〜9ページ）。
// キャンバスの構造（レイアウト計算・パン・ズーム・接続線）はRootedのTreePage.tsxを踏襲するが、
// ノードは円形（MoveNodeCircle）で、追加はTab/Enterではなく常時表示のサイドドロワー経由。
//
// 1キャラは始動技ごとに複数の木（森）を持つ。すべての木は1本ずつのカード画面に分けず、
// この1つのキャンバス内に縦に並べて同時表示する（木ごとにラベルを付けて見分ける）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, useVisibleCharacters } from '../store';
import Header from '../components/Header';
import { MoveNodeCircle } from '../components/MoveNodeCircle';
import { GroupPillNode } from '../components/GroupPillNode';
import { SideDrawerPanel } from '../components/combo/SideDrawerPanel';
import type { ComboTree, MoveNode } from '../types';
import { resolveBorderColorKind, NODE_LINE_COLOR_VAR } from '../utils/nodeVisualStyle';
import { findNodeInComboTrees } from '../utils/comboTreeSearch';
import { nodeWidthFor, GROUP_PILL_WIDTH } from '../utils/nodeSizing';
import { applyManualLineBreaks } from '../utils/textDisplay';
import { TUTORIAL_CHARACTER_ID } from '../data/tutorialCharacter';
import {
  computeTreeLayout,
  useNodeHeights,
  useTreeExpandAnimation,
  buildParentMap,
  buildGroupView,
  findGroupOccurrences,
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

// computeTreeLayoutへ渡すノードごとの幅の上書き。特殊記入があるノードや
// グループピル（pillIds）は広めの値を返すため、木のレイアウト計算と実際の
// 見た目（MoveNodeCircle/GroupPillNode）がズレないようにする
function collectNodeWidths(node: MoveNode, widths: Record<string, number>, pillIds?: Set<string>): void {
  widths[node.id] = pillIds?.has(node.id) ? GROUP_PILL_WIDTH : nodeWidthFor(node);
  node.children.forEach((child) => collectNodeWidths(child, widths, pillIds));
}

export function ComboTreePage() {
  const characters = useVisibleCharacters();
  const isGuest = useAppStore((state) => state.isGuest);
  const selectedCharacterId = useAppStore((state) => state.selectedCharacterId);
  const goToCharacterSelect = useAppStore((state) => state.goToCharacterSelect);
  const selectCharacter = useAppStore((state) => state.selectCharacter);
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
  const renameComboGroup = useAppStore((state) => state.renameComboGroup);
  const matchModeAnchorId = useAppStore((state) => state.matchModeAnchorId);
  const setMatchSelectedIds = useAppStore((state) => state.setMatchSelectedIds);
  const matchedAnchorIds = useAppStore((state) => state.matchedAnchorIds);
  const startEditingMatch = useAppStore((state) => state.startEditingMatch);
  const startCopyMode = useAppStore((state) => state.startCopyMode);
  const replaceModeAnchorId = useAppStore((state) => state.replaceModeAnchorId);
  const cancelCopyMode = useAppStore((state) => state.cancelCopyMode);
  const cancelGroupMode = useAppStore((state) => state.cancelGroupMode);
  const cancelMatchMode = useAppStore((state) => state.cancelMatchMode);
  const cancelReplaceSelection = useAppStore((state) => state.cancelReplaceSelection);

  const character = useMemo(
    () => characters.find((item) => item.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  );

  const trees = useMemo(() => character?.comboTrees ?? [], [character]);

  // チュートリアル用キャラクターだけ、ゲストモードでも編集できるようにする例外
  // （それ以外のキャラはゲスト＝閲覧専用のまま。詳細はTUTORIAL_CHARACTER_ID参照）
  const isReadOnly = isGuest && character?.id !== TUTORIAL_CHARACTER_ID;

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

  // ── 誘導ガイド（チュートリアルキャラクター限定）: 「①ドロワーを開く」→「②ダメージ自動計算
  // ノードをクリックする」→「③コンボの情報を開く」→「④計算式を開く」の4段階を順番に見せる。
  // 各ステップのハイライト自体はComboTreePage(ドロワー開閉ボタン・②のノード)とSideDrawerPanel
  // (コンボの情報欄・計算式ボタン)それぞれの持ち場で描くが、「今どの段階か」はここで一元管理する。
  // handleNodeClickより前で宣言する必要がある（useCallbackの依存配列がここを参照するため）
  type TutorialGuideStep =
    | 'openDrawer'
    | 'clickDamageNode'
    | 'openComboInfo'
    | 'openFormula'
    | 'done';
  const [tutorialGuideStep, setTutorialGuideStep] = useState<TutorialGuideStep>(() =>
    character?.id === TUTORIAL_CHARACTER_ID ? 'openDrawer' : 'done',
  );

  // 誘導ガイドの実例キャラクター。全ステップ完了後、下の画面遷移ボタンからここへ飛ばす。
  // 今後ステップが増えても判定は変わらず「tutorialGuideStep === 'done'」の1箇所だけを見ればよい
  const tutorialExampleCharacterId = 'ryu';

  // ②「ダメージは自動計算」の木にある、自動計算の説明文付きの末端ノード
  // （tutorialCharacter.tsのtreeDamage: 500ダメージ→500ダメージ→500ダメージ、の3つ目）
  const tutorialDamageTargetNodeId = useMemo(() => {
    if (character?.id !== TUTORIAL_CHARACTER_ID) return null;
    const damageTree = trees.find((tree) => tree.label === '②ダメージは自動計算');
    return damageTree?.root.children[0]?.children[0]?.id ?? null;
  }, [character, trees]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      // ステップ2でガイド対象ノードをクリックしたら、副作用(useEffect)ではなくこの
      // クリックイベント自体をきっかけに次のステップへ進める
      if (tutorialGuideStep === 'clickDamageNode' && nodeId === tutorialDamageTargetNodeId) {
        setTutorialGuideStep('openComboInfo');
      }

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
      tutorialGuideStep,
      tutorialDamageTargetNodeId,
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

  // ── サイドドロワーの開閉。長く続くコンボを画面いっぱいに見たい時に閉じられるようにする。
  // チュートリアルキャラクターだけは、初回に「クリックして開く」を体験してもらうため
  // 閉じた状態から始める（それ以外のキャラは従来通り開いた状態から始まる）
  const [isDrawerOpen, setIsDrawerOpen] = useState(() => character?.id !== TUTORIAL_CHARACTER_ID);

  // ── コンボ/グループ表示モードの切り替え。「グループ」は名前付きグループの
  // 全出現箇所だけを一覧する読み取り中心のビュー（実データはcomboTreesのまま）
  const [treeViewMode, setTreeViewMode] = useState<'combo' | 'group'>('combo');

  // グループ表示モードの「コピー開始」「ジャンプ」ボタンで、コンボ表示モードへ
  // 切り替えた直後に該当ノードまでスクロールするための予約
  const [pendingJumpNodeId, setPendingJumpNodeId] = useState<string | null>(null);

  // サイドパネルの「ここからコピー開始」「ここからグループ化開始」「ここから一致箇所を探す」は
  // グループタブでノードを選択した状態からも押せてしまうが、これらのモードの操作（続く枝の
  // クリックによる選択）はコンボタブの木でしか成立しない（グループタブのノードクリックは
  // 単純な選択のみで、モードの選択状態には反映されない）。そのため、いずれかのモードが
  // 始まったら強制的にコンボタブへ切り替える（グループタブに取り残されて操作不能になる不具合の修正）
  useEffect(() => {
    if (treeViewMode !== 'group') return;
    if (copyModeAnchorId || groupModeActive || matchModeAnchorId || replaceModeAnchorId) {
      setTreeViewMode('combo');
    }
  }, [treeViewMode, copyModeAnchorId, groupModeActive, matchModeAnchorId, replaceModeAnchorId]);

  // 上記の自動切り替えがある間は「グループ」タブを押しても即座にコンボタブへ戻されてしまい、
  // ボタンが反応しないように見える。タブを明示的に押した時は、その意思を優先して
  // 進行中のモードをキャンセルしてから切り替える
  const handleTreeViewModeChange = useCallback(
    (mode: 'combo' | 'group') => {
      if (mode === 'group') {
        if (copyModeAnchorId) cancelCopyMode();
        if (groupModeActive) cancelGroupMode();
        if (matchModeAnchorId) cancelMatchMode();
        if (replaceModeAnchorId) cancelReplaceSelection();
      }
      setTreeViewMode(mode);
    },
    [
      copyModeAnchorId,
      groupModeActive,
      matchModeAnchorId,
      replaceModeAnchorId,
      cancelCopyMode,
      cancelGroupMode,
      cancelMatchMode,
      cancelReplaceSelection,
    ],
  );

  useEffect(() => {
    if (treeViewMode !== 'combo' || !pendingJumpNodeId) return;

    const id = pendingJumpNodeId;
    const raf = requestAnimationFrame(() => {
      document.getElementById(`node-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
      setPendingJumpNodeId(null);
    });

    return () => cancelAnimationFrame(raf);
  }, [treeViewMode, pendingJumpNodeId]);

  const jumpToNodeInComboView = useCallback(
    (nodeId: string) => {
      setTreeViewMode('combo');
      selectNode(nodeId);
      setPendingJumpNodeId(nodeId);
    },
    [selectNode],
  );

  const startCopyFromGroupView = useCallback(
    (nodeId: string) => {
      setTreeViewMode('combo');
      startCopyMode(nodeId);
      setPendingJumpNodeId(nodeId);
    },
    [startCopyMode],
  );

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
      collectNodeWidths(viewRoot, nodeWidths, new Set(groupView.pillMetaById.keys()));
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

  // ── グループ表示モード: 名前付きグループの全出現箇所を、木を横断して集めて
  // 1出現=1本道として並べる（実データには手を入れない。詳細は groupOccurrences.ts 参照）
  const groupOccurrences = useMemo(
    () => findGroupOccurrences(trees, groupNameById),
    [trees, groupNameById],
  );

  const groupForest = useMemo(() => {
    let cursorY = 0;
    let maxWidth = 0;
    const blocks: GroupTreeBlock[] = [];
    const positions = new Map<string, NodePosition>();
    const dropZones: TaggedDropZone[] = [];
    const parentOf = new Map<string, string>();

    groupOccurrences.forEach((occurrence) => {
      const viewRoot = occurrence.root;
      // TreeBlockと同じ形に収めるための表示専用の合成データ。実際のcomboTreesには存在しない
      const syntheticTree: ComboTree = {
        id: `group-occurrence-${occurrence.memberIds[0]}`,
        label: `${occurrence.groupName} ・ ${occurrence.treeLabel}`,
        root: viewRoot,
      };

      const nodeWidths: Record<string, number> = {};
      collectNodeWidths(viewRoot, nodeWidths);
      const layout = computeTreeLayout(viewRoot, collapsedSet, nodeHeights, TREE_LAYOUT_CONFIG, nodeWidths);

      const columns: TaggedColumn[] = [];
      const visit = (node: MoveNode, depth: number) => {
        if (node.children.length === 0) return;
        if (collapsedSet.has(node.id)) return;

        columns.push({ parentId: node.id, nodes: node.children, depth, treeId: syntheticTree.id });
        for (const child of node.children) {
          visit(child, depth + 1);
        }
      };
      visit(viewRoot, 0);

      const offsetY = cursorY;
      shiftPositions(layout.positions, offsetY).forEach((pos, id) => positions.set(id, pos));
      layout.dropZones.forEach((dropZone) =>
        dropZones.push({ ...dropZone, y: dropZone.y + offsetY, treeId: syntheticTree.id }),
      );
      buildParentMap(viewRoot).forEach((parentId, id) => parentOf.set(id, parentId));

      blocks.push({
        tree: syntheticTree,
        viewRoot,
        offsetY,
        columns,
        groupId: occurrence.groupId,
        groupName: occurrence.groupName,
        treeLabel: occurrence.treeLabel,
      });
      maxWidth = Math.max(maxWidth, layout.width);
      cursorY += layout.height + TREE_BLOCK_GAP;
    });

    const totalHeight = blocks.length > 0 ? cursorY - TREE_BLOCK_GAP : 0;
    const layout: TreeLayout = { positions, dropZones, width: maxWidth, height: totalHeight };

    return { blocks, layout, parentOf, columns: blocks.flatMap((block) => block.columns) };
  }, [groupOccurrences, collapsedSet, nodeHeights]);

  const activeForest = treeViewMode === 'group' ? groupForest : forest;

  const { exitingNodes, enteringNodes } = useTreeExpandAnimation(
    activeForest.layout,
    activeForest.parentOf,
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
        title={
          treeViewMode === 'combo'
            ? `${character.name} のコンボ — ${trees.length}本`
            : `${character.name} のグループ — ${groupOccurrences.length}箇所`
        }
        character={character}
        rightSlot={
          <>
            <ViewModeTabs mode={treeViewMode} onChange={handleTreeViewModeChange} />
            <ZoomBar zoom={zoom} onChange={setZoom} />
          </>
        }
        trailingSlot={
          <div style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
            <button
              type="button"
              onClick={() => {
                setIsDrawerOpen((open) => !open);
                if (tutorialGuideStep === 'openDrawer') setTutorialGuideStep('clickDamageNode');
              }}
              title={isDrawerOpen ? 'サイドドロワーを閉じる' : 'サイドドロワーを開く'}
              className={tutorialGuideStep === 'openDrawer' ? 'tutorial-guide-pulse' : undefined}
              style={{
                flexShrink: 0,
                width: 30,
                height: 28,
                borderRadius: 9,
                border: 'none',
                background: 'var(--accent)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 14, height: 2, borderRadius: 1, background: '#fff' }} />
              <span style={{ width: 14, height: 2, borderRadius: 1, background: '#fff' }} />
              <span style={{ width: 14, height: 2, borderRadius: 1, background: '#fff' }} />
            </button>

            {/* サイドドロワー開閉ボタンの誘導ガイド。チュートリアルキャラクターの初回のみ表示 */}
            {tutorialGuideStep === 'openDrawer' && (
              <div
                className="tutorial-guide-bubble"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 12,
                  width: 148,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: 1.5,
                  textAlign: 'center',
                  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
                  zIndex: 20,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: 10,
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid var(--accent)',
                  }}
                />
                ここをクリックすると
                <br />
                操作パネルが開きます
              </div>
            )}
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* ── ツリービュー本体 */}
        <div ref={scrollRef} className="flex-1 overflow-auto" style={{ position: 'relative' }}>
          {(treeViewMode === 'combo' ? trees.length === 0 : groupOccurrences.length === 0) ? (
            <div className="flex flex-col items-center justify-center gap-4 h-full">
              <div className="text-6xl">🌳</div>
              <p style={{ color: 'var(--text-secondary)' }}>
                {treeViewMode === 'combo'
                  ? 'まだコンボの木がありません。右のパネルから始動技を入力して作成しましょう。'
                  : 'まだ名前付きグループがありません。木の中で一本道を選んで「グループ化」すると、ここに一覧できます。'}
              </p>
            </div>
          ) : (
            <div
              style={{
                position: 'relative',
                width: (activeForest.layout.width + CANVAS_PADDING * 2) * zoom,
                height: (activeForest.layout.height + CANVAS_PADDING * 2) * zoom,
              }}
            >
              <div
                onMouseDown={handleCanvasMouseDown}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: activeForest.layout.width + CANVAS_PADDING * 2,
                  height: activeForest.layout.height + CANVAS_PADDING * 2,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  cursor: isPanning ? 'grabbing' : 'grab',
                  userSelect: isPanning ? 'none' : undefined,
                }}
              >
                {treeViewMode === 'group' && (
                  <GroupOverviewContent
                    groupForest={groupForest}
                    zoom={zoom}
                    collapsedSet={collapsedSet}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={selectNode}
                    onToggleExpand={toggleNodeExpanded}
                    onStartCopyFrom={startCopyFromGroupView}
                    onJumpTo={jumpToNodeInComboView}
                    onRenameGroup={(groupId, name) => renameComboGroup(character.id, groupId, name)}
                    isGuest={isReadOnly}
                  />
                )}

                {treeViewMode === 'combo' && (
                <>
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
                        isReadOnly
                          ? undefined
                          : () => {
                              const ok = window.confirm(`「${block.tree.label}」を削除しますか？`);
                              if (ok) deleteComboTree(character.id, block.tree.id);
                            }
                      }
                      onMoveUp={
                        isReadOnly || blockIndex === 0
                          ? undefined
                          : () => moveComboTree(character.id, block.tree.id, 'up')
                      }
                      onMoveDown={
                        isReadOnly || blockIndex === forest.blocks.length - 1
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
                          onExpand={() => toggleGroupExpanded(rootId)}
                          parentId={null}
                          dragIndex={0}
                          readOnly={isReadOnly}
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
                          readOnly={isReadOnly}
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
                            onExpand={() => toggleGroupExpanded(node.id)}
                            parentId={column.parentId}
                            dragIndex={nodeIndex}
                            readOnly={isReadOnly}
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
                            readOnly={isReadOnly}
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
                            isGuideTarget={
                              tutorialGuideStep === 'clickDamageNode' &&
                              node.id === tutorialDamageTargetNodeId
                            }
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
                {!isReadOnly &&
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
                </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── サイドドロワー（開閉可能。開閉ボタンはHeaderのtrailingSlot参照） */}
        <SideDrawerPanel
          characterId={character.id}
          comboTrees={trees}
          isOpen={isDrawerOpen}
          highlightComboInfoNodeId={
            tutorialGuideStep === 'openComboInfo' ? tutorialDamageTargetNodeId : null
          }
          onComboInfoOpened={() => setTutorialGuideStep('openFormula')}
          highlightFormulaNodeId={
            tutorialGuideStep === 'openFormula' ? tutorialDamageTargetNodeId : null
          }
          onFormulaOpened={() => setTutorialGuideStep('done')}
        />

        {/* 誘導ガイドが全ステップ完了した時だけ表示する画面遷移ボタン。ステップ数が
            将来増えても、判定は常に「最終的にdoneへ到達したか」の1箇所だけでよい */}
        {character.id === TUTORIAL_CHARACTER_ID && tutorialGuideStep === 'done' && (
          <button
            type="button"
            onClick={() => selectCharacter(tutorialExampleCharacterId)}
            className="tutorial-guide-bubble"
            style={{
              position: 'fixed',
              right: 24,
              bottom: 24,
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 18px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 10px 28px rgba(0, 0, 0, 0.4)',
            }}
          >
            コンボの実例を見る →
          </button>
        )}
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

// ────────────────────────────────────────────────────────────
// コンボ/グループ表示モード切り替えタブ
// ────────────────────────────────────────────────────────────

function ViewModeTabs({
  mode,
  onChange,
}: {
  mode: 'combo' | 'group';
  onChange: (mode: 'combo' | 'group') => void;
}) {
  return (
    <div
      className="flex-shrink-0 flex items-center"
      style={{
        height: 32,
        padding: 3,
        gap: 2,
        borderRadius: 11,
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
      }}
    >
      <ViewModeTabButton label="コンボ" active={mode === 'combo'} onClick={() => onChange('combo')} />
      <ViewModeTabButton label="グループ" active={mode === 'group'} onClick={() => onChange('group')} />
    </div>
  );
}

function ViewModeTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 26,
        padding: '0 12px',
        borderRadius: 8,
        border: 'none',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : '#94a3b8',
        fontSize: 12,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// グループ表示モード: 名前付きグループの全出現箇所の一覧
// ────────────────────────────────────────────────────────────

// グループタブのブロックは、名前変更UIのためどのグループの出現かを追加で持つ
type GroupTreeBlock = TreeBlock & { groupId: string; groupName: string; treeLabel: string };

type GroupForestLike = {
  blocks: GroupTreeBlock[];
  layout: TreeLayout;
  columns: TaggedColumn[];
};

function GroupOverviewContent({
  groupForest,
  zoom,
  collapsedSet,
  selectedNodeId,
  onSelectNode,
  onToggleExpand,
  onStartCopyFrom,
  onJumpTo,
  onRenameGroup,
  isGuest,
}: {
  groupForest: GroupForestLike;
  zoom: number;
  collapsedSet: Set<string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onStartCopyFrom: (nodeId: string) => void;
  onJumpTo: (nodeId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  isGuest: boolean;
}) {
  return (
    <>
      <ConnectionsOverlay
        columns={groupForest.columns}
        zoom={zoom}
        layout={groupForest.layout}
        getLinkColor={getBranchLineColor}
      />

      {groupForest.blocks.map((block) => {
        const rootPos = groupForest.layout.positions.get(block.viewRoot.id);
        if (!rootPos) return null;

        const rootId = block.viewRoot.id;

        return (
          <div key={block.tree.id}>
            <GroupOccurrenceHeader
              groupName={block.groupName}
              treeLabel={block.treeLabel}
              x={rootPos.x}
              offsetY={block.offsetY}
              onStartCopy={() => onStartCopyFrom(rootId)}
              onJump={() => onJumpTo(rootId)}
              onRename={!isGuest ? (name) => onRenameGroup(block.groupId, name) : undefined}
            />

            <div
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
                node={block.viewRoot}
                isRoot
                isSelected={selectedNodeId === rootId}
                onClick={() => onSelectNode(rootId)}
                isExpanded={!collapsedSet.has(rootId)}
                onToggleExpand={
                  block.viewRoot.children.length > 0 ? () => onToggleExpand(rootId) : undefined
                }
                parentId={null}
                dragIndex={0}
                readOnly
                onDrop={() => {
                  // グループ表示モードでは並び替え不可
                }}
              />
            </div>
          </div>
        );
      })}

      {groupForest.columns.flatMap((column) =>
        column.nodes.map((node, nodeIndex) => {
          const pos = groupForest.layout.positions.get(node.id);
          if (!pos) return null;

          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: CANVAS_PADDING,
                top: CANVAS_PADDING,
                width: NODE_WIDTH,
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                transition: 'transform 220ms ease',
              }}
            >
              <MoveNodeCircle
                node={node}
                isSelected={selectedNodeId === node.id}
                onClick={() => onSelectNode(node.id)}
                isExpanded={!collapsedSet.has(node.id)}
                onToggleExpand={node.children.length > 0 ? () => onToggleExpand(node.id) : undefined}
                parentId={column.parentId}
                dragIndex={nodeIndex}
                readOnly
                onDrop={() => {
                  // グループ表示モードでは並び替え不可
                }}
              />
            </div>
          );
        }),
      )}
    </>
  );
}

function GroupOccurrenceHeader({
  groupName,
  treeLabel,
  x,
  offsetY,
  onStartCopy,
  onJump,
  onRename,
}: {
  groupName: string;
  treeLabel: string;
  x: number;
  offsetY: number;
  onStartCopy: () => void;
  onJump: () => void;
  // 未指定（ゲスト等）なら編集アイコン自体を出さない
  onRename?: (name: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(groupName);

  const startEditing = () => {
    setDraftName(groupName);
    setIsEditing(true);
  };

  const commitEditing = () => {
    setIsEditing(false);
    if (draftName.trim() && draftName.trim() !== groupName) {
      onRename?.(draftName.trim());
    }
  };

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
      {isEditing ? (
        <input
          type="text"
          className="input-field"
          autoFocus
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitEditing}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitEditing();
            if (event.key === 'Escape') setIsEditing(false);
          }}
          style={{ fontSize: 14, fontWeight: 800, padding: '2px 6px', width: 160 }}
        />
      ) : (
        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>
          {applyManualLineBreaks(groupName)}
          {treeLabel}
        </span>
      )}

      {onRename && !isEditing && (
        <button
          type="button"
          className="btn-icon"
          onClick={startEditing}
          title="グループ名を変更"
          style={{ width: 20, height: 20, fontSize: 11 }}
        >
          ✏️
        </button>
      )}

      <button
        type="button"
        className="btn-icon"
        onClick={onStartCopy}
        title="ここからコピー開始（コンボ表示モードへ切り替わります）"
        style={{ width: 20, height: 20, fontSize: 11 }}
      >
        📋
      </button>

      <button
        type="button"
        className="btn-icon"
        onClick={onJump}
        title="元のツリーへジャンプ（コンボ表示モードへ切り替わります）"
        style={{ width: 20, height: 20, fontSize: 11 }}
      >
        →
      </button>
    </div>
  );
}
