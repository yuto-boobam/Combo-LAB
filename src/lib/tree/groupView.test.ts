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

  it('区間の途中に分岐があると、そこでグループが途切れる', () => {
    // b -(g1)-> c -(g1)-> [d1, d2]  ※cが2子に分岐
    const d1 = makeNode('d1', { groupId: 'g1' });
    const d2 = makeNode('d2');
    const c = makeNode('c', { groupId: 'g1', children: [d1, d2] });
    const b = makeNode('b', { groupId: 'g1', children: [c] });
    const root = makeNode('root', { children: [b] });

    const { pillMetaById } = buildGroupView(root, new Map([['g1', 'コンボA']]), new Set());

    const meta = pillMetaById.get('b');
    // cで分岐するため、区間はb,cまで（d1はcの唯一の子ではないので含まれない）
    expect(meta?.memberIds).toEqual(['b', 'c']);
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
});
