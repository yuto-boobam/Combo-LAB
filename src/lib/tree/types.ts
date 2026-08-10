// src/lib/tree/types.ts
// 木構造レイアウト計算・アニメーションが必要とする最小限のノード形状。
// アプリ固有のノード型（例: RootedのTaskNode）はこれを満たしていればよい。

export type TreeNodeLike = {
  id: string;
  children: TreeNodeLike[];
};

export type NodePosition = { x: number; y: number; height: number };

export type DropZoneSpec = {
  key: string;
  parentId: string;
  insertIndex: number;
  x: number;
  y: number;
};

export type TreeLayout = {
  positions: Map<string, NodePosition>;
  dropZones: DropZoneSpec[];
  width: number;
  height: number;
};

export type TreeColumn<T extends TreeNodeLike> = {
  parentId: string;
  nodes: T[];
  depth: number;
};

/** カードサイズ・間隔などレイアウト計算に必要な寸法設定 */
export type TreeLayoutConfig = {
  cardWidth: number;
  rootWidth: number;
  gapX: number;
  dropZoneHeight: number;
  defaultNodeHeight: number;
  defaultRootHeight: number;
};
