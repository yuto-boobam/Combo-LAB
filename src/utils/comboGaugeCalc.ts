// src/utils/comboGaugeCalc.ts
// ノード側の自動計算の第一歩。ダメージ・Dゲージは始動補正/コンボ補正が絡み複雑なため後回しにし、
// まずはSAゲージだけを実装する（root〜対象ノードの経路上にある各技のsaGaugeGainを単純合計するだけで良い、
// というユーザー確認済みの仕様。SA自身のsaGaugeGainは消費量として負の値で登録される想定なので、
// 合計にSAが含まれていれば自然にマイナス側へ振れる）。

import type {
  BranchStartHitCondition,
  ComboBranchStats,
  MoveDefinition,
  MoveNode,
  MoveStats,
  MoveStatsDatabase,
} from '../types';
import { calculateDamageScalingPath, type DamageHitInput } from './damageModifierCalc';

function findPathToNode(root: MoveNode, targetId: string): MoveNode[] | null {
  if (root.id === targetId) return [root];

  for (const child of root.children) {
    const path = findPathToNode(child, targetId);
    if (path) return [root, ...path];
  }

  return null;
}

const START_HIT_CONDITION_RANK: Record<BranchStartHitCondition, number> = {
  通常: 0,
  カウンター: 1,
  パニカン: 2,
};

/**
 * root〜targetNodeの経路上のノードに付いた「カウンター」「パニッシュカウンター」属性から、
 * この枝が繋がるために最低限必要な始動条件を求める（「カウンター以上でないと繋がらない」
 * ノードが経路上にあれば、末端の始動条件はそれ以上でなければならない、という前提）。
 * どちらの属性も経路上に無ければnull（制約なし）。
 */
function requiredStartHitConditionFromPath(path: MoveNode[]): BranchStartHitCondition | null {
  let required: BranchStartHitCondition | null = null;
  for (const node of path) {
    for (const attribute of node.attributes) {
      if (attribute.type === 'punishCounter') required = 'パニカン';
      else if (attribute.type === 'counter' && required !== 'パニカン') required = 'カウンター';
    }
  }
  return required;
}

export function calculateRequiredStartHitCondition(
  root: MoveNode,
  targetNodeId: string,
): BranchStartHitCondition | null {
  const path = findPathToNode(root, targetNodeId);
  if (!path) return null;
  return requiredStartHitConditionFromPath(path);
}

/**
 * 末端の`branchStats.startHitCondition`（手動入力）と、経路上のカウンター/パニカン属性から
 * 求まる必須条件のうち、厳しい方（ランクが高い方）を実際の計算に使う。手動入力が未設定・
 * または経路の必須条件を満たさない場合は、経路側の必須条件を優先する。
 */
function effectiveStartHitCondition(
  branchStats: ComboBranchStats | null,
  path: MoveNode[],
): BranchStartHitCondition | null {
  const required = requiredStartHitConditionFromPath(path);
  const stored = branchStats?.startHitCondition ?? null;
  if (!required) return stored;
  if (!stored) return required;
  return START_HIT_CONDITION_RANK[stored] >= START_HIT_CONDITION_RANK[required] ? stored : required;
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

function startBaseFromPath(path: MoveNode[]): number {
  const targetNode = path[path.length - 1];
  const branchStats = targetNode.branchStats;
  const condition = effectiveStartHitCondition(branchStats, path);
  const isJustParryStart = branchStats?.isJustParryStart ?? false;
  // ジャストパリィ後にパニカンで始動すると50%からスタート（カウンター/パニカンの120%ルールより優先）
  if (isJustParryStart && condition === 'パニカン') return 50;
  if (condition === 'カウンター' || condition === 'パニカン') return 120;
  return 100;
}

type FlatDamageHit = DamageHitInput & { damage: number; moveName: string; hitLabel: string };

function buildFlatDamageHits(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  path: MoveNode[],
): { flatHits: FlatDamageHit[]; rushTriggerPosition: number | null; startBase: number } | null {
  const characterStats = moveStatsDatabase[characterId];
  if (!characterStats) return null;

  const startBase = startBaseFromPath(path);

  const flatHits: FlatDamageHit[] = [];
  let rushTriggerPosition: number | null = null;
  let hasAnyData = false;

  for (const node of path) {
    if (node.attributes.some((attribute) => attribute.type === 'whiff')) continue;
    if (node.attributes.some((attribute) => attribute.type === 'guard')) continue; // ガードはダメージ0

    const stats = characterStats[node.moveName];
    const isSuperArt = moveList.some(
      (move) => move.name === node.moveName && move.category === 'superArt',
    );
    // キャンセルラッシュ/生ラッシュは名前で判定するシステム動作。加えて、チャージ等の
    // 「技データにdamage:0と明示登録されている＝実際にはダメージが存在しない行動」も同じ
    // 扱いにする（標準テーブルの段を進めない。位置は消費するが、ダメージ計算上の"1ヒット"
    // としては扱わない）。技データ未登録（damageがnullで0埋めしているだけ）は対象外
    // ——実戦では本来ヒットしているはずなので、従来通り段を進める
    const isRushMove = RUSH_MOVE_NAMES.has(node.moveName);

    if (stats) {
      hasAnyData = true;
      stats.hits.forEach((hit, hitIndex) => {
        flatHits.push({
          damage: hit.damage ?? 0,
          modifierText: hit.modifier,
          isSuperArt,
          minDamageGuaranteePercent: hit.minDamageGuaranteePercent,
          isSystemAction: isRushMove || hit.damage === 0,
          moveName: node.moveName,
          hitLabel: stats.isMultiHit ? `${node.moveName}(${hitIndex + 1}/${stats.hits.length}段目)` : node.moveName,
        });
      });
    } else {
      // 技データが無くても、実戦では1ヒットぶんの位置を消費しているはずなので
      // ダメージ0・補正なしとして位置だけ確保する（後続ヒットの段数がずれないようにする）
      flatHits.push({
        damage: 0,
        modifierText: '',
        isSuperArt,
        minDamageGuaranteePercent: null,
        isSystemAction: isRushMove,
        moveName: node.moveName,
        hitLabel: `${node.moveName}(技データ未登録)`,
      });
    }

    if (RUSH_MOVE_NAMES.has(node.moveName) && rushTriggerPosition === null && flatHits.length > 1) {
      rushTriggerPosition = flatHits.length + 1;
    }
  }

  if (!hasAnyData || flatHits.length === 0) return null;

  return { flatHits, rushTriggerPosition, startBase };
}

/**
 * root〜targetNodeId（両端含む）の経路上にある各ヒットのダメージを、実機確認済みの補正
 * （標準コンボ補正テーブル・ラッシュ攻撃の0.85倍・カウンター/パニカン始動・SAの最低保証）を
 * 適用して合計する。詳細な計算式は src/utils/damageModifierCalc.ts を参照。
 *
 * - 対象ノード（末端）のbranchStats（startHitCondition/isJustParryStart）から起点の基準値を決める
 * - 空振り・ガード属性のノードはダメージ0（位置も消費しない）
 * - 「キャンセルラッシュ」「生ラッシュ」のどちらも、以降のヒットにダメージ0.85倍を発生させる
 *   （Dゲージの回復抑制とは違い、生ラッシュも対象。始動技自体がラッシュ攻撃の時は発生しない）
 * - 技データが未登録のノードもダメージ0として位置だけは消費する（後続ヒットの段数がずれないように）
 * - 技データが1件も登録されていない経路ではnullを返す（未入力と「合計0」を区別するため）
 */
export function calculateBranchDamage(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  root: MoveNode,
  targetNodeId: string,
): number | null {
  const path = findPathToNode(root, targetNodeId);
  if (!path) return null;

  const built = buildFlatDamageHits(characterId, moveStatsDatabase, moveList, path);
  if (!built) return null;

  const { flatHits, rushTriggerPosition, startBase } = built;
  const percents = calculateDamageScalingPath(flatHits, rushTriggerPosition, startBase);
  // システム動作(isSystemAction)はpercentがnull(補正対象外)。damageが常に0のためどちらにせよ
  // 寄与は0だが、念のため明示的に0扱いする
  const total = flatHits.reduce((sum, hit, index) => sum + (hit.damage * (percents[index] ?? 0)) / 100, 0);

  return Math.round(total);
}

export type DamageBreakdownEntry = {
  position: number;
  hitLabel: string;
  damage: number;
  modifierText: string;
  isSuperArt: boolean;
  minDamageGuaranteePercent: number | null;
  // 敵にヒットしない行動（キャンセルラッシュ/生ラッシュ、damage:0で登録されたチャージ等）。
  // 補正%という概念自体が無いため、percentはnullになる
  isSystemAction: boolean;
  isRush: boolean;
  percent: number | null;
  contribution: number;
};

export type DamageBreakdown = {
  startBase: number;
  rushTriggerPosition: number | null;
  entries: DamageBreakdownEntry[];
  total: number;
};

/**
 * calculateBranchDamageと同じ計算を、デバッグ用に1ヒットずつの内訳付きで返す。
 * 一時的な検証用途（計算結果に食い違いが出た時に、どの段で想定とズレたかを特定するため）。
 */
export function calculateBranchDamageBreakdown(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  root: MoveNode,
  targetNodeId: string,
): DamageBreakdown | null {
  const path = findPathToNode(root, targetNodeId);
  if (!path) return null;

  const built = buildFlatDamageHits(characterId, moveStatsDatabase, moveList, path);
  if (!built) return null;

  const { flatHits, rushTriggerPosition, startBase } = built;
  const percents = calculateDamageScalingPath(flatHits, rushTriggerPosition, startBase);

  const entries: DamageBreakdownEntry[] = flatHits.map((hit, index) => {
    const percent = percents[index];
    const contribution = (hit.damage * (percent ?? 0)) / 100;
    return {
      position: index + 1,
      hitLabel: hit.hitLabel,
      damage: hit.damage,
      modifierText: hit.modifierText,
      isSuperArt: hit.isSuperArt,
      minDamageGuaranteePercent: hit.minDamageGuaranteePercent,
      isSystemAction: hit.isSystemAction ?? false,
      isRush: rushTriggerPosition !== null && index + 1 >= rushTriggerPosition,
      percent,
      contribution,
    };
  });

  const total = Math.round(entries.reduce((sum, entry) => sum + entry.contribution, 0));

  return { startBase, rushTriggerPosition, entries, total };
}
