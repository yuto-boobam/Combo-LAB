// src/utils/comboRanking.ts
// 「コンボ評価一覧」機能: すべての木を横断して、branchStatsを持ちうる終端（コンボの締め）を
// 一覧化する。ソート・フィルタはこの一覧の表示上だけで完結し、実データ（木の並び順）には
// 一切手を付けない（ユーザー要望: 一覧をソートしても、元の並び順にいつでも戻せる必要がある）。

import type { ComboBranchStats, ComboTree, MoveNode } from '../types';

export type ComboEndingSummary = {
  nodeId: string;
  treeId: string;
  /** 始動技（木のラベル。ツリー見出しに表示されているものと同じ） */
  starterLabel: string;
  /** 始動技の直後から対象ノードまでの技名を「→」で繋いだ経路（対象ノードが始動技自身の場合は空文字） */
  pathLabel: string;
  /** 対象ノード自身の表示名 */
  endingLabel: string;
  branchStats: ComboBranchStats | null;
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

/**
 * rootがMoveNode.startingMoveOptions（「汎用コンボ」）を持つ場合、この終端で実際に
 * 選ばれた始動技の並び（branchStats.startingMoveNames、ジャンプ攻撃始動のように
 * 複数技のこともある）を「→」で繋いで優先的に返す。未選択ならその旨がわかるように
 * tree.labelへ「(始動技未選択)」を添える。通常の木ではtree.labelをそのまま返す
 */
function starterLabelFor(tree: ComboTree, node: MoveNode): string {
  if (!tree.root.startingMoveOptions || tree.root.startingMoveOptions.length === 0) {
    return tree.label;
  }
  const startingMoveNames = node.branchStats?.startingMoveNames;
  if (!startingMoveNames || startingMoveNames.length === 0) return `${tree.label}(始動技未選択)`;
  return startingMoveNames.join(' → ');
}

export function collectComboEndingSummaries(trees: ComboTree[]): ComboEndingSummary[] {
  const summaries: ComboEndingSummary[] = [];

  trees.forEach((tree) => {
    const visit = (node: MoveNode, path: MoveNode[]) => {
      const nextPath = [...path, node];

      if (isComboEndpoint(node)) {
        summaries.push({
          nodeId: node.id,
          treeId: tree.id,
          starterLabel: starterLabelFor(tree, node),
          pathLabel: nextPath.slice(1).map(labelOf).join(' → '),
          endingLabel: labelOf(node),
          branchStats: node.branchStats,
        });
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
