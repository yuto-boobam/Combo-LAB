// src/utils/comboTreeSearch.ts
// 複数のコンボ木（森）をまたいでノードを探すための小さなヘルパー。
// ノードIDはキャラ内で一意なので、木を特定せずにIDだけで検索できる。

import { findNode } from '../lib/tree';
import type { ComboTree, MoveNode } from '../types';

/** ノードIDから、それがどの木に属するかとノード本体を探す */
export function findNodeInComboTrees(
  comboTrees: ComboTree[],
  nodeId: string | null,
): { tree: ComboTree; node: MoveNode } | null {
  if (!nodeId) return null;

  for (const tree of comboTrees) {
    const node = findNode(tree.root, nodeId);
    if (node) return { tree, node };
  }
  return null;
}
