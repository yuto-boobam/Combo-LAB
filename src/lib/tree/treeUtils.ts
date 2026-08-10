// src/lib/tree/treeUtils.ts

import type { NodePosition, TreeNodeLike } from './types';

/** ノードIDからノードを再帰的に検索する */
export function findNode<T extends TreeNodeLike>(root: T, id: string): T | null {
  if (root.id === id) return root;

  for (const child of root.children) {
    const found = findNode(child as T, id);
    if (found) return found;
  }

  return null;
}

/** 各ノードIDから親IDを引くためのマップを木構造全体から作る */
export function buildParentMap<T extends TreeNodeLike>(root: T): Map<string, string> {
  const map = new Map<string, string>();

  const walk = (node: TreeNodeLike) => {
    node.children.forEach((child) => {
      map.set(child.id, node.id);
      walk(child);
    });
  };

  walk(root);
  return map;
}

/**
 * 閉じて消えるノードの収束先座標を求める。
 * 直接の親も一緒に消えている場合（複数階層が同時に閉じる場合）があるため、
 * 現在も表示されている祖先が見つかるまで親をたどる。
 */
export function findConvergenceTarget(
  id: string,
  parentOf: Map<string, string>,
  currentPositions: Map<string, NodePosition>,
): NodePosition | null {
  let cursor = parentOf.get(id);

  while (cursor) {
    const pos = currentPositions.get(cursor);
    if (pos) return pos;
    cursor = parentOf.get(cursor);
  }

  return null;
}
