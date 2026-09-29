// src/utils/nodeDragController.test.ts
// resolveDrop（startNodeDragの内部で使う、実際の付け替え/並び替え判定ロジック）を、
// DOMイベントを介さず直接テストする。ヒットテスト（document.elementFromPoint）自体は
// ブラウザ専用でテスト環境では検証できないため、対象外とする
//
// ドロップ先のどこにカーソルがあるかで3種類の操作に分かれる（2026-09-30ユーザー要望）。
// - 'child'  : ドロップ先の子として追加
// - 'before' : ドロップ先と同じ親の兄弟として、ドロップ先の直前に挿入
// - 'after'  : ドロップ先と同じ親の兄弟として、ドロップ先の直後に挿入
// 'before'/'after'は、ドラッグ元が元々ドロップ先と同じ親でなくても機能する
// （その場合は「その位置に新しい兄弟として差し込む」動作になる）

import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '../store';
import { resolveDrop } from './nodeDragController';
import { createInitialCharacterRoster } from '../data/characterRoster';
import type { MoveNode } from '../types';

function getRoot(characterId: string, treeId: string): MoveNode {
  const character = useAppStore.getState().characters.find((c) => c.id === characterId)!;
  return character.comboTrees.find((tree) => tree.id === treeId)!.root;
}

function childNames(node: MoveNode): string[] {
  return node.children.map((child) => child.moveName);
}

describe('resolveDrop（ノードのドラッグ&ドロップの実処理）', () => {
  beforeEach(() => {
    useAppStore.setState({ characters: createInitialCharacterRoster() });
  });

  // root -> parent -> [A, B, C] という3兄弟の木を作る
  function buildSiblingTree(characterId: string) {
    const store = useAppStore.getState();
    const treeId = store.createComboTree(characterId, 'テスト');
    const rootId = getRoot(characterId, treeId).id;
    const parentId = store.addChildNode(characterId, treeId, rootId, 'parent');
    const a = store.addChildNode(characterId, treeId, parentId, 'A');
    const b = store.addChildNode(characterId, treeId, parentId, 'B');
    const c = store.addChildNode(characterId, treeId, parentId, 'C');
    return { treeId, rootId, parentId, a, b, c };
  }

  it('兄弟ノードの上寄りにドロップすると、ドロップ先の直前に挿入される（下から上へのドラッグも含む）', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { treeId, parentId, a, c } = buildSiblingTree(characterId);

    // Cを、より上にあるAの上寄りにドロップ＝Aの直前へ
    resolveDrop(characterId, { kind: 'node', id: c, parentId }, a, 'before');

    const parent = getRoot(characterId, treeId).children[0];
    expect(childNames(parent)).toEqual(['C', 'A', 'B']);
  });

  it('兄弟ノードの下寄りにドロップすると、ドロップ先の直後に挿入される', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { treeId, parentId, a, c } = buildSiblingTree(characterId);

    // Aを、より下にあるCの下寄りにドロップ＝Cの直後へ
    resolveDrop(characterId, { kind: 'node', id: a, parentId }, c, 'after');

    const parent = getRoot(characterId, treeId).children[0];
    expect(childNames(parent)).toEqual(['B', 'C', 'A']);
  });

  it('ノードの中央にドロップすると、元の親が同じでも違っても常に子として付け替える', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { treeId, parentId, a, c } = buildSiblingTree(characterId);
    const store = useAppStore.getState();
    store.addChildNode(characterId, treeId, c, 'D');

    // Aと同じ親を持つCへ'child'ドロップ → 並び替えではなくCの子になる
    resolveDrop(characterId, { kind: 'node', id: a, parentId }, c, 'child');

    const parent = getRoot(characterId, treeId).children[0];
    expect(childNames(parent)).toEqual(['B', 'C']); // Aは兄弟から抜けた
    const cNode = parent.children[1];
    expect(childNames(cNode)).toEqual(['D', 'A']); // AはCの子になった
  });

  it('別の親配下のノードの上寄り/下寄りにドロップすると、そのノードと同じ親の兄弟としてその位置に差し込まれる', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { treeId, parentId, a, c } = buildSiblingTree(characterId);
    const store = useAppStore.getState();
    // Cの下にD, Eを追加。DとEはA/B/Cとは別の親(C)を持つ兄弟
    const d = store.addChildNode(characterId, treeId, c, 'D');
    store.addChildNode(characterId, treeId, c, 'E');

    // 元々A/B/Cの兄弟だったAを、C配下のDの上寄りにドロップ
    // → Aの親から抜け、Dと同じ親(C)の兄弟としてDの直前に挿入される
    resolveDrop(characterId, { kind: 'node', id: a, parentId }, d, 'before');

    const parent = getRoot(characterId, treeId).children[0];
    expect(childNames(parent)).toEqual(['B', 'C']); // Aは元の兄弟から抜けた
    const cNode = parent.children[1];
    expect(childNames(cNode)).toEqual(['A', 'D', 'E']); // Cの子としてDの直前に挿入された
  });

  it('ルートノードへのドロップは、上寄り/下寄り/中央に関わらず常に子として追加する（ルートに兄弟は無いため）', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { treeId, rootId, a } = buildSiblingTree(characterId);

    resolveDrop(characterId, { kind: 'node', id: a, parentId: null }, rootId, 'before');

    const root = getRoot(characterId, treeId);
    // 元のparentからAが抜け、rootの子としてparentとAが並ぶ
    expect(childNames(root)).toEqual(['parent', 'A']);
  });

  it('自分自身へのドロップは何もしない', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { treeId, parentId, a } = buildSiblingTree(characterId);

    resolveDrop(characterId, { kind: 'node', id: a, parentId }, a, 'before');

    const parent = getRoot(characterId, treeId).children[0];
    expect(childNames(parent)).toEqual(['A', 'B', 'C']);
  });

  it('クリップボードからのドロップは、ドロップ位置によらずそのノードの子として貼り付ける', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { treeId, a } = buildSiblingTree(characterId);

    useAppStore.setState({
      clipboard: [
        {
          id: 'clip-X',
          moveName: 'X',
          attributes: [],
          specialNote: '',
          branchStats: null,
          createdBy: 'テスト',
          createdAt: '2026-01-01T00:00:00.000Z',
          children: [],
        } as unknown as MoveNode,
      ],
    });

    resolveDrop(characterId, { kind: 'clipboard-paste' }, a, 'before');

    const parent = getRoot(characterId, treeId).children[0];
    const aNode = parent.children[0];
    expect(childNames(aNode)).toEqual(['X']);
  });
});
