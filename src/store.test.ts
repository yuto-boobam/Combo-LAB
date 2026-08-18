import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from './store';
import type { Character, MoveNode } from './types';
import { createInitialCharacterRoster } from './data/characterRoster';
import { buildGroupView } from './lib/tree';

function getCharacter(id: string): Character {
  const character = useAppStore.getState().characters.find((c) => c.id === id);
  if (!character) throw new Error(`character not found: ${id}`);
  return character;
}

function findNodeByMoveNameOrNull(root: MoveNode, moveName: string): MoveNode | null {
  if (root.moveName === moveName) return root;
  for (const child of root.children) {
    const found = findNodeByMoveNameOrNull(child, moveName);
    if (found) return found;
  }
  return null;
}

function findNodeByMoveName(root: MoveNode, moveName: string): MoveNode {
  const found = findNodeByMoveNameOrNull(root, moveName);
  if (!found) throw new Error(`node not found: ${moveName}`);
  return found;
}

describe('restoreCharacters', () => {
  beforeEach(() => {
    useAppStore.setState({ characters: createInitialCharacterRoster() });
  });

  it('idが一致するキャラのみ上書きし、名前が保持される', () => {
    const target = useAppStore.getState().characters[0];

    useAppStore.getState().restoreCharacters([
      {
        id: target.id,
        name: target.name,
        imageUrl: 'https://example.com/a.png',
        moveList: [{ id: 'm1', name: '波動拳', category: 'special' }],
        comboTrees: [
          {
            id: 't1',
            label: '小P始動',
            root: {
              id: 'root1',
              moveName: '小P',
              attributes: [],
              specialNote: '',
              branchStats: null,
              createdBy: '',
              createdAt: '2026-01-01T00:00:00.000Z',
              children: [],
            },
          },
        ],
        createdBy: 'someone',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const updated = getCharacter(target.id);
    expect(updated.imageUrl).toBe('https://example.com/a.png');
    expect(updated.moveList).toHaveLength(1);
    expect(updated.comboTrees).toHaveLength(1);
    expect(updated.comboTrees[0].root.moveName).toBe('小P');
  });

  it('一致しないidのキャラは変更されない', () => {
    const before = useAppStore.getState().characters;
    const untouchedId = before[1].id;
    const before1 = getCharacter(untouchedId);

    useAppStore.getState().restoreCharacters([
      {
        id: 'not-a-real-character-id',
        name: 'ゴースト',
        comboTrees: [],
        moveList: [],
      },
    ]);

    const after1 = getCharacter(untouchedId);
    expect(after1).toEqual(before1);
  });

  it('壊れた/欠けたフィールドがあっても落ちずに正規化される', () => {
    const target = useAppStore.getState().characters[2];

    useAppStore.getState().restoreCharacters([
      {
        id: target.id,
        // name欠如 -> fallbackのnameを維持
        moveList: [
          { id: 'x', name: '', category: 'special' }, // 名前が空 -> 除外される
          { id: 'y', name: '龍巻旋風脚', category: 'not-a-real-category' as never },
        ],
        comboTrees: [
          { id: 'bad-tree' } as never, // rootが無い -> 除外される
        ],
      },
    ]);

    const updated = getCharacter(target.id);
    expect(updated.name).toBe(target.name);
    expect(updated.moveList).toHaveLength(1);
    expect(updated.moveList[0].name).toBe('龍巻旋風脚');
    expect(updated.moveList[0].category).toBe('unique'); // 不正なカテゴリはuniqueにフォールバック
    expect(updated.comboTrees).toHaveLength(0);
  });
});

describe('共通区間を名前付きグループとして折りたたむ機能', () => {
  beforeEach(() => {
    useAppStore.setState({
      characters: createInitialCharacterRoster(),
      groupModeAnchorId: null,
      groupSelectedIds: [],
      expandedGroupIds: [],
      selectedNodeId: null,
    });
  });

  function buildChainTree(characterId: string) {
    const store = useAppStore.getState();
    const treeId = store.createComboTree(characterId, '小P始動');
    const rootId = getCharacter(characterId).comboTrees.find((t) => t.id === treeId)!.root.id;

    const aId = store.addChildNode(characterId, treeId, rootId, 'a');
    const bId = store.addChildNode(characterId, treeId, aId, 'b');
    const cId = store.addChildNode(characterId, treeId, bId, 'c');
    const dId = store.addChildNode(characterId, treeId, cId, 'd');

    return { treeId, rootId, aId, bId, cId, dId };
  }

  it('起点から続く区間に名前を付けると、対象ノードすべてに同じgroupIdが付き、カタログに追加される', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { aId, bId, cId } = buildChainTree(characterId);

    useAppStore.getState().startGroupMode(aId);
    useAppStore.getState().setGroupSelectedIds([bId, cId]);
    useAppStore.getState().confirmGroupSelection(characterId, 'コンボA');

    const character = getCharacter(characterId);
    const tree = character.comboTrees[0];
    const a = findNodeByMoveName(tree.root, 'a');
    const b = findNodeByMoveName(tree.root, 'b');
    const c = findNodeByMoveName(tree.root, 'c');
    const d = findNodeByMoveName(tree.root, 'd');

    expect(a.id).toBe(aId);
    expect(a.groupId).toBeDefined();
    expect(a.groupId).toBe(b.groupId);
    expect(a.groupId).toBe(c.groupId);
    expect(d.groupId).toBeUndefined(); // 選択範囲外は影響を受けない

    expect(character.namedComboGroups).toHaveLength(1);
    expect(character.namedComboGroups[0].name).toBe('コンボA');

    // グループ化モードは確定後に終了する
    expect(useAppStore.getState().groupModeAnchorId).toBeNull();
    expect(useAppStore.getState().groupSelectedIds).toEqual([]);
  });

  it('別の木で同名グループを付けると、同じgroupId（同じカタログ項目）が再利用される', () => {
    const characterId = useAppStore.getState().characters[0].id;

    const first = buildChainTree(characterId);
    useAppStore.getState().startGroupMode(first.aId);
    useAppStore.getState().setGroupSelectedIds([first.bId, first.cId]);
    useAppStore.getState().confirmGroupSelection(characterId, 'コンボA');

    const second = buildChainTree(characterId);
    useAppStore.getState().startGroupMode(second.aId);
    useAppStore.getState().setGroupSelectedIds([second.bId, second.cId]);
    useAppStore.getState().confirmGroupSelection(characterId, 'コンボA');

    const character = getCharacter(characterId);
    expect(character.namedComboGroups).toHaveLength(1); // カタログは増えない

    const firstA = findNodeByMoveName(character.comboTrees[0].root, 'a');
    const secondA = findNodeByMoveName(character.comboTrees[1].root, 'a');
    expect(firstA.groupId).toBe(secondA.groupId);
  });

  it('buildGroupViewで表示すると、対象区間が1個のピルにまとまり、末尾ノードの先の子はそのまま繋がる', () => {
    const characterId = useAppStore.getState().characters[0].id;

    const { treeId, aId, bId, cId, dId } = buildChainTree(characterId);
    useAppStore.getState().startGroupMode(aId);
    useAppStore.getState().setGroupSelectedIds([bId, cId]);
    useAppStore.getState().confirmGroupSelection(characterId, 'コンボA');

    const character = getCharacter(characterId);
    const tree = character.comboTrees.find((t) => t.id === treeId)!;
    const groupNameById = new Map(character.namedComboGroups.map((g) => [g.id, g.name]));

    const { viewRoot, pillMetaById } = buildGroupView(tree.root, groupNameById, new Set());

    // root -> pill(a) -> d
    const pillNode = viewRoot.children[0];
    expect(pillNode.id).toBe(aId);
    expect(pillNode.children.map((c) => c.id)).toEqual([dId]);

    const meta = pillMetaById.get(aId);
    expect(meta?.groupName).toBe('コンボA');
    expect(meta?.memberIds).toEqual([aId, bId, cId]);
  });

  it('ungroupNodeで区間全体のgroupIdが解除される（カタログ自体は残る）', () => {
    const characterId = useAppStore.getState().characters[0].id;

    const { treeId, aId, bId, cId } = buildChainTree(characterId);
    useAppStore.getState().startGroupMode(aId);
    useAppStore.getState().setGroupSelectedIds([bId, cId]);
    useAppStore.getState().confirmGroupSelection(characterId, 'コンボA');

    // 区間の途中(b)から解除しても、区間全体(a,b,c)が解除される
    useAppStore.getState().ungroupNode(characterId, treeId, bId);

    const character = getCharacter(characterId);
    const tree = character.comboTrees.find((t) => t.id === treeId)!;
    expect(findNodeByMoveName(tree.root, 'a').groupId).toBeUndefined();
    expect(findNodeByMoveName(tree.root, 'b').groupId).toBeUndefined();
    expect(findNodeByMoveName(tree.root, 'c').groupId).toBeUndefined();
    expect(character.namedComboGroups).toHaveLength(1); // カタログ自体は残る
  });
});
