// src/utils/branchStats.ts
// 葉ノードの branchStats が未設定の場合、直近の祖先にある「コンボ締め」ノードの
// branchStats を初期値として引き継ぐための解決ロジック。
//
// これにより、コンボ締めの後に起き攻め確認用のセットアップ枝（空振り待ちなど）を
// 伸ばしても、ダメージ・ゲージの数値をノードごとに入力し直す必要がなくなる。

import type { ComboBranchStats, MoveNode } from '../types';

/**
 * @param node 対象ノード
 * @param ancestors root→…→node の親、の順で並んだ祖先配列（node自身は含まない）
 */
export function resolveEffectiveBranchStats(
  node: MoveNode,
  ancestors: MoveNode[],
): ComboBranchStats | null {
  if (node.branchStats) return node.branchStats;

  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const ancestor = ancestors[i];
    const isComboEnder = ancestor.attributes.some((attribute) => attribute.type === 'comboEnder');

    if (isComboEnder && ancestor.branchStats) {
      return ancestor.branchStats;
    }
  }

  return null;
}
