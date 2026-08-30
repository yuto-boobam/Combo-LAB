import { describe, expect, it } from 'vitest';
import { collectChain, findMatchingChains } from './chainMatch';
import type { ComboTree, MoveNode } from '../types';

function makeNode(id: string, overrides: Partial<MoveNode> = {}): MoveNode {
  return {
    id,
    moveName: id,
    attributes: [],
    specialNote: '',
    branchStats: null,
    createdBy: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    children: [],
    ...overrides,
  };
}

function makeTree(id: string, root: MoveNode): ComboTree {
  return { id, label: id, root };
}

describe('collectChain', () => {
  it('分岐のない一本道をlength分だけ辿る', () => {
    const c = makeNode('c');
    const b = makeNode('b', { children: [c] });
    const a = makeNode('a', { children: [b] });

    expect(collectChain(a, 3)?.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(collectChain(a, 2)?.map((n) => n.id)).toEqual(['a', 'b']);
    expect(collectChain(a, 1)?.map((n) => n.id)).toEqual(['a']);
  });

  it('途中で分岐していると、そこで足りなければnullを返す', () => {
    const d1 = makeNode('d1');
    const d2 = makeNode('d2');
    const c = makeNode('c', { children: [d1, d2] });
    const a = makeNode('a', { children: [c] });

    expect(collectChain(a, 2)?.map((n) => n.id)).toEqual(['a', 'c']); // cまでは辿れる
    expect(collectChain(a, 3)).toBeNull(); // cの先は分岐しているので3個目は取れない
  });

  it('末端で足りなければnullを返す', () => {
    const a = makeNode('a');
    expect(collectChain(a, 2)).toBeNull();
  });
});

describe('findMatchingChains', () => {
  it('技名・呼び名が完全一致する一本道をすべて見つける', () => {
    const patternB = makeNode('pb', { moveName: 'b' });
    const patternA = makeNode('pa', { moveName: 'a', children: [patternB] });

    const b1 = makeNode('b1', { moveName: 'b' });
    const a1 = makeNode('a1', { moveName: 'a', children: [b1] });
    const b2 = makeNode('b2', { moveName: 'b' });
    const a2 = makeNode('a2', { moveName: 'a', children: [b2] });
    const root1 = makeNode('root1', { children: [a1] });
    const root2 = makeNode('root2', { children: [a2] });

    const trees = [makeTree('t1', root1), makeTree('t2', root2)];
    const matches = findMatchingChains(trees, [patternA, patternB]);

    expect(matches.sort()).toEqual(['a1', 'a2']);
  });

  it('技名が違う箇所は一致しない', () => {
    const patternB = makeNode('pb', { moveName: 'b' });
    const patternA = makeNode('pa', { moveName: 'a', children: [patternB] });

    const bDiff = makeNode('bDiff', { moveName: '違う技' });
    const aDiff = makeNode('aDiff', { moveName: 'a', children: [bDiff] });
    const root = makeNode('root', { children: [aDiff] });

    const matches = findMatchingChains([makeTree('t', root)], [patternA, patternB]);
    expect(matches).toEqual([]);
  });

  it('呼び名(displayName)が違う箇所は一致しない', () => {
    const patternA = makeNode('pa', { moveName: 'a', displayName: '弱' });

    const aOtherLabel = makeNode('aOther', { moveName: 'a', displayName: '強' });
    const root = makeNode('root', { children: [aOtherLabel] });

    const matches = findMatchingChains([makeTree('t', root)], [patternA]);
    expect(matches).toEqual([]);
  });

  it('分岐している箇所はパターンより短い扱いになり一致しない', () => {
    const patternB = makeNode('pb', { moveName: 'b' });
    const patternA = makeNode('pa', { moveName: 'a', children: [patternB] });

    const b1 = makeNode('b1', { moveName: 'b' });
    const b2 = makeNode('b2', { moveName: 'b' });
    const aBranching = makeNode('aBranching', { moveName: 'a', children: [b1, b2] });
    const root = makeNode('root', { children: [aBranching] });

    const matches = findMatchingChains([makeTree('t', root)], [patternA, patternB]);
    expect(matches).toEqual([]);
  });

  it('パターン自身の起点も、木の中に実在すれば結果に含まれる', () => {
    const patternA = makeNode('a1', { moveName: 'a' });
    const root = makeNode('root', { children: [patternA] });

    const matches = findMatchingChains([makeTree('t', root)], [patternA]);
    expect(matches).toEqual(['a1']);
  });

  it('技名は一致するが属性が異なる場合、includeAttributesの指定で結果が変わる', () => {
    const patternA = makeNode('pa', { moveName: 'a', attributes: [{ type: 'counter' }] });

    const aDifferentAttr = makeNode('aDifferentAttr', { moveName: 'a', attributes: [{ type: 'guard' }] });
    const root = makeNode('root', { children: [aDifferentAttr] });
    const trees = [makeTree('t', root)];

    // 省略時（デフォルト）は技名・呼び名のみで判定するため一致する
    expect(findMatchingChains(trees, [patternA])).toEqual(['aDifferentAttr']);
    expect(findMatchingChains(trees, [patternA], { includeAttributes: false })).toEqual(['aDifferentAttr']);

    // includeAttributes: trueにすると属性も完全一致が必要になるため一致しない
    expect(findMatchingChains(trees, [patternA], { includeAttributes: true })).toEqual([]);
  });

  it('includeAttributes: trueでも属性まで完全一致すれば見つかる', () => {
    const patternA = makeNode('pa', { moveName: 'a', attributes: [{ type: 'counter' }] });

    const aSameAttr = makeNode('aSameAttr', { moveName: 'a', attributes: [{ type: 'counter' }] });
    const root = makeNode('root', { children: [aSameAttr] });

    const matches = findMatchingChains([makeTree('t', root)], [patternA], { includeAttributes: true });
    expect(matches).toEqual(['aSameAttr']);
  });

  it('内容が食い違っていても、同じ名前付きグループの一本道は一致とみなす', () => {
    // パターン側（コピー元）: グループgの2ノード
    const patternB = makeNode('pb', { moveName: 'b', groupId: 'g' });
    const patternA = makeNode('pa', { moveName: 'a', groupId: 'g', children: [patternB] });

    // 別の出現箇所（コピー先）: 同じグループgだが、技名が編集されて食い違っている
    const bCopyEdited = makeNode('bCopy', { moveName: '編集後の技', groupId: 'g' });
    const aCopy = makeNode('aCopy', { moveName: 'a', groupId: 'g', children: [bCopyEdited] });
    const root = makeNode('root', { children: [aCopy] });

    const matches = findMatchingChains([makeTree('t', root)], [patternA, patternB]);
    expect(matches).toEqual(['aCopy']);
  });

  it('グループIDが違えば、内容が同じでも一致しない（groupIdが無い側の通常の内容一致とは独立）', () => {
    const patternB = makeNode('pb', { moveName: 'b', groupId: 'g1' });
    const patternA = makeNode('pa', { moveName: 'a', groupId: 'g1', children: [patternB] });

    const bOtherGroup = makeNode('bOther', { moveName: '編集後', groupId: 'g2' });
    const aOtherGroup = makeNode('aOther', { moveName: 'a', groupId: 'g2', children: [bOtherGroup] });
    const root = makeNode('root', { children: [aOtherGroup] });

    const matches = findMatchingChains([makeTree('t', root)], [patternA, patternB]);
    expect(matches).toEqual([]);
  });

  it('パターン側にグループが無ければ、従来通り内容一致だけで判定する', () => {
    const patternA = makeNode('pa', { moveName: 'a' });

    const aGrouped = makeNode('aGrouped', { moveName: '違う技', groupId: 'g' });
    const root = makeNode('root', { children: [aGrouped] });

    const matches = findMatchingChains([makeTree('t', root)], [patternA]);
    expect(matches).toEqual([]);
  });
});
