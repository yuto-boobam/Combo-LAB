import { describe, expect, it } from 'vitest';
import { findGroupOccurrences } from './groupOccurrences';
import { findNodeInComboTrees } from '../../utils/comboTreeSearch';
import type { MoveNode } from '../../types';

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

describe('findGroupOccurrences', () => {
  it('groupIdの無い木では出現なしを返す', () => {
    const root = makeNode('root', { children: [makeNode('a')] });

    const occurrences = findGroupOccurrences([{ id: 't1', label: '木1', root }], new Map());

    expect(occurrences).toEqual([]);
  });

  it('1木の中の1区間を1件の出現として返す（末尾の子は含めない）', () => {
    // root -> b(g1) -> c(g1) -> d(通常、区間の外)
    const d = makeNode('d');
    const c = makeNode('c', { groupId: 'g1', children: [d] });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const occurrences = findGroupOccurrences(
      [{ id: 't1', label: '木1', root }],
      new Map([['g1', 'コンボA']]),
    );

    expect(occurrences).toHaveLength(1);
    const occurrence = occurrences[0];
    expect(occurrence.groupName).toBe('コンボA');
    expect(occurrence.treeId).toBe('t1');
    expect(occurrence.treeLabel).toBe('木1');
    expect(occurrence.memberIds).toEqual(['b', 'c']);

    // 表示用の木はb→cの1本道で、cのchildren(d)は含まない
    expect(occurrence.root.id).toBe('b');
    expect(occurrence.root.children).toHaveLength(1);
    expect(occurrence.root.children[0].id).toBe('c');
    expect(occurrence.root.children[0].children).toEqual([]);
  });

  it('異なる木にまたがる同じgroupIdは、それぞれ独立した出現として返す', () => {
    const rootA = makeNode('rootA', {
      children: [makeNode('bA', { groupId: 'g1', children: [makeNode('cA', { groupId: 'g1' })] })],
    });
    const rootB = makeNode('rootB', {
      children: [makeNode('bB', { groupId: 'g1', children: [makeNode('cB', { groupId: 'g1' })] })],
    });

    const occurrences = findGroupOccurrences(
      [
        { id: 'tA', label: '木A', root: rootA },
        { id: 'tB', label: '木B', root: rootB },
      ],
      new Map([['g1', 'コンボA']]),
    );

    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((o) => o.treeLabel).sort()).toEqual(['木A', '木B']);
    expect(occurrences.every((o) => o.memberIds.length === 2)).toBe(true);
  });

  it('区間の途中に分岐があるとそこで区切られ、区間より先はさらに走査を続けて別の出現を拾う', () => {
    // b(g1) -> c(g1) -> [d1(g2), d2(通常)]
    const d1 = makeNode('d1', { groupId: 'g2', children: [makeNode('e1', { groupId: 'g2' })] });
    const d2 = makeNode('d2');
    const c = makeNode('c', { groupId: 'g1', children: [d1, d2] });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const occurrences = findGroupOccurrences(
      [{ id: 't1', label: '木1', root }],
      new Map([
        ['g1', 'コンボA'],
        ['g2', 'コンボB'],
      ]),
    );

    expect(occurrences).toHaveLength(2);
    const groupA = occurrences.find((o) => o.groupId === 'g1');
    const groupB = occurrences.find((o) => o.groupId === 'g2');
    expect(groupA?.memberIds).toEqual(['b', 'c']);
    expect(groupB?.memberIds).toEqual(['d1', 'e1']);
  });

  it('隣接する別グループへ即座に繋がる場合、それぞれ独立した出現になる', () => {
    const d = makeNode('d', { groupId: 'g2' });
    const c = makeNode('c', { groupId: 'g2', children: [d] });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const occurrences = findGroupOccurrences(
      [{ id: 't1', label: '木1', root }],
      new Map([
        ['g1', 'コンボA'],
        ['g2', 'コンボB'],
      ]),
    );

    expect(occurrences).toHaveLength(2);
    expect(occurrences.find((o) => o.groupId === 'g1')?.memberIds).toEqual(['b']);
    expect(occurrences.find((o) => o.groupId === 'g2')?.memberIds).toEqual(['c', 'd']);
  });

  it('分岐する区間(両方の子が同じgroupId)は、occurrence.rootに分岐構造ごと複製される', () => {
    // b(g1) -> c(g1) -> [d1(g1), d2(g1)]  ※cが2子とも同じgroupIdへ分岐
    const d1 = makeNode('d1', { groupId: 'g1' });
    const d2 = makeNode('d2', { groupId: 'g1' });
    const c = makeNode('c', { groupId: 'g1', children: [d1, d2] });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const occurrences = findGroupOccurrences(
      [{ id: 't1', label: '木1', root }],
      new Map([['g1', 'コンボA']]),
    );

    expect(occurrences).toHaveLength(1);
    const occurrence = occurrences[0];
    expect(occurrence.memberIds.sort()).toEqual(['b', 'c', 'd1', 'd2']);

    // 表示用の木もb→c→[d1,d2]の分岐構造をそのまま保つ
    expect(occurrence.root.id).toBe('b');
    expect(occurrence.root.children[0].id).toBe('c');
    expect(occurrence.root.children[0].children.map((n) => n.id).sort()).toEqual(['d1', 'd2']);
    expect(occurrence.root.children[0].children[0].children).toEqual([]);
  });

  it('グループの最後のノードは、区間表示用のクローンではなく実データの葉ノードとしてIDで引ける（グループタブでもコンボの情報欄・お気に入り登録が機能するための前提）', () => {
    // root -> b(g1) -> c(g1、実データ上は葉ノード)
    const c = makeNode('c', { groupId: 'g1' });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });
    const trees = [{ id: 't1', label: '木1', root }];

    const occurrences = findGroupOccurrences(trees, new Map([['g1', 'コンボA']]));
    const lastMemberId = occurrences[0].memberIds.at(-1);

    // 区間表示用のroot（occurrence.root）はクローンだが、IDは実ノードと同じ
    expect(lastMemberId).toBe('c');

    // このIDで実データ（trees）を検索すると、クローンではなく実ノードそのものが見つかる
    const found = findNodeInComboTrees(trees, lastMemberId ?? null);
    expect(found?.node).toBe(c);
    expect(found?.node.children).toEqual([]); // 実データ上も葉ノード＝「コンボの情報」欄の表示対象
  });

  it('グループ名の昇順(日本語)にソートして返す', () => {
    const rootA = makeNode('rootA', { children: [makeNode('a', { groupId: 'gZ' })] });
    const rootB = makeNode('rootB', { children: [makeNode('b', { groupId: 'gA' })] });

    const occurrences = findGroupOccurrences(
      [
        { id: 't1', label: '木1', root: rootA },
        { id: 't2', label: '木2', root: rootB },
      ],
      new Map([
        ['gZ', 'わ行のグループ'],
        ['gA', 'あ行のグループ'],
      ]),
    );

    expect(occurrences.map((o) => o.groupName)).toEqual(['あ行のグループ', 'わ行のグループ']);
  });
});
