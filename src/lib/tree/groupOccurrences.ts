// src/lib/tree/groupOccurrences.ts
// 「グループ表示モード」用: 名前付きグループの全出現箇所を、木を横断して集める。
// groupView.ts の buildGroupView と同じ「groupIdで連結された部分木全体」判定
// (collectGroupChain) を使うが、ピルに折りたたむのではなく、区間そのものを
// 「分岐を保ったままの表示用の木」として取り出す（実データには一切手を入れない）。

import type { MoveNode } from '../../types';
import { collectGroupChain } from './groupView';

export type GroupOccurrence = {
  groupId: string;
  groupName: string;
  treeId: string;
  treeLabel: string;
  /** 区間内の実ノードID（先頭からの走査順） */
  memberIds: string[];
  /**
   * 区間だけを取り出した表示用の木（分岐があればそのまま保つ）。実ノードのシャロー
   * クローンで、区間の外に出た子は含めない（別のグループ/通常ノードはこの一覧では
   * 表示しないため）
   */
  root: MoveNode;
};

function buildOccurrenceRoot(startNode: MoveNode, groupId: string): MoveNode {
  const clone = (node: MoveNode): MoveNode => ({
    ...node,
    children: node.children.filter((child) => child.groupId === groupId).map(clone),
  });
  return clone(startNode);
}

/**
 * trees を全ノード走査し、groupIdが連続する区間の先頭に当たるノードを見つけるたびに
 * 1件の出現として記録する。区間の末尾から先（区間外）も、新たな出現の起点になりうるため
 * 引き続き走査する（buildGroupViewのtransformと同じ再帰の考え方）。
 */
export function findGroupOccurrences(
  trees: { id: string; label: string; root: MoveNode }[],
  groupNameById: Map<string, string>,
): GroupOccurrence[] {
  const occurrences: GroupOccurrence[] = [];

  const visit = (
    node: MoveNode,
    parentGroupId: string | undefined,
    treeId: string,
    treeLabel: string,
  ): void => {
    const startsNewGroup = Boolean(node.groupId) && node.groupId !== parentGroupId;

    if (startsNewGroup) {
      const groupId = node.groupId as string;
      const { memberIds, boundaryChildren } = collectGroupChain(node, groupId);

      occurrences.push({
        groupId,
        groupName: groupNameById.get(groupId) ?? '(不明なグループ)',
        treeId,
        treeLabel,
        memberIds,
        root: buildOccurrenceRoot(node, groupId),
      });

      boundaryChildren.forEach((child) => visit(child, undefined, treeId, treeLabel));
      return;
    }

    node.children.forEach((child) => visit(child, node.groupId, treeId, treeLabel));
  };

  trees.forEach((tree) => visit(tree.root, undefined, tree.id, tree.label));

  return occurrences.sort((a, b) => a.groupName.localeCompare(b.groupName, 'ja'));
}
