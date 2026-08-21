// src/utils/comboGaugeCalc.ts
// ノード側の自動計算の第一歩。ダメージ・Dゲージは始動補正/コンボ補正が絡み複雑なため後回しにし、
// まずはSAゲージだけを実装する（root〜対象ノードの経路上にある各技のsaGaugeGainを単純合計するだけで良い、
// というユーザー確認済みの仕様。SA自身のsaGaugeGainは消費量として負の値で登録される想定なので、
// 合計にSAが含まれていれば自然にマイナス側へ振れる）。

import type { MoveNode, MoveStats, MoveStatsDatabase } from '../types';

function findPathToNode(root: MoveNode, targetId: string): MoveNode[] | null {
  if (root.id === targetId) return [root];

  for (const child of root.children) {
    const path = findPathToNode(child, targetId);
    if (path) return [root, ...path];
  }

  return null;
}

function sumSaGaugeGain(stats: MoveStats): number {
  return stats.hits.reduce((sum, hit) => sum + (hit.saGaugeGain ?? 0), 0);
}

/**
 * root〜targetNodeId（両端含む）の経路上にある各ノードの技データから、SAゲージ増減の合計を求める。
 * 複数ヒット技は「何段目が当たったか」を選ぶUIがまだ無いため、常に全段分の合計を使う。
 * 技データが1件も登録されていない経路ではnullを返す（未入力と「合計0」を区別するため）。
 */
export function calculateBranchSaGaugeChange(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  root: MoveNode,
  targetNodeId: string,
): number | null {
  const path = findPathToNode(root, targetNodeId);
  if (!path) return null;

  const characterStats = moveStatsDatabase[characterId];
  if (!characterStats) return null;

  let total = 0;
  let hasAnyData = false;

  for (const node of path) {
    const stats = characterStats[node.moveName];
    if (!stats) continue;
    hasAnyData = true;
    total += sumSaGaugeGain(stats);
  }

  return hasAnyData ? total : null;
}
