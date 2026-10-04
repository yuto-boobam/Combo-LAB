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

import type {
  ComboBranchStats,
  ComboTree,
  FinishingMoveOption,
  MoveDefinition,
  MoveNode,
  MoveStatsDatabase,
} from '../types';
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

function finishingMoveLabel(option: FinishingMoveOption): string {
  // 表示用ラベルは全角括弧を使う（BranchStatsEditor.tsxの表示と合わせる。技データベースの
  // 参照キーに使う半角括弧の`${name}(${variant})`形式とは別物）
  return option.specialVariant ? `${option.name}（${option.specialVariant}）` : option.name;
}

/**
 * この技で締めた場合専用の評価・記録項目を一覧の行へ反映する。ノード自身（何も追加しない
 * ベース行）の評価とは独立のため、baseBranchStatsからは引き継がず、未入力の項目は
 * 「このendingの評価」として素直にnull/falseのまま表示する（2026-10-03ユーザー要望：
 * SA2で締めた場合とSA3で締めた場合で、評価や終わり際のプラスフレーム等を分けて確認したい）
 */
function finishingMoveOptionOverrides(option: FinishingMoveOption) {
  return {
    damageRating: option.damageRating ?? null,
    dGaugeRating: option.dGaugeRating ?? null,
    saGaugeRating: option.saGaugeRating ?? null,
    carryRating: option.carryRating ?? null,
    okizemeRating: option.okizemeRating ?? null,
    difficultyRating: option.difficultyRating ?? null,
    overallRating: option.overallRating ?? null,
    plusFrame: option.plusFrame ?? null,
    isThrowRange: option.isThrowRange ?? false,
    canOkizeme: option.canOkizeme ?? false,
  };
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
        const baseEndingLabel = labelOf(node);
        const selectedStarter = node.branchStats?.startingMoveNames ?? null;
        // このノードに登録された「この後に繋ぐこともある技」（複数登録可）。何も追加しない
        // パターン（このノード自身で終わる。従来通りの行）に加え、登録した技の数だけ
        // 追加の行を展開する（2026-10-03ユーザー要望：A→Bで終わる／A→B→C／A→B→SAのように
        // 分岐しうる終わり方を、木を分けずにそれぞれダメージ等を確認できるようにしたい）
        const finishingMoveOptions = node.branchStats?.finishingMoveOptions ?? [];

        if (!isGeneric) {
          // ベース行（何も追加しない＝このノード自身で終わる）は、従来通り実データを
          // そのまま使う（再計算しない。damage等は既にノード側で自動計算・保存済み）
          summaries.push({
            key: node.id,
            nodeId: node.id,
            treeId: tree.id,
            starterLabel: tree.label,
            pathLabel,
            endingLabel: baseEndingLabel,
            branchStats: node.branchStats,
            isSelectedStarter: true,
          });

          const baseBranchStats = node.branchStats ?? DEFAULT_BRANCH_STATS;
          finishingMoveOptions.forEach((option, optionIndex) => {
            const damage = calculateBranchDamage(characterId, moveStatsDatabase, moveList, tree.root, node.id, option);
            const dGaugeChange = calculateBranchDGaugeChange(
              characterId,
              moveStatsDatabase,
              moveList,
              tree.root,
              node.id,
              option,
            );
            const opponentDGaugeChip = calculateBranchOpponentDGaugeChip(
              characterId,
              moveStatsDatabase,
              moveList,
              tree.root,
              node.id,
              option,
            );
            const saGaugeGain = calculateBranchSaGaugeChange(
              characterId,
              moveStatsDatabase,
              tree.root,
              node.id,
              option,
            );

            summaries.push({
              key: `${node.id}::finishing::${optionIndex}`,
              nodeId: node.id,
              treeId: tree.id,
              starterLabel: tree.label,
              pathLabel,
              endingLabel: `${baseEndingLabel} → ${finishingMoveLabel(option)}`,
              isSelectedStarter: true,
              branchStats: {
                ...baseBranchStats,
                damage,
                dGaugeChange,
                opponentDGaugeChip,
                saGaugeGain,
                ...finishingMoveOptionOverrides(option),
              },
            });
          });
        } else {
          // 計算の入力には常に実データ(branchStats)を使う（評価等の「このendingがどう
          // 終わるか」を表す設定は、どの始動技で辿り着いたかに関わらず共通して当てはまる
          // ため）。startingMoveNamesだけを候補ごとに差し替える
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
              endingLabel: baseEndingLabel,
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

            finishingMoveOptions.forEach((option, optionIndex) => {
              const optionDamage = calculateBranchDamage(
                characterId,
                moveStatsDatabase,
                moveList,
                whatIfRoot,
                node.id,
                option,
              );
              const optionDGaugeChange = calculateBranchDGaugeChange(
                characterId,
                moveStatsDatabase,
                moveList,
                whatIfRoot,
                node.id,
                option,
              );
              const optionOpponentDGaugeChip = calculateBranchOpponentDGaugeChip(
                characterId,
                moveStatsDatabase,
                moveList,
                whatIfRoot,
                node.id,
                option,
              );
              const optionSaGaugeGain = calculateBranchSaGaugeChange(
                characterId,
                moveStatsDatabase,
                whatIfRoot,
                node.id,
                option,
              );

              summaries.push({
                key: `${node.id}::${index}::finishing::${optionIndex}`,
                nodeId: node.id,
                treeId: tree.id,
                starterLabel: candidate.join(' → '),
                pathLabel,
                endingLabel: `${baseEndingLabel} → ${finishingMoveLabel(option)}`,
                isSelectedStarter: isSelected,
                branchStats: {
                  ...(isSelected ? baseBranchStats : DEFAULT_BRANCH_STATS),
                  startingMoveNames: candidate,
                  damage: optionDamage,
                  dGaugeChange: optionDGaugeChange,
                  opponentDGaugeChip: optionOpponentDGaugeChip,
                  saGaugeGain: optionSaGaugeGain,
                  ...finishingMoveOptionOverrides(option),
                },
              });
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
  | 'carryRating'
  | 'okizemeRating'
  | 'difficultyRating';

export const COMBO_RANKING_SORT_LABELS: Record<ComboRankingSortKey, string> = {
  damage: 'ダメージ',
  overallRating: '総合評価',
  damageRating: 'ダメージ評価',
  dGaugeRating: 'Dゲージ評価',
  saGaugeRating: 'SAゲージ評価',
  carryRating: '運び評価',
  okizemeRating: '起き攻め内容評価',
  difficultyRating: '難易度評価',
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
