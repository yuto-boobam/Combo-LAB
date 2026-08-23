// src/lib/tree/groupView.ts
// 「共通区間を名前付きグループとして折りたたむ」機能の表示変換。
//
// MoveNode.groupId が連結された部分木全体（分岐があっても、分岐先の子が同じgroupIdなら
// そのまま含める）を、実データには一切手を加えず、描画直前だけ1個の合成ノード（ピル）に
// まとめた「表示用の木」に変換する。合成ノードの id は区間先頭ノードの実IDをそのまま使う
// ため、layout.ts（{id, children}の形しか要求しない）・開閉アニメーション・接続線など
// 既存の木描画の仕組みは無改造で動く。
//
// 展開表示中（expandedGroupIds に区間先頭IDが入っている）の区間はそのまま素通しする。
// この場合は実ノードがそのまま描画されるため、選択・編集・D&D・コピー選択などの
// 既存機能はここでの変換を意識せずそのまま使える。

import type { MoveNode } from '../../types';

export type GroupPillMeta = {
  groupId: string;
  groupName: string;
  /** 区間内の実ノードID（先頭→末尾の順）。長さ1以上 */
  memberIds: string[];
};

export type GroupView = {
  viewRoot: MoveNode;
  /** ピルとして描画すべきノードID（=区間先頭の実ID）→メタ情報 */
  pillMetaById: Map<string, GroupPillMeta>;
  /** 展開表示中の区間について、先頭ノードID→メタ情報（「折りたたむ」バッジの表示に使う） */
  expandedGroupStartMetaById: Map<string, GroupPillMeta>;
};

/** node から続く同じgroupIdの連結された部分木全体を辿り、区間のメンバーID一覧と、
 * 区間の外に出た子ノード（分岐していれば複数になり得る）を返す */
export function collectGroupChain(
  node: MoveNode,
  groupId: string,
): { memberIds: string[]; boundaryChildren: MoveNode[] } {
  const memberIds: string[] = [];
  const boundaryChildren: MoveNode[] = [];

  const visit = (current: MoveNode) => {
    memberIds.push(current.id);
    current.children.forEach((child) => {
      if (child.groupId === groupId) {
        visit(child);
      } else {
        boundaryChildren.push(child);
      }
    });
  };

  visit(node);
  return { memberIds, boundaryChildren };
}

export function buildGroupView(
  root: MoveNode,
  groupNameById: Map<string, string>,
  expandedGroupIds: Set<string>,
): GroupView {
  const pillMetaById = new Map<string, GroupPillMeta>();
  const expandedGroupStartMetaById = new Map<string, GroupPillMeta>();

  const transform = (node: MoveNode, parentGroupId: string | undefined): MoveNode => {
    const startsNewGroup = Boolean(node.groupId) && node.groupId !== parentGroupId;

    if (startsNewGroup) {
      const groupId = node.groupId as string;
      const { memberIds, boundaryChildren } = collectGroupChain(node, groupId);
      const meta: GroupPillMeta = {
        groupId,
        groupName: groupNameById.get(groupId) ?? '(不明なグループ)',
        memberIds,
      };

      if (!expandedGroupIds.has(node.id)) {
        pillMetaById.set(node.id, meta);

        return {
          ...node,
          children: boundaryChildren.map((child) => transform(child, undefined)),
        };
      }

      expandedGroupStartMetaById.set(node.id, meta);
    }

    return {
      ...node,
      children: node.children.map((child) => transform(child, node.groupId)),
    };
  };

  return { viewRoot: transform(root, undefined), pillMetaById, expandedGroupStartMetaById };
}
