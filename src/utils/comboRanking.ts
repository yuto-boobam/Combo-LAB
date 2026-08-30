// src/utils/comboRanking.ts
// 「コンボ評価一覧」機能: すべての木を横断して、branchStatsを持ちうる終端（コンボの締め）を
// 一覧化する。ソート・フィルタはこの一覧の表示上だけで完結し、実データ（木の並び順）には
// 一切手を付けない（ユーザー要望: 一覧をソートしても、元の並び順にいつでも戻せる必要がある）。
//
// 汎用コンボ（root.startingMoveOptions）の終端は、末端に保存された1つの選択
// （branchStats.startingMoveNames）だけを見るのではなく、候補一覧の数だけ行を展開し、
// それぞれの候補を実際に選んだと仮定してダメージ・ゲージを都度計算する
// （2026-08-30ユーザー指摘:「本当ならこのコンボが始動技の数だけ表示されるべき」。
// 「どの始動技なら何ダメージなのか」を無視して1行にまとめてしまうと、始動技ごとの
// 比較ができなくなるため）。実データは一切書き換えず、この一覧の表示専用の計算。

import type { ComboBranchStats, ComboTree, MoveDefinition, MoveNode, MoveStatsDatabase } from '../types';
import { DEFAULT_BRANCH_STATS } from './branchStatsDefaults';
import {
  calculateBranchDamage,
  calculateBranchDGaugeChange,
  calculateBranchOpponentDGaugeChip,
  calculateBranchSaGaugeChange,
} from './comboGaugeCalc';
import { expandStarterMoveOptions } from './starterMoveOptions';

export type ComboEndingSummary = {
  /** 一覧の1行を一意に識別するキー（汎用コンボは候補ごとに複数行に展開するためnodeIdだけでは重複する） */
  key: string;
  /** 実ノードのID。「→ジャンプ」は常にこのノードへ飛ぶ（展開後の行がどれでも同じ場所） */
  nodeId: string;
  treeId: string;
  /** 始動技（通常の木は木のラベル。汎用コンボはこの行が表す具体的な始動技の並び） */
  starterLabel: string;
  /** 始動技の直後から対象ノードまでの技名を「→」で繋いだ経路（対象ノードが始動技自身の場合は空文字） */
  pathLabel: string;
  /** 対象ノード自身の表示名 */
  endingLabel: string;
  branchStats: ComboBranchStats | null;
  /**
   * 汎用コンボで、この行の始動技が実際に選ばれている（branchStats.startingMoveNamesと一致する）か。
   * 通常の木では常にtrue。falseの行はダメージ・ゲージだけを仮計算した参考行で、
   * 評価・お気に入り等の手入力項目はまだ無い（実際に選ぶまでは記録できないため）
   */
  isSelectedStarter: boolean;
};

/**
 * 「コンボの情報」欄が表示される対象と同じ判定
 * （葉ノード、またはガード/空振り属性、またはrecordsBranchStats。SideDrawerPanel.tsx参照）
 */
function isComboEndpoint(node: MoveNode): boolean {
  return (
    node.children.length === 0 ||
    node.attributes.some((attribute) => attribute.type === 'guard' || attribute.type === 'whiff') ||
    (node.recordsBranchStats ?? false)
  );
}

function labelOf(node: MoveNode): string {
  return node.displayName ?? node.moveName;
}

/** rootの中でnodeIdに一致するノードだけbranchStatsを差し替えた木を返す（実データには手を付けない） */
function withOverriddenBranchStats(root: MoveNode, nodeId: string, branchStats: ComboBranchStats): MoveNode {
  if (root.id === nodeId) return { ...root, branchStats };
  if (root.children.length === 0) return root;
  return { ...root, children: root.children.map((child) => withOverriddenBranchStats(child, nodeId, branchStats)) };
}

function sameStarter(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

export function collectComboEndingSummaries(
  trees: ComboTree[],
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  moveList: MoveDefinition[],
): ComboEndingSummary[] {
  const summaries: ComboEndingSummary[] = [];

  trees.forEach((tree) => {
    const starterCandidates = expandStarterMoveOptions(tree.root.startingMoveOptions ?? []);
    const isGeneric = starterCandidates.length > 0;

    const visit = (node: MoveNode, path: MoveNode[]) => {
      const nextPath = [...path, node];

      if (isComboEndpoint(node)) {
        const pathLabel = nextPath.slice(1).map(labelOf).join(' → ');
        const endingLabel = labelOf(node);
        const selectedStarter = node.branchStats?.startingMoveNames ?? null;

        if (!isGeneric) {
          summaries.push({
            key: node.id,
            nodeId: node.id,
            treeId: tree.id,
            starterLabel: tree.label,
            pathLabel,
            endingLabel,
            branchStats: node.branchStats,
            isSelectedStarter: true,
          });
        } else {
          // 計算の入力には常に実データ(branchStats)を使う（finishingSuperArtName等の
          // 「このendingがどう終わるか」を表す設定は、どの始動技で辿り着いたかに関わらず
          // 共通して当てはまるため）。startingMoveNamesだけを候補ごとに差し替える
          const baseBranchStats = node.branchStats ?? DEFAULT_BRANCH_STATS;

          starterCandidates.forEach((candidate, index) => {
            const isSelected = selectedStarter !== null && sameStarter(selectedStarter, candidate);

            const whatIfRoot = withOverriddenBranchStats(tree.root, node.id, {
              ...baseBranchStats,
              startingMoveNames: candidate,
            });

            const damage = calculateBranchDamage(characterId, moveStatsDatabase, moveList, whatIfRoot, node.id);
            const dGaugeChange = calculateBranchDGaugeChange(
              characterId,
              moveStatsDatabase,
              moveList,
              whatIfRoot,
              node.id,
            );
            const opponentDGaugeChip = calculateBranchOpponentDGaugeChip(
              characterId,
              moveStatsDatabase,
              moveList,
              whatIfRoot,
              node.id,
            );
            const saGaugeGain = calculateBranchSaGaugeChange(characterId, moveStatsDatabase, whatIfRoot, node.id);

            summaries.push({
              key: `${node.id}::${index}`,
              nodeId: node.id,
              treeId: tree.id,
              starterLabel: candidate.join(' → '),
              pathLabel,
              endingLabel,
              isSelectedStarter: isSelected,
              branchStats: {
                // 評価・お気に入り等の手入力項目は、実際に選ばれている始動技の行にのみ残す
                // （試していない仮の始動技にまで実データの評価を横流ししないようにする）
                ...(isSelected ? baseBranchStats : DEFAULT_BRANCH_STATS),
                startingMoveNames: candidate,
                damage,
                dGaugeChange,
                opponentDGaugeChip,
                saGaugeGain,
              },
            });
          });
        }
      }

      node.children.forEach((child) => visit(child, nextPath));
    };

    visit(tree.root, []);
  });

  return summaries;
}

export type ComboRankingSortKey =
  | 'damage'
  | 'overallRating'
  | 'damageRating'
  | 'dGaugeRating'
  | 'saGaugeRating'
  | 'carryRating';

export const COMBO_RANKING_SORT_LABELS: Record<ComboRankingSortKey, string> = {
  damage: 'ダメージ',
  overallRating: '総合評価',
  damageRating: 'ダメージ評価',
  dGaugeRating: 'Dゲージ評価',
  saGaugeRating: 'SAゲージ評価',
  carryRating: '運び評価',
};

function valueFor(summary: ComboEndingSummary, key: ComboRankingSortKey): number | null {
  return summary.branchStats?.[key] ?? null;
}

/**
 * 指定キーで降順/昇順にソートする。値が未入力(null)のものは常に末尾に置く
 * （ソートした時に未入力のコンボが上に来て紛らわしいことが無いようにする）。
 */
export function sortComboEndingSummaries(
  summaries: ComboEndingSummary[],
  key: ComboRankingSortKey,
  direction: 'asc' | 'desc',
): ComboEndingSummary[] {
  const withValue: { summary: ComboEndingSummary; value: number }[] = [];
  const withoutValue: ComboEndingSummary[] = [];

  summaries.forEach((summary) => {
    const value = valueFor(summary, key);
    if (value === null) {
      withoutValue.push(summary);
    } else {
      withValue.push({ summary, value });
    }
  });

  withValue.sort((a, b) => (direction === 'desc' ? b.value - a.value : a.value - b.value));

  return [...withValue.map((entry) => entry.summary), ...withoutValue];
}
