// src/utils/chainMatch.ts
// 「一致箇所への一括反映」機能のための、一本道（分岐なし）の完全一致検索。
//
// パターンは常に「起点から分岐のない一本道」に限定する（src/store.ts の
// matchModeAnchorId/matchSelectedIds の選択もこの前提で作られている）。これにより、
// 一致判定は「同じ長さの一本道上で技名・呼び名が全位置で完全一致するか」という
// シンプルな比較になり、反映時に「境界より先の各箇所固有の続き」を壊す心配がない。
//
// 内容一致に加えて、「同じ名前付きグループの一本道」も一致とみなす（2026-08-28ユーザー要望）。
// グループはコピー＆ペーストで複製されるため、貼り付けた後にどちらかの内容を編集すると
// 技名等が食い違ってしまい、内容一致だけでは他の出現箇所を見つけられなくなる。
// パターン側が丸ごと同じgroupIdの一本道であれば、内容が食い違っていてもgroupId一致で
// 拾えるようにすることで、グループの内容も一括反映で揃えられるようにする。

import type { ComboTree, MoveNode } from '../types';

/** node起点からlength個のノードを一本道（子1つ）で辿る。分岐や末端で足りなければnull */
export function collectChain(node: MoveNode, length: number): MoveNode[] | null {
  const chain: MoveNode[] = [node];
  let cursor = node;

  for (let i = 1; i < length; i += 1) {
    if (cursor.children.length !== 1) return null;
    cursor = cursor.children[0];
    chain.push(cursor);
  }

  return chain;
}

function chainContentEquals(a: MoveNode[], b: MoveNode[], includeAttributes: boolean): boolean {
  return (
    a.length === b.length &&
    a.every(
      (node, i) =>
        node.moveName === b[i].moveName &&
        (node.displayName ?? null) === (b[i].displayName ?? null) &&
        (!includeAttributes || JSON.stringify(node.attributes) === JSON.stringify(b[i].attributes)),
    )
  );
}

/** chainの全ノードが同じ非nullのgroupIdを持っていれば、そのgroupIdを返す。それ以外はnull */
function uniformGroupId(chain: MoveNode[]): string | null {
  const groupId = chain[0]?.groupId ?? null;
  if (!groupId) return null;
  return chain.every((node) => node.groupId === groupId) ? groupId : null;
}

/**
 * 木の集合から、patternChainと同じ長さ・同じ技名/呼び名の並びを持つ一本道、または
 * patternChainと同じ名前付きグループに属する一本道をすべて探し、各一致箇所の起点ノードID
 * を返す（patternChain自身の起点も、木の中に実在すれば含まれる）。
 *
 * includeAttributes: trueにすると属性（カウンター/ガード/空振り等）も完全一致を条件に加える。
 * 同じ技名の並びでも当たり方が違えば実際には繋がらないコンボがあるため、
 * より厳密に絞り込みたい場合のオプトイン（デフォルトは技名・呼び名のみで判定する）。
 * グループ一致にはこのオプションは影響しない（groupIdが同じなら常に一致とみなす）。
 */
export function findMatchingChains(
  trees: ComboTree[],
  patternChain: MoveNode[],
  options?: { includeAttributes?: boolean },
): string[] {
  const includeAttributes = options?.includeAttributes ?? false;
  const patternGroupId = uniformGroupId(patternChain);
  const results: string[] = [];

  const visit = (node: MoveNode) => {
    const candidateChain = collectChain(node, patternChain.length);
    if (candidateChain) {
      const contentMatches = chainContentEquals(candidateChain, patternChain, includeAttributes);
      const groupMatches = patternGroupId !== null && uniformGroupId(candidateChain) === patternGroupId;
      if (contentMatches || groupMatches) results.push(node.id);
    }
    node.children.forEach(visit);
  };

  trees.forEach((tree) => visit(tree.root));
  return results;
}
