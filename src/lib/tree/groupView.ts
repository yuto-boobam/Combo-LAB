// src/lib/tree/groupView.ts
// 「共通区間を名前付きグループとして折りたたむ」機能の表示変換。
//
// MoveNode.groupId が分岐なし(children.length === 1)で連続する区間を、実データには
// 一切手を加えず、描画直前だけ1個の合成ノード（ピル）にまとめた「表示用の木」に変換する。
// 合成ノードの id は区間先頭ノードの実IDをそのまま使うため、layout.ts（{id, children}の
// 形しか要求しない）・開閉アニメーション・接続線など既存の木描画の仕組みは無改造で動く。
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

/** node から続く同じgroupIdの一本道を辿り、区間のメンバーID一覧と末尾ノードを返す */
function collectGroupChain(node: MoveNode, groupId: string): { memberIds: string[]; tail: MoveNode } {
  const memberIds: string[] = [];
  let cursor = node;

  while (cursor.groupId === groupId) {
    memberIds.push(cursor.id);
    if (cursor.children.length !== 1) break;
    const next = cursor.children[0];
    if (next.groupId !== groupId) break;
    cursor = next;
  }

  return { memberIds, tail: cursor };
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
      const { memberIds, tail } = collectGroupChain(node, groupId);
      const meta: GroupPillMeta = {
        groupId,
        groupName: groupNameById.get(groupId) ?? '(不明なグループ)',
        memberIds,
      };

      if (!expandedGroupIds.has(node.id)) {
        pillMetaById.set(node.id, meta);

        return {
          ...node,
          children: tail.children.map((child) => transform(child, undefined)),
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
