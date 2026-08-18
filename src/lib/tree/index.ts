// src/lib/tree/index.ts
// 木構造の汎用レイアウト計算・アニメーション・接続線描画。
// アプリ固有のノード型（Rootedの TaskNode など）には依存しない。

export type {
  TreeNodeLike,
  NodePosition,
  DropZoneSpec,
  TreeLayout,
  TreeColumn,
  TreeLayoutConfig,
} from './types';

export { computeTreeLayout } from './layout';
export { useNodeHeights } from './useNodeHeights';
export { findNode, buildParentMap, findConvergenceTarget } from './treeUtils';
export { useTreeExpandAnimation } from './useTreeExpandAnimation';
export { ConnectionsOverlay } from './ConnectionsOverlay';
export { buildGroupView } from './groupView';
export type { GroupPillMeta, GroupView } from './groupView';
