// src/utils/previewChain.ts
// ノードの枝を「技名チップを並べた1行のチェーン」として表示するための整形ロジック。
// クリップボードプレビューと、一致箇所への一括反映機能（変更前/変更後プレビュー・
// 一致箇所一覧）の両方から使う（表示側は src/components/combo/ChainPreviewRow.tsx）。

import type { MoveNode } from '../types';

const MAX_CHAIN_LENGTH = 4;

export type ChainItem = { id: string; moveName: string };

/** 1本の枝を「単一の子」を辿れる限りチェーンとして表示する。
 * 4つを超える場合は最初の2つ・最後の2つだけを表示し、間を省略する。
 * 途中で枝分かれしたら、そこで表示を打ち切り件数だけ添える。 */
export function buildPreviewChain(root: MoveNode): { items: ChainItem[]; moreBranches: number } {
  const items: ChainItem[] = [];
  let cursor: MoveNode = root;

  while (true) {
    items.push({ id: cursor.id, moveName: cursor.moveName });
    if (cursor.children.length !== 1) break;
    cursor = cursor.children[0];
  }

  const moreBranches = cursor.children.length > 1 ? cursor.children.length : 0;

  if (items.length <= MAX_CHAIN_LENGTH) return { items, moreBranches };

  return {
    items: [...items.slice(0, 2), { id: `${root.id}-ellipsis`, moveName: '…' }, ...items.slice(-2)],
    moreBranches,
  };
}
