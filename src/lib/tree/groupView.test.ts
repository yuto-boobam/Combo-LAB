import { describe, expect, it } from 'vitest';
import { buildGroupView } from './groupView';
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

describe('buildGroupView', () => {
  it('groupIdの無い木はそのまま素通しする（ピルなし）', () => {
    const root = makeNode('root', { children: [makeNode('a')] });

    const { viewRoot, pillMetaById } = buildGroupView(root, new Map(), new Set());

    expect(viewRoot).toEqual(root);
    expect(pillMetaById.size).toBe(0);
  });

  it('分岐のない連続groupId区間を1個のピルにまとめる', () => {
    // root -(g1)-> b -(g1)-> c -(g1)-> d -> e(通常)
    const e = makeNode('e');
    const d = makeNode('d', { groupId: 'g1', children: [e] });
    const c = makeNode('c', { groupId: 'g1', children: [d] });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const { viewRoot, pillMetaById } = buildGroupView(
      root,
      new Map([['g1', 'コンボA']]),
      new Set(),
    );

    // root -> b(ピル、id='b') -> e
    expect(viewRoot.children).toHaveLength(1);
    const pill = viewRoot.children[0];
    expect(pill.id).toBe('b');
    expect(pill.children.map((c) => c.id)).toEqual(['e']);

    expect(pillMetaById.size).toBe(1);
    const meta = pillMetaById.get('b');
    expect(meta?.groupName).toBe('コンボA');
    expect(meta?.memberIds).toEqual(['b', 'c', 'd']);
  });

  it('分岐先の一方だけ同じgroupIdなら、そちらは吸収してもう一方だけ区間の外になる', () => {
    // b -(g1)-> c -(g1)-> [d1(g1), d2(通常)]  ※cが2子に分岐
    const d1 = makeNode('d1', { groupId: 'g1' });
    const d2 = makeNode('d2');
    const c = makeNode('c', { groupId: 'g1', children: [d1, d2] });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const { viewRoot, pillMetaById } = buildGroupView(root, new Map([['g1', 'コンボA']]), new Set());

    const meta = pillMetaById.get('b');
    // d1は同じgroupIdなので区間に吸収され、d2だけがピルの子(区間の外)になる
    expect(meta?.memberIds).toEqual(['b', 'c', 'd1']);
    const pill = viewRoot.children[0];
    expect(pill.children.map((c) => c.id)).toEqual(['d2']);
  });

  it('分岐する部分木の全ノードが同じgroupIdなら、分岐ごと1個のピルにまとまる', () => {
    // b -(g1)-> c -(g1)-> [d1(g1), d2(g1)]  ※cが2子とも同じgroupIdへ分岐
    const d1 = makeNode('d1', { groupId: 'g1' });
    const d2 = makeNode('d2', { groupId: 'g1' });
    const c = makeNode('c', { groupId: 'g1', children: [d1, d2] });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const { viewRoot, pillMetaById } = buildGroupView(root, new Map([['g1', 'コンボA']]), new Set());

    // 分岐があっても1個のピルにまとまり、区間の外に出た子は無い(終端)
    expect(viewRoot.children).toHaveLength(1);
    const pill = viewRoot.children[0];
    expect(pill.id).toBe('b');
    expect(pill.children).toEqual([]);

    const meta = pillMetaById.get('b');
    expect(meta?.memberIds.sort()).toEqual(['b', 'c', 'd1', 'd2']);
  });

  it('expandedGroupIdsに区間先頭IDが入っていれば折りたたまず実ノードのまま描画する', () => {
    const c = makeNode('c', { groupId: 'g1' });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const { viewRoot, pillMetaById, expandedGroupStartMetaById } = buildGroupView(
      root,
      new Map([['g1', 'コンボA']]),
      new Set(['b']),
    );

    expect(pillMetaById.size).toBe(0);
    expect(viewRoot.children[0].id).toBe('b');
    expect(viewRoot.children[0].children[0].id).toBe('c');

    expect(expandedGroupStartMetaById.get('b')?.memberIds).toEqual(['b', 'c']);
  });

  it('隣接する別グループへ即座に繋がる場合、それぞれ独立したピルになる', () => {
    // b(g1) -> c(g2) -> d(g2)
    const d = makeNode('d', { groupId: 'g2' });
    const c = makeNode('c', { groupId: 'g2', children: [d] });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const { viewRoot, pillMetaById } = buildGroupView(
      root,
      new Map([
        ['g1', 'コンボA'],
        ['g2', 'コンボB'],
      ]),
      new Set(),
    );

    expect(pillMetaById.get('b')?.memberIds).toEqual(['b']);
    expect(pillMetaById.get('c')?.memberIds).toEqual(['c', 'd']);
    expect(viewRoot.children[0].id).toBe('b');
    expect(viewRoot.children[0].children[0].id).toBe('c');
  });

  it('同じgroupIdが2つの兄弟枝にまたがる場合、それぞれ独立したピルになる', () => {
    // branch -> [eA(g1) -> eB(g1), fA(g1) -> fB(g1)]
    const eB = makeNode('eB', { groupId: 'g1' });
    const eA = makeNode('eA', { groupId: 'g1', children: [eB] });
    const fB = makeNode('fB', { groupId: 'g1' });
    const fA = makeNode('fA', { groupId: 'g1', children: [fB] });
    const branch = makeNode('branch', { children: [eA, fA] });
    const root = makeNode('root', { children: [branch] });

    const { viewRoot, pillMetaById } = buildGroupView(root, new Map([['g1', 'コンボA']]), new Set());

    // branchは分岐点なのでピルにならず、そのまま2つの子(eA, fA)を持つ
    const branchView = viewRoot.children[0];
    expect(branchView.id).toBe('branch');
    expect(branchView.children.map((c) => c.id)).toEqual(['eA', 'fA']);

    expect(pillMetaById.size).toBe(2);
    expect(pillMetaById.get('eA')?.memberIds).toEqual(['eA', 'eB']);
    expect(pillMetaById.get('fA')?.memberIds).toEqual(['fA', 'fB']);
    expect(pillMetaById.get('eA')?.groupName).toBe('コンボA');
    expect(pillMetaById.get('fA')?.groupName).toBe('コンボA');
  });
});
