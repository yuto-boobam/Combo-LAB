// src/utils/comboGaugeCalc.ts
// ノード側の自動計算の第一歩。ダメージ・Dゲージは始動補正/コンボ補正が絡み複雑なため後回しにし、
// まずはSAゲージだけを実装する（root〜対象ノードの経路上にある各技のsaGaugeGainを単純合計するだけで良い、
// というユーザー確認済みの仕様。SA自身のsaGaugeGainは消費量として負の値で登録される想定なので、
// 合計にSAが含まれていれば自然にマイナス側へ振れる）。

import type { MoveDefinition, MoveNode, MoveStats, MoveStatsDatabase } from '../types';

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

const CANCEL_RUSH_MOVE_NAME = 'キャンセルラッシュ';
const RAW_RUSH_MOVE_NAME = '生ラッシュ';
// ラッシュ系のノードは、それ自身のDゲージ消費（マイナスのdGaugeGain）を常に加算する。
// 通常技のように「既にキャンセルラッシュ中だから0になる」対象ではない
const RUSH_MOVE_NAMES = new Set([CANCEL_RUSH_MOVE_NAME, RAW_RUSH_MOVE_NAME]);

/**
 * root〜targetNodeId（両端含む）の経路上にある各ノードの技データから、Dゲージ増減の合計を求める。
 *
 * 実機確認済みの仕様に基づく簡略化:
 * - 「キャンセルラッシュ」ノードより後は、通常技のヒット回復が0になる
 * - 「生ラッシュ」自体は回復抑制の対象外（inRushにしない）だが、生ラッシュ自身のコスト
 *   （マイナスのdGaugeGain）は、既にキャンセルラッシュ中でも常に加算される
 * - ラッシュ中でもSA技だけは`dGaugeGainDuringRush`の値を使う（未入力なら0）
 * - 空振り属性のノードは寄与0
 * - `dGaugeRecoveryBlocked`が付いたノード（連続ガード等、手動で判定してもらう）は寄与0
 * - ガード属性のノードは、ガード時回復量のデータが無いため現状は寄与0
 * - 待機/歩行による実時間ベースの回復、ラッシュ終了2秒後の回復再開はスコープ外
 *   （このツールはコンボを技の並びとして記録するもので、実時間の経過を扱う仕組みが無いため）
 *
 * 技データが1件も登録されていない経路ではnullを返す（未入力と「合計0」を区別するため）。
 */
export function calculateBranchDGaugeChange(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  root: MoveNode,
  targetNodeId: string,
): number | null {
  const path = findPathToNode(root, targetNodeId);
  if (!path) return null;

  const characterStats = moveStatsDatabase[characterId];
  if (!characterStats) return null;

  let total = 0;
  let hasAnyData = false;
  let inRush = false;

  for (const node of path) {
    const stats = characterStats[node.moveName];

    if (RUSH_MOVE_NAMES.has(node.moveName)) {
      if (stats) {
        hasAnyData = true;
        total += stats.hits.reduce((sum, hit) => sum + (hit.dGaugeGain ?? 0), 0);
      }
      if (node.moveName === CANCEL_RUSH_MOVE_NAME) inRush = true;
      continue;
    }

    if (node.attributes.some((attribute) => attribute.type === 'whiff')) continue;
    if (node.dGaugeRecoveryBlocked) continue;
    if (node.attributes.some((attribute) => attribute.type === 'guard')) continue; // ガード回復量は未実装

    if (!stats) continue;
    hasAnyData = true;

    const isSuperArt = moveList.some(
      (move) => move.name === node.moveName && move.category === 'superArt',
    );

    total += stats.hits.reduce((sum, hit) => {
      if (!inRush) return sum + (hit.dGaugeGain ?? 0);
      return sum + (isSuperArt ? (hit.dGaugeGainDuringRush ?? 0) : 0);
    }, 0);
  }

  return hasAnyData ? total : null;
}
