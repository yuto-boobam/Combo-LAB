// src/utils/comboGaugeCalc.ts
// ノード側の自動計算の第一歩。ダメージ・Dゲージは始動補正/コンボ補正が絡み複雑なため後回しにし、
// まずはSAゲージだけを実装する（root〜対象ノードの経路上にある各技のsaGaugeGainを単純合計するだけで良い、
// というユーザー確認済みの仕様。SA自身のsaGaugeGainは消費量として負の値で登録される想定なので、
// 合計にSAが含まれていれば自然にマイナス側へ振れる）。

import type {
  BranchStartHitCondition,
  ComboBranchStats,
  MoveDefinition,
  MoveHitStats,
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

/**
 * 末端ノードのbranchStats.finishingSuperArtNameが設定されている場合、経路の最後に
 * そのSAぶんの合成ノードを1つ追加した配列を返す（実データには一切手を入れない）。
 * SAの直前の技でコンボを終えることも多いが、その場合でも木にSAのノードを追加しなくて
 * 済むよう、末端ノードの「コンボの情報」欄からSAを選べるようにする機能で使う
 * （src/components/combo/BranchStatsEditor.tsx参照）。
 *
 * 合成ノードのbranchStatsは元の末端ノードのものをそのまま共有する。始動条件
 * (startHitCondition等)やincludesEarlyDGaugeRecoveryは「この枝全体」の設定であり、
 * SAを合成した後も末端ノードとして扱われる側（配列の最後）から読まれるため、これに
 * よって各calc関数側の特別な分岐が不要になる
 */
function withFinishingSuperArt(path: MoveNode[]): MoveNode[] {
  const targetNode = path[path.length - 1];
  const finishingSuperArtName = targetNode.branchStats?.finishingSuperArtName;
  if (!finishingSuperArtName) return path;

  const superArtNode: MoveNode = {
    id: `${targetNode.id}__finishingSuperArt`,
    moveName: finishingSuperArtName,
    attributes: [],
    specialNote: '',
    branchStats: targetNode.branchStats,
    createdBy: targetNode.createdBy,
    createdAt: targetNode.createdAt,
    children: [],
  };

  return [...path, superArtNode];
}

/**
 * node.hitIndicesを、そのhits配列で実在する段番号（1始まり）だけの昇順ソート済み一覧に
 * 正規化する。未設定・空・全段数以上の値しか無い等で対象が0件になる場合は全段を返す
 * （「全段当たった」がデフォルト）
 */
export function resolveHitIndices(stats: MoveStats, node: MoveNode): number[] {
  const total = stats.hits.length;
  const raw = node.hitIndices?.filter((n) => n >= 1 && n <= total) ?? [];
  if (raw.length === 0) return Array.from({ length: total }, (_, i) => i + 1);
  return Array.from(new Set(raw)).sort((a, b) => a - b);
}

/**
 * 複数ヒット技で、そのノードが実際に何段目が当たったか（node.hitIndices）に応じて
 * 対象のhitsだけを返す。未設定・不正な値ならそのまま全段を返す（2026-08-28ユーザー要望：
 * 1〜最終段を並べて当たった段だけクリックする、というシンプルな選び方にする）
 */
function effectiveHits(stats: MoveStats, node: MoveNode): MoveHitStats[] {
  const indices = resolveHitIndices(stats, node);
  return indices.map((i) => stats.hits[i - 1]);
}

function sumSaGaugeGain(stats: MoveStats, node: MoveNode): number {
  return effectiveHits(stats, node).reduce((sum, hit) => sum + (hit.saGaugeGain ?? 0), 0);
}

/**
 * 技名や特殊性能文字列から「Lv. N」のNを取り出す。表記揺れ（大文字「LV.」等）にも
 * 対応するため大文字小文字を区別しない
 */
function parseLevelFromText(text: string): number | null {
  const match = text.match(/lv\.?\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * node.moveNameに技名が含まれるMoveDefinitionを探す。複数の技名が部分一致しうる場合は、
 * より具体的な（長い）名前を優先する
 */
function findMoveForNode(node: MoveNode, moveList: MoveDefinition[]): MoveDefinition | undefined {
  return moveList
    .filter((move) => node.moveName.includes(move.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
}

/**
 * その技が使っているLv.の範囲(最小〜最大)を求める。強度ごとの一覧(specialVariantsByStrength)・
 * フラットな一覧(specialVariantOptions、strengthMode==='level'な技用)の両方から集める。
 * イングリッドのビームのように、最小Lv.は通常版でしか存在せず、最大Lv.はOD版でしか
 * 存在しない技で、その境界を判定するために使う。Lv.を持たない技やLv.が1種類しか無い技
 * （範囲で語る意味が無い）はnull
 */
function levelRangeForMove(move: MoveDefinition | undefined): { min: number; max: number } | null {
  if (!move) return null;

  const fromStrength = move.specialVariantsByStrength ? Object.values(move.specialVariantsByStrength).flat() : [];
  const fromFlat = move.specialVariantOptions ?? [];

  const levels = [...fromStrength, ...fromFlat]
    .map((option) => parseLevelFromText(option))
    .filter((level): level is number => level !== null);

  if (levels.length < 2) return null;
  return { min: Math.min(...levels), max: Math.max(...levels) };
}

export type OdLevelConstraint = 'normalOnly' | 'odOnly' | 'either';

/**
 * イングリッドのビーム等、通常版とOD版でLv.の範囲がずれている技で、指定した特殊性能文字列
 * （例:「ビーム|Lv. 1」）のLv.から、通常版/OD版の選択がどう制限されるかを求める。
 * 最小Lv.は通常版でしか存在せず、最大Lv.はOD版でしか存在しない（実機確認済み）。
 * 対象の技がLv.を持たない・該当しない場合はnull。
 * MoveStatsPage（技データ画面の行生成）とcalculateOdLevelConstraint（ノード側の判定）の
 * 両方から使う共通ロジック
 */
export function calculateOdLevelConstraintForVariant(
  variant: string,
  move: MoveDefinition | undefined,
): OdLevelConstraint | null {
  const level = parseLevelFromText(variant);
  if (level === null) return null;

  const range = levelRangeForMove(move);
  if (!range) return null;

  if (level <= range.min) return 'normalOnly';
  if (level >= range.max) return 'odOnly';
  return 'either';
}

/**
 * ノードのmoveNameから技を特定した上でcalculateOdLevelConstraintForVariantを呼ぶラッパー
 * （コンボ木側のノード判定用。MoveStatsPageのような技マスタ側の判定にはVariant版を直接使う）
 */
export function calculateOdLevelConstraint(
  node: MoveNode,
  moveList: MoveDefinition[],
): OdLevelConstraint | null {
  return calculateOdLevelConstraintForVariant(node.moveName, findMoveForNode(node, moveList));
}

export type OdRelevantNode = {
  node: MoveNode;
  constraint: OdLevelConstraint;
};

/**
 * root〜targetNodeId（両端含む）の経路上にある、OD/通常版の選択が関係する（Lv.を持つ）
 * ノードだけを抜き出す。末端ノードの「コンボの情報」欄から、経路の途中にあるビーム等の
 * OD使用もまとめて確認・変更できるようにするために使う（ユーザー確認済み：ビームの
 * ノードを1つずつ選び直さなくても、最終的なゲージを見ている画面から直接調整したい）
 */
export function findOdRelevantNodesOnPath(
  root: MoveNode,
  targetNodeId: string,
  moveList: MoveDefinition[],
): OdRelevantNode[] {
  const path = findPathToNode(root, targetNodeId);
  if (!path) return [];

  return path.reduce<OdRelevantNode[]>((result, node) => {
    const constraint = calculateOdLevelConstraint(node, moveList);
    if (constraint) result.push({ node, constraint });
    return result;
  }, []);
}

/**
 * usesODが付いたノードの技データ参照キーを、OD版として事前に登録されたキーへ差し替える
 * （例:「サンフレア(ビーム|Lv. 1)」→「サンフレア(ODビーム|Lv. 1)」）。OD版は通常版と
 * ダメージ・ゲージ回収量等が異なる（Dゲージ回収が無い等）ため、Lv.番号はそのままに、
 * 特殊性能欄の先頭に「OD」が付いた別データとして個別に登録してもらう方式にしている
 * （実機確認済み。以前試した「Lv.+1のデータを流用する」方式は、通常版と数値が違う項目
 * （Dゲージ回収）があったため廃止した）
 */
function applyOdVariantLookup(node: MoveNode, name: string): string {
  if (!node.usesOD) return name;

  const match = name.match(/^(.*)\((.+)\)$/);
  if (!match) return name;

  const [, prefix, variant] = match;
  return `${prefix}(OD${variant})`;
}

/**
 * 技データベースを引く際のキーを求める。末端ノード（targetNodeそのもの）が
 * `branchStats.finishingSpecialVariant`を持っていれば、ノード自体は特殊性能を選ばず
 * 技名だけ（例:「SA1」）で置かれているだけなので、実際に使った特殊性能を合成したキー
 * （例:「SA1(Lv. 1)」）を使う。それ以外は従来通りnode.moveNameそのまま。
 * さらに、usesODが付いていればapplyOdVariantLookupでOD版専用のキーへ差し替える
 */
export function lookupMoveName(node: MoveNode, isTargetNode: boolean): string {
  const variant = isTargetNode ? node.branchStats?.finishingSpecialVariant : null;
  const baseName = variant ? `${node.moveName}(${variant})` : node.moveName;
  return applyOdVariantLookup(node, baseName);
}

/**
 * SA(superArt)判定用に、moveNameから特殊性能の`(...)`部分を取り除いた「素の技名」を返す。
 * moveListに登録されているSAのMoveDefinition.nameは特殊性能を含まない素の名前
 * （例:「SA1」）なので、ノードのmoveNameが`SA1(Lv. 1)`のように特殊性能込みで確定している
 * 場合でも正しくSAとして検出できるようにする
 */
function baseMoveName(moveName: string): string {
  const parenIndex = moveName.indexOf('(');
  return parenIndex === -1 ? moveName : moveName.slice(0, parenIndex);
}

/**
 * root〜targetNodeId（両端含む）の経路上にある各ノードの技データから、SAゲージ増減の合計を求める。
 * 複数ヒット技はnode.hitIndicesが指定されていればその段のhitsだけを合計に使う
 * （effectiveHits参照。未指定なら従来通り全段）。
 * 技データが1件も登録されていない経路ではnullを返す（未入力と「合計0」を区別するため）。
 */
function buildSaGaugeSteps(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  path: MoveNode[],
): GaugeStep[] | null {
  const characterStats = moveStatsDatabase[characterId];
  if (!characterStats) return null;

  const steps: GaugeStep[] = [];
  let hasAnyData = false;

  path.forEach((node, index) => {
    const isTargetNode = index === path.length - 1;
    const stats = characterStats[lookupMoveName(node, isTargetNode)];
    if (!stats) {
      steps.push({ label: node.moveName, value: 0 });
      return;
    }
    hasAnyData = true;
    steps.push({ label: node.moveName, value: sumSaGaugeGain(stats, node) });
  });

  return hasAnyData ? steps : null;
}

export function calculateBranchSaGaugeChange(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  root: MoveNode,
  targetNodeId: string,
): number | null {
  const rawPath = findPathToNode(root, targetNodeId);
  if (!rawPath) return null;
  const path = withFinishingSuperArt(rawPath);

  const steps = buildSaGaugeSteps(characterId, moveStatsDatabase, path);
  if (!steps) return null;

  return steps.reduce((sum, step) => sum + step.value, 0);
}

/**
 * calculateBranchSaGaugeChangeと同じ計算を、1ノードずつの内訳付きで返す。
 * BranchStatsEditor.tsxのSAゲージ増加欄で、Dゲージ増減欄と同じ「合計⇄内訳」表示切替に使う。
 */
export function calculateBranchSaGaugeBreakdown(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  root: MoveNode,
  targetNodeId: string,
): { steps: GaugeStep[]; total: number } | null {
  const rawPath = findPathToNode(root, targetNodeId);
  if (!rawPath) return null;
  const path = withFinishingSuperArt(rawPath);

  const steps = buildSaGaugeSteps(characterId, moveStatsDatabase, path);
  if (!steps) return null;

  return { steps, total: steps.reduce((sum, step) => sum + step.value, 0) };
}

/**
 * root〜targetNodeId（両端含む）の経路上にあるSA（スーパーアーツ）のヒットで、相手の
 * Dゲージを削った量の合計を求める。`MoveHitStats.dGaugeChipPunishCounter`はSAに限り
 * 「ヒット時」の削り量として扱う仕様（MoveStatsPage参照）。通常技のガード時チップ
 * （`dGaugeChip`/`dGaugeChipPunishCounter`）はこの自動計算のスコープ外（未実装）。
 *
 * 末端ノードのbranchStats.isJustParryStartがtrue（常にパニッシュカウンター扱い）の場合、
 * 合計を半分にする（実機確認済み。攻撃側自身のDゲージ増減=calculateBranchDGaugeChangeとは独立）。
 * 技データが1件も登録されていない経路ではnullを返す（未入力と「合計0」を区別するため）。
 */
export function calculateBranchOpponentDGaugeChip(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  root: MoveNode,
  targetNodeId: string,
): number | null {
  const rawPath = findPathToNode(root, targetNodeId);
  if (!rawPath) return null;
  const path = withFinishingSuperArt(rawPath);

  const characterStats = moveStatsDatabase[characterId];
  if (!characterStats) return null;

  let total = 0;
  let hasAnyData = false;

  path.forEach((node, index) => {
    const isSuperArt = moveList.some(
      (move) => move.name === baseMoveName(node.moveName) && move.category === 'superArt',
    );
    if (!isSuperArt) return;

    const isTargetNode = index === path.length - 1;
    const stats = characterStats[lookupMoveName(node, isTargetNode)];
    if (!stats) return;
    hasAnyData = true;
    total += effectiveHits(stats, node).reduce((sum, hit) => sum + (hit.dGaugeChipPunishCounter ?? 0), 0);
  });

  if (!hasAnyData) return null;

  const targetNode = path[path.length - 1];
  const isJustParryStart = targetNode.branchStats?.isJustParryStart ?? false;
  return isJustParryStart ? Math.round(total / 2) : total;
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
 * - 「キャンセルラッシュ」ノードより後は、通常技のヒット回復が0になる。ラッシュ中に回復
 *   できるのは「歩き」（moveNameに「歩き」を含むノード。技データが未登録なら結局寄与0）と
 *   SA技（`dGaugeGainDuringRush`の値。CAも含む。未入力なら0）だけで、それ以外の手段は
 *   無い（実機確認済み。以前あった`dGaugeRecoveryBlocked`という個別ノードの手動除外は
 *   このルールだけで表現しきれるため廃止した）
 * - 「生ラッシュ」自体は回復抑制の対象外（inRushにしない）だが、生ラッシュ自身のコスト
 *   （マイナスのdGaugeGain）は、既にキャンセルラッシュ中でも常に加算される
 * - 空振り属性のノードは寄与0
 * - ガード属性のノードは、ガード時回復量のデータが無いため現状は寄与0
 * - 歩行の実時間ベースの回復量そのものの算出（フレーム数→回復量の換算）、ラッシュ終了2秒後の
 *   回復再開はスコープ外（このツールはコンボを技の並びとして記録するもので、実時間の経過を
 *   扱う仕組みが無いため。歩きノードの技データが登録されていれば、その値をそのまま使う）
 * - 経路上で最初にゲージを消費する技（キャンセルラッシュ/生ラッシュ、またはusesODが付いた
 *   ノード）より前に得た回復（Dゲージが元々MAXの状態から始めた場合、実際には得られない
 *   可能性がある分）は、合計（calculateBranchDGaugeChange・calculateBranchDGaugeBreakdown.total）
 *   からは除かず含めたまま計算する。除いた場合の参考値は
 *   calculateBranchDGaugeBreakdown.totalExcludingEarlyRecoveryで別途返し、
 *   BranchStatsEditor.tsx側では「-25500(-27500)」のように合計欄へ括弧書きで併記する
 *   （2026-08-26ユーザー指定: 含める/除くを手動で選ばせるチェックボックスは廃止し、
 *   内訳の1ステップずつではなく合計欄の括弧で意味を伝える方式に変更）
 *
 * 技データが1件も登録されていない経路ではnullを返す（未入力と「合計0」を区別するため）。
 */
export type GaugeStep = {
  label: string; // ノードの技名（表示用）
  value: number; // このノード1つぶんのゲージ増減（Dゲージ・SAゲージ共通で使う）
  // Dゲージ限定: 経路上で最初にゲージを消費する技より前のステップ（totalExcludingEarlyRecovery
  // の算出にのみ使う内部フラグ。内訳表示の1ステップずつには反映しない）。SAゲージでは常にfalse
  isEarlyRecovery?: boolean;
  // Dゲージ限定: 「ゲージが0でなければ発動できる」消費行動（キャンセルラッシュ/生ラッシュ/
  // usesODが付いたノード）かどうか。calculateBranchDGaugeMinimumRequiredの判定にのみ使う。
  // SAゲージでは常にfalse
  isConsuming?: boolean;
};

/**
 * calculateBranchDGaugeChange/calculateBranchDGaugeBreakdownで共有する経路走査本体。
 * 「+200→+200→-20000」のような1ノードずつの内訳（contributions）を返す
 * （経路上で最初にゲージを消費する技より前のステップにはisEarlyRecovery:trueを付ける）。
 */
function buildDGaugeContributions(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  path: MoveNode[],
): { contributions: GaugeStep[] } | null {
  const characterStats = moveStatsDatabase[characterId];
  if (!characterStats) return null;

  let hasAnyData = false;
  let inRush = false;
  const contributions: GaugeStep[] = [];
  let firstConsumptionIndex: number | null = null;

  path.forEach((node, index) => {
    const isTargetNode = index === path.length - 1;
    const stats = characterStats[lookupMoveName(node, isTargetNode)];
    const isConsumingNode = RUSH_MOVE_NAMES.has(node.moveName) || (node.usesOD ?? false);
    if (isConsumingNode && firstConsumptionIndex === null) firstConsumptionIndex = index;

    if (RUSH_MOVE_NAMES.has(node.moveName)) {
      let value = 0;
      if (stats) {
        hasAnyData = true;
        value = effectiveHits(stats, node).reduce((sum, hit) => sum + (hit.dGaugeGain ?? 0), 0);
      }
      contributions.push({ label: node.moveName, value, isConsuming: true });
      if (node.moveName === CANCEL_RUSH_MOVE_NAME) inRush = true;
      return;
    }

    if (node.attributes.some((attribute) => attribute.type === 'whiff')) {
      contributions.push({ label: node.moveName, value: 0, isConsuming: isConsumingNode });
      return;
    }
    if (node.attributes.some((attribute) => attribute.type === 'guard')) {
      contributions.push({ label: node.moveName, value: 0, isConsuming: isConsumingNode }); // ガード回復量は未実装
      return;
    }

    if (!stats) {
      contributions.push({ label: node.moveName, value: 0, isConsuming: isConsumingNode });
      return;
    }
    hasAnyData = true;

    const isSuperArt = moveList.some(
      (move) => move.name === baseMoveName(node.moveName) && move.category === 'superArt',
    );
    // 歩きはラッシュ中でも例外的に回復できる（実機確認済み）。usesODが付いたノードも、
    // OD版として登録された数値（例: OD発動コストを織り込んだ-20000）自体が実際の
    // 収支そのものなので、ラッシュ中の「非SA技は回復0」ルールの対象外にする
    // （そうしないとOD使用時の値が握りつぶされ、ODチェックが効かなくなってしまう）
    const isWalkMove = node.moveName.includes('歩き');

    const value = effectiveHits(stats, node).reduce((sum, hit) => {
      if (!inRush || isWalkMove || node.usesOD) return sum + (hit.dGaugeGain ?? 0);
      return sum + (isSuperArt ? (hit.dGaugeGainDuringRush ?? 0) : 0);
    }, 0);
    contributions.push({ label: node.moveName, value, isConsuming: isConsumingNode });
  });

  if (!hasAnyData) return null;

  if (firstConsumptionIndex !== null) {
    for (let i = 0; i < firstConsumptionIndex; i += 1) {
      contributions[i] = { ...contributions[i], isEarlyRecovery: true };
    }
  }

  return { contributions };
}

export function calculateBranchDGaugeChange(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  root: MoveNode,
  targetNodeId: string,
): number | null {
  const rawPath = findPathToNode(root, targetNodeId);
  if (!rawPath) return null;
  const path = withFinishingSuperArt(rawPath);

  const built = buildDGaugeContributions(characterId, moveStatsDatabase, moveList, path);
  if (!built) return null;

  return built.contributions.reduce((sum, step) => sum + step.value, 0);
}

/**
 * calculateBranchDGaugeChangeと同じ計算を、1ノードずつの内訳（例:「+200→+200→-20000」）
 * 付きで返す。BranchStatsEditor.tsxのDゲージ増減欄で、合計表示⇄内訳表示をワンボタンで
 * 切り替えるために使う（内訳の合計は必ずtotalと一致する）。
 *
 * totalExcludingEarlyRecovery: 経路上で最初にゲージを消費する技（キャンセルラッシュ/生ラッシュ/
 * usesOD）より前に得た回復を除いた場合の総量（Dゲージが元々MAXの状態から始めた場合、
 * 実際には得られない可能性がある分を除いた参考値）。totalと同じ内容ならUI側では表示しない
 * （2026-08-26ユーザー指定: 内訳の各ステップを括弧書きするのではなく、合計欄に
 * 「-25500(-27500)」のように主要な総量(total)＋除いた場合の総量を括弧で併記する）。
 */
export function calculateBranchDGaugeBreakdown(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  root: MoveNode,
  targetNodeId: string,
): { steps: GaugeStep[]; total: number; totalExcludingEarlyRecovery: number } | null {
  const rawPath = findPathToNode(root, targetNodeId);
  if (!rawPath) return null;
  const path = withFinishingSuperArt(rawPath);

  const built = buildDGaugeContributions(characterId, moveStatsDatabase, moveList, path);
  if (!built) return null;

  return {
    steps: built.contributions,
    total: built.contributions.reduce((sum, step) => sum + step.value, 0),
    totalExcludingEarlyRecovery: built.contributions
      .filter((step) => !step.isEarlyRecovery)
      .reduce((sum, step) => sum + step.value, 0),
  };
}

/**
 * このコンボを最後まで遂行するために最低限必要な開始時Dゲージ量を求める。
 *
 * SF6のDゲージは「0でなければ消費行動を発動できる」仕様（例: 本来30000必要な
 * キャンセルラッシュも、1でも残っていれば発動できる。消費後の残量はマイナスにはならず
 * 0にfloorされる）。そのため、単純に各消費行動の必要量を合計する（＝満額を毎回持っている
 * 前提の計算）のではなく、「消費行動の直前で残量が1でも残っているか」を実際にシミュレーション
 * して判定する必要がある。floorが挟まると、直前の消費で残量が0になった場合その後の回復は
 * 開始時ゲージ量に依存せず決まってしまう（＝それより前の余剰は意味を失う）ため、
 * 経路の途中に足りない箇所があっても後続の回復で帳尻が合うことがあり、逆に消費行動が
 * 連続していて間に回復が無いと単純な合計よりずっと多くのゲージが必要になることもある。
 * この非線形な挙動を正しく扱うため、開始時ゲージ量Xを二分探索し、実際にfloor付きで
 * シミュレーションして成功する最小のXを返す（Xを増やすほど各時点の残量は単調に
 * 増える、という性質を利用した二分探索）。
 *
 * 経路上に消費行動が1つも無ければ0を返す（このコンボはDゲージが無くても遂行できる）。
 * 技データが1件も登録されていない経路ではnullを返す（未入力と「0」を区別するため）。
 */
export function calculateBranchDGaugeMinimumRequired(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  root: MoveNode,
  targetNodeId: string,
): number | null {
  const rawPath = findPathToNode(root, targetNodeId);
  if (!rawPath) return null;
  const path = withFinishingSuperArt(rawPath);

  const built = buildDGaugeContributions(characterId, moveStatsDatabase, moveList, path);
  if (!built) return null;

  const steps = built.contributions;
  if (!steps.some((step) => step.isConsuming)) return 0;

  const succeedsWithStart = (start: number): boolean => {
    let gauge = start;
    for (const step of steps) {
      if (step.isConsuming && gauge <= 0) return false;
      gauge = Math.max(0, gauge + step.value);
    }
    return true;
  };

  // 消費行動ぶんの名目コストを全て順番に払い切れる量を安全な上限にする
  // （+1は「0ではなく1でも残っていればよい」という余裕分）
  const upperBound =
    steps
      .filter((step) => step.isConsuming)
      .reduce((sum, step) => sum + Math.abs(Math.min(0, step.value)), 0) + 1;

  let lo = 1;
  let hi = upperBound;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (succeedsWithStart(mid)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

/**
 * startBase: 1発目自身の表示ダメージに使う基準値。
 * scalingBase: 2発目以降の減衰ペースが基準にする値（省略時はcalculateDamageScalingPath側の
 * デフォルト=100）。カウンター/パニカン始動の120%は1発目への一回限りのボーナスで、2発目
 * 以降は通常の100%始動と同じペースで減衰することが実機確認済みのため、scalingBaseは返さない
 * （＝100のまま）。ジャストパリィ始動はパニカン(120%)の50%＝60%スタートのまま2発目以降も
 * その基準で標準テーブルの段を進む（技固有の補正がテーブル位置を特定する起点になる）ことが
 * 実機確認済みのため、scalingBaseにもstartBaseと同じ60を使う。
 * floorScale: 非SAの最低保証(8%/10%)にかける倍率。ジャストパリィ始動は最低保証も半分
 * （4%/5%）になることが実機確認済み。SA自身のminDamageGuaranteePercentは対象外（変化なし）
 * naturalStepScale: 技固有の補正が無いヒットの「標準テーブルからの自然な1段ぶんの減衰」に
 * かける倍率。ジャストパリィ始動はこの自然減衰だけ半分になることが実機確認済み（技固有の
 * 補正による直接引き算は満額のまま、対象外）
 */
function startBaseFromPath(
  path: MoveNode[],
): { startBase: number; scalingBase?: number; floorScale?: number; naturalStepScale?: number } {
  const targetNode = path[path.length - 1];
  const branchStats = targetNode.branchStats;
  const condition = effectiveStartHitCondition(branchStats, path);
  const isJustParryStart = branchStats?.isJustParryStart ?? false;
  // ジャストパリィ始動は常にパニッシュカウンター扱いのため、始動条件トグルが未設定でも
  // パニカン(120%)の50%＝60%スタートにする（BranchStatsEditor.tsx側でも同じ考え方で
  // パニッシュカウンターへ自動で引き上げているが、閲覧専用ビュー等その自動引き上げが
  // 効かない経路の保険も兼ねる）
  if (isJustParryStart) {
    return { startBase: 60, scalingBase: 60, floorScale: 0.5, naturalStepScale: 0.5 };
  }
  if (condition === 'カウンター' || condition === 'パニカン') return { startBase: 120 };
  return { startBase: 100 };
}

type FlatDamageHit = DamageHitInput & { damage: number; moveName: string; hitLabel: string };

function buildFlatDamageHits(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  path: MoveNode[],
): {
  flatHits: FlatDamageHit[];
  rushTriggerPosition: number | null;
  startBase: number;
  scalingBase?: number;
  floorScale?: number;
  naturalStepScale?: number;
} | null {
  const characterStats = moveStatsDatabase[characterId];
  if (!characterStats) return null;

  const { startBase, scalingBase, floorScale, naturalStepScale } = startBaseFromPath(path);

  const flatHits: FlatDamageHit[] = [];
  let rushTriggerPosition: number | null = null;
  let hasAnyData = false;

  path.forEach((node, index) => {
    const isTargetNode = index === path.length - 1;
    if (node.attributes.some((attribute) => attribute.type === 'whiff')) return;
    if (node.attributes.some((attribute) => attribute.type === 'guard')) return; // ガードはダメージ0

    const stats = characterStats[lookupMoveName(node, isTargetNode)];
    const isSuperArt = moveList.some(
      (move) => move.name === baseMoveName(node.moveName) && move.category === 'superArt',
    );
    // キャンセルラッシュ/生ラッシュは名前で判定するシステム動作。加えて、チャージ等の
    // 「技データにdamage:0と明示登録されている＝実際にはダメージが存在しない行動」も同じ
    // 扱いにする（標準テーブルの段を進めない。位置は消費するが、ダメージ計算上の"1ヒット"
    // としては扱わない）。技データ未登録（damageがnullで0埋めしているだけ）は対象外
    // ——実戦では本来ヒットしているはずなので、従来通り段を進める
    const isRushMove = RUSH_MOVE_NAMES.has(node.moveName);

    if (stats) {
      hasAnyData = true;
      effectiveHits(stats, node).forEach((hit, hitIndex) => {
        flatHits.push({
          damage: hit.damage ?? 0,
          modifierText: hit.modifier,
          isSuperArt,
          minDamageGuaranteePercent: hit.minDamageGuaranteePercent,
          isSystemAction: isRushMove || hit.damage === 0,
          // 同じ技の複数ヒット(強Kの2段目等)は、登録時にsharesModifierAcrossHitsが立って
          // いれば1段目とテーブルの段を共有する（詳細はdamageModifierCalc.ts参照）
          sharesTableStepWithPrevious: stats.sharesModifierAcrossHits && hitIndex > 0,
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
  });

  if (!hasAnyData || flatHits.length === 0) return null;

  return { flatHits, rushTriggerPosition, startBase, scalingBase, floorScale, naturalStepScale };
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
  const rawPath = findPathToNode(root, targetNodeId);
  if (!rawPath) return null;
  const path = withFinishingSuperArt(rawPath);

  const built = buildFlatDamageHits(characterId, moveStatsDatabase, moveList, path);
  if (!built) return null;

  const { flatHits, rushTriggerPosition, startBase, scalingBase, floorScale, naturalStepScale } = built;
  const percents = calculateDamageScalingPath(flatHits, rushTriggerPosition, startBase, scalingBase, floorScale, naturalStepScale);
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
 * calculateBranchDamageと同じ計算を、1ヒットずつの内訳付きで返す。
 * BranchStatsEditor.tsxの「計算式」ボタンから、普段は閉じた状態で見せる
 * （計算根拠を見たい人向けの正式な機能。デバッグ調査用の一時的なものではない）。
 */
export function calculateBranchDamageBreakdown(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
  root: MoveNode,
  targetNodeId: string,
): DamageBreakdown | null {
  const rawPath = findPathToNode(root, targetNodeId);
  if (!rawPath) return null;
  const path = withFinishingSuperArt(rawPath);

  const built = buildFlatDamageHits(characterId, moveStatsDatabase, moveList, path);
  if (!built) return null;

  const { flatHits, rushTriggerPosition, startBase, scalingBase, floorScale, naturalStepScale } = built;
  const percents = calculateDamageScalingPath(flatHits, rushTriggerPosition, startBase, scalingBase, floorScale, naturalStepScale);

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
