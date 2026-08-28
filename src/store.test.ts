import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from './store';
import type { Character, MoveNode } from './types';
import { createInitialCharacterRoster } from './data/characterRoster';
import { buildGroupView } from './lib/tree';
import { findNodeInComboTrees } from './utils/comboTreeSearch';

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

  it('技マスタのhasSpecialVariant/specialVariantOptions/finishesComboOnSelect/strengthModeがインポート時に消えない', () => {
    const target = useAppStore.getState().characters[3];

    useAppStore.getState().restoreCharacters([
      {
        id: target.id,
        moveList: [
          {
            id: 'beam',
            name: 'ビーム',
            category: 'special',
            hasSpecialVariant: true,
            specialVariantOptions: ['ビームレベル2', 'ビームレベル3', 'ビームレベル4'],
            finishesComboOnSelect: true,
            strengthMode: 'level',
          },
          { id: 'normal-move', name: '波動拳', category: 'special' }, // 特殊性能なしの技は影響なし
        ],
        comboTrees: [],
      },
    ]);

    const updated = getCharacter(target.id);
    const beam = updated.moveList.find((move) => move.id === 'beam');
    expect(beam?.hasSpecialVariant).toBe(true);
    expect(beam?.specialVariantOptions).toEqual(['ビームレベル2', 'ビームレベル3', 'ビームレベル4']);
    expect(beam?.finishesComboOnSelect).toBe(true);
    expect(beam?.strengthMode).toBe('level');

    const normalMove = updated.moveList.find((move) => move.id === 'normal-move');
    expect(normalMove?.hasSpecialVariant).toBeUndefined();
    expect(normalMove?.specialVariantOptions).toBeUndefined();
    expect(normalMove?.finishesComboOnSelect).toBeUndefined();
    expect(normalMove?.strengthMode).toBeUndefined();
  });

  it('旧hasFlatVariants: trueで保存された技マスタは、インポート時にstrengthMode: "level"へ移行される', () => {
    const target = useAppStore.getState().characters[3];

    useAppStore.getState().restoreCharacters([
      {
        id: target.id,
        moveList: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 旧スキーマの下書きデータを模す
          { id: 'beam', name: 'ビーム', category: 'special', hasFlatVariants: true } as any,
        ],
        comboTrees: [],
      },
    ]);

    const updated = getCharacter(target.id);
    const beam = updated.moveList.find((move) => move.id === 'beam');
    expect(beam?.strengthMode).toBe('level');
  });

  it('ノードのgroupIdとキャラのnamedComboGroupsがインポート時に消えない', () => {
    const target = useAppStore.getState().characters[4];

    useAppStore.getState().restoreCharacters([
      {
        id: target.id,
        moveList: [],
        namedComboGroups: [{ id: 'g1', name: 'コンボA' }],
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
              groupId: 'g1',
              children: [
                {
                  id: 'child1',
                  moveName: '中K',
                  attributes: [],
                  specialNote: '',
                  branchStats: null,
                  createdBy: '',
                  createdAt: '2026-01-01T00:00:00.000Z',
                  groupId: 'g1',
                  children: [],
                },
              ],
            },
          },
        ],
      },
    ]);

    const updated = getCharacter(target.id);
    expect(updated.namedComboGroups).toEqual([{ id: 'g1', name: 'コンボA' }]);

    const tree = updated.comboTrees.find((t) => t.id === 't1')!;
    expect(tree.root.groupId).toBe('g1');
    expect(tree.root.children[0].groupId).toBe('g1');
  });
});

describe('setNodeUsesOD', () => {
  beforeEach(() => {
    useAppStore.setState({ characters: createInitialCharacterRoster() });
  });

  it('指定ノードだけusesODが切り替わり、他のノードには影響しない', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const store = useAppStore.getState();
    const treeId = store.createComboTree(characterId, '小P始動');
    const rootId = getCharacter(characterId).comboTrees.find((t) => t.id === treeId)!.root.id;
    const childId = store.addChildNode(characterId, treeId, rootId, '中P');

    store.setNodeUsesOD(characterId, treeId, childId, true);

    const tree = getCharacter(characterId).comboTrees.find((t) => t.id === treeId)!;
    expect(tree.root.usesOD).toBeUndefined();
    expect(findNodeByMoveName(tree.root, '中P').usesOD).toBe(true);

    store.setNodeUsesOD(characterId, treeId, childId, false);
    const treeAfterUncheck = getCharacter(characterId).comboTrees.find((t) => t.id === treeId)!;
    expect(findNodeByMoveName(treeAfterUncheck.root, '中P').usesOD).toBeUndefined();
  });
});

describe('setNodeRecordsBranchStats', () => {
  beforeEach(() => {
    useAppStore.setState({ characters: createInitialCharacterRoster() });
  });

  it('葉ノードでない指定ノードだけrecordsBranchStatsが切り替わり、他のノードには影響しない', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const store = useAppStore.getState();
    const treeId = store.createComboTree(characterId, '小P始動');
    const rootId = getCharacter(characterId).comboTrees.find((t) => t.id === treeId)!.root.id;
    const childId = store.addChildNode(characterId, treeId, rootId, '中P');
    store.addChildNode(characterId, treeId, childId, '強P'); // 中Pを葉ノードでなくする

    store.setNodeRecordsBranchStats(characterId, treeId, childId, true);

    const tree = getCharacter(characterId).comboTrees.find((t) => t.id === treeId)!;
    expect(tree.root.recordsBranchStats).toBeUndefined();
    expect(findNodeByMoveName(tree.root, '中P').recordsBranchStats).toBe(true);

    store.setNodeRecordsBranchStats(characterId, treeId, childId, false);
    const treeAfterUncheck = getCharacter(characterId).comboTrees.find((t) => t.id === treeId)!;
    expect(findNodeByMoveName(treeAfterUncheck.root, '中P').recordsBranchStats).toBeUndefined();
  });
});

describe('共通区間を名前付きグループとして折りたたむ機能', () => {
  beforeEach(() => {
    useAppStore.setState({
      characters: createInitialCharacterRoster(),
      groupModeActive: false,
      groupModeAnchorId: null,
      groupSelectedIds: [],
      groupModeRuns: [],
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

  it('renameComboGroup: groupIdは変えずに名前だけ変更する。全出現箇所は同じgroupIdのまま影響を受ける', () => {
    const characterId = useAppStore.getState().characters[0].id;

    const first = buildChainTree(characterId);
    useAppStore.getState().startGroupMode(first.aId);
    useAppStore.getState().setGroupSelectedIds([first.bId, first.cId]);
    useAppStore.getState().confirmGroupSelection(characterId, 'コンボA');

    const second = buildChainTree(characterId);
    useAppStore.getState().startGroupMode(second.aId);
    useAppStore.getState().setGroupSelectedIds([second.bId, second.cId]);
    useAppStore.getState().confirmGroupSelection(characterId, 'コンボA');

    const groupId = getCharacter(characterId).namedComboGroups[0].id;
    useAppStore.getState().renameComboGroup(characterId, groupId, '改名後');

    const character = getCharacter(characterId);
    expect(character.namedComboGroups).toHaveLength(1);
    expect(character.namedComboGroups[0].id).toBe(groupId);
    expect(character.namedComboGroups[0].name).toBe('改名後');

    // 実データ側のgroupIdは変わらないため、両方の出現箇所とも引き続き同じグループとして扱われる
    const firstA = findNodeByMoveName(character.comboTrees[0].root, 'a');
    const secondA = findNodeByMoveName(character.comboTrees[1].root, 'a');
    expect(firstA.groupId).toBe(groupId);
    expect(secondA.groupId).toBe(groupId);
  });

  it('renameComboGroup: 空文字（トリム後）を渡した場合は変更しない', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { aId, bId, cId } = buildChainTree(characterId);
    useAppStore.getState().startGroupMode(aId);
    useAppStore.getState().setGroupSelectedIds([bId, cId]);
    useAppStore.getState().confirmGroupSelection(characterId, 'コンボA');

    const groupId = getCharacter(characterId).namedComboGroups[0].id;
    useAppStore.getState().renameComboGroup(characterId, groupId, '   ');

    expect(getCharacter(characterId).namedComboGroups[0].name).toBe('コンボA');
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

  it('複数の枝をまとめて同じグループとして登録できる（addGroupModeRun/setGroupModeAnchor）', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const store = useAppStore.getState();
    const treeId = store.createComboTree(characterId, '小P始動');
    const rootId = getCharacter(characterId).comboTrees.find((t) => t.id === treeId)!.root.id;

    // root -> branch -> [eA -> eB, fA -> fB]（branchで2本に分岐）
    const branchId = store.addChildNode(characterId, treeId, rootId, 'branch');
    const eAId = store.addChildNode(characterId, treeId, branchId, 'eA');
    const eBId = store.addChildNode(characterId, treeId, eAId, 'eB');
    const fAId = store.addChildNode(characterId, treeId, branchId, 'fA');
    const fBId = store.addChildNode(characterId, treeId, fAId, 'fB');

    useAppStore.getState().startGroupMode(eAId);
    useAppStore.getState().setGroupSelectedIds([eBId]);
    useAppStore.getState().addGroupModeRun();

    // 1本目を追加した直後は、起点待ち（groupModeAnchorId=null）だがモード自体は継続している
    expect(useAppStore.getState().groupModeRuns).toEqual([{ anchorId: eAId, selectedIds: [eBId] }]);
    expect(useAppStore.getState().groupModeAnchorId).toBeNull();
    expect(useAppStore.getState().groupModeActive).toBe(true);

    useAppStore.getState().setGroupModeAnchor(fAId);
    useAppStore.getState().setGroupSelectedIds([fBId]);
    useAppStore.getState().confirmGroupSelection(characterId, 'コンボA');

    const character = getCharacter(characterId);
    const tree = character.comboTrees.find((t) => t.id === treeId)!;
    const eA = findNodeByMoveName(tree.root, 'eA');
    const eB = findNodeByMoveName(tree.root, 'eB');
    const fA = findNodeByMoveName(tree.root, 'fA');
    const fB = findNodeByMoveName(tree.root, 'fB');

    expect(eA.groupId).toBeDefined();
    expect(eA.groupId).toBe(eB.groupId);
    expect(eA.groupId).toBe(fA.groupId);
    expect(eA.groupId).toBe(fB.groupId);
    expect(character.namedComboGroups).toHaveLength(1);

    // 確定後はモード自体も完全に終了する
    expect(useAppStore.getState().groupModeActive).toBe(false);
    expect(useAppStore.getState().groupModeRuns).toEqual([]);

    // 表示側（groupView.ts）は無改造でも、枝ごとに独立したピルとして畳まれる
    const groupNameById = new Map(character.namedComboGroups.map((g) => [g.id, g.name]));
    const { pillMetaById } = buildGroupView(tree.root, groupNameById, new Set());
    expect(pillMetaById.get(eAId)?.memberIds).toEqual([eAId, eBId]);
    expect(pillMetaById.get(fAId)?.memberIds).toEqual([fAId, fBId]);
  });

  it('removeGroupModeRunで登録済みの枝を取り消せる', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const { aId, bId, cId } = buildChainTree(characterId);

    useAppStore.getState().startGroupMode(aId);
    useAppStore.getState().setGroupSelectedIds([bId]);
    useAppStore.getState().addGroupModeRun();
    useAppStore.getState().setGroupModeAnchor(cId);
    useAppStore.getState().addGroupModeRun();

    expect(useAppStore.getState().groupModeRuns).toHaveLength(2);

    useAppStore.getState().removeGroupModeRun(0);

    expect(useAppStore.getState().groupModeRuns).toEqual([{ anchorId: cId, selectedIds: [] }]);
  });
});

describe('一致箇所への一括反映機能', () => {
  beforeEach(() => {
    useAppStore.setState({
      characters: createInitialCharacterRoster(),
      matchModeAnchorId: null,
      matchSelectedIds: [],
      matchedAnchorIds: null,
      matchChainLength: 0,
      matchEditBeforeSnapshot: null,
      selectedNodeId: null,
      replaceModeAnchorId: null,
      replaceSelectedIds: [],
      replacementChainIds: null,
    });
  });

  function buildNamedChainTree(characterId: string, names: string[]) {
    const store = useAppStore.getState();
    const treeId = store.createComboTree(characterId, '小P始動');
    const rootId = getCharacter(characterId).comboTrees.find((t) => t.id === treeId)!.root.id;

    let parentId = rootId;
    const ids: string[] = [];
    for (const name of names) {
      const id = store.addChildNode(characterId, treeId, parentId, name);
      ids.push(id);
      parentId = id;
    }
    return { treeId, rootId, ids };
  }

  it('技名が完全一致する一本道をすべて見つけ、途中が違う箇所は除外する', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const first = buildNamedChainTree(characterId, ['p', 'q', 'r']);
    const second = buildNamedChainTree(characterId, ['p', 'q', 'r']);
    buildNamedChainTree(characterId, ['p', 'x', 'r']); // 途中が違うので一致しない

    useAppStore.getState().startMatchMode(first.ids[0]);
    useAppStore.getState().setMatchSelectedIds([first.ids[1], first.ids[2]]);
    useAppStore.getState().confirmMatchSearch(characterId, false);

    const matched = useAppStore.getState().matchedAnchorIds;
    expect([...(matched ?? [])].sort()).toEqual([first.ids[0], second.ids[0]].sort());
    expect(useAppStore.getState().matchChainLength).toBe(3);
    expect(useAppStore.getState().matchModeAnchorId).toBeNull(); // 選択モードは検索確定で終了
  });

  it('境界内の内容変更と末尾への追加が他の一致箇所へ反映される（branchStatsは対象外・境界より先は保持）', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const source = buildNamedChainTree(characterId, ['p', 'q', 'r']);
    const target = buildNamedChainTree(characterId, ['p', 'q', 'r']);

    const store = useAppStore.getState();
    // targetのr(末尾)に元々あった独自の続き。境界より先なので壊れないことを確認する対象
    const preExistingId = store.addChildNode(characterId, target.treeId, target.ids[2], '既存の続き');
    // targetのq(位置1)にbranchStatsを設定しておく。上書きされないことを確認する対象
    store.setNodeBranchStats(characterId, target.treeId, target.ids[1], {
      damage: 1234,
      dGaugeChange: null,
      opponentDGaugeChip: null,
      saGaugeGain: null,
      damageRating: null,
      dGaugeRating: null,
      saGaugeRating: null,
      carryRating: null,
      overallRating: null,
      plusFrame: null,
      plusFrameHitType: null,
      isThrowRange: false,
      canOkizeme: false,
      isFavorite: false,
      startHitCondition: null,
      isJustParryStart: false,
      isRushStart: false,
      usesCA: false,
      finishingSpecialVariant: null,
      finishingSuperArtName: null,
    });

    useAppStore.getState().startMatchMode(source.ids[0]);
    useAppStore.getState().setMatchSelectedIds([source.ids[1], source.ids[2]]);
    useAppStore.getState().confirmMatchSearch(characterId, false);

    useAppStore.getState().startEditingMatch(source.ids[0]);

    // 境界内(位置1)の内容を変更
    useAppStore.getState().updateNodeMoveName(characterId, source.treeId, source.ids[1], 'q改');
    // 末尾(位置2)に新しいノードを追加
    const newTailId = useAppStore.getState().addChildNode(characterId, source.treeId, source.ids[2], '新しい枝');

    useAppStore.getState().propagateMatchChanges(characterId);

    const character = getCharacter(characterId);
    const targetTree = character.comboTrees.find((t) => t.id === target.treeId)!;

    const targetQ = findNodeByMoveName(targetTree.root, 'q改');
    expect(targetQ.id).toBe(target.ids[1]); // 実体は上書きするだけで、IDは変わらない
    expect(targetQ.branchStats?.damage).toBe(1234); // branchStatsは対象外で保持される

    const targetR = findNodeByMoveName(targetTree.root, 'r');
    const targetNewTail = targetR.children.find((c) => c.moveName === '新しい枝');
    expect(targetNewTail).toBeDefined();
    expect(targetNewTail!.id).not.toBe(newTailId); // クローンなのでIDは新規
    expect(targetNewTail!.branchStats).toBeNull();

    // 境界より先に元々あった独自の続きは壊れていない
    const preExisting = targetR.children.find((c) => c.id === preExistingId);
    expect(preExisting?.moveName).toBe('既存の続き');

    // 反映後はモードごと完全に終了する
    expect(useAppStore.getState().matchedAnchorIds).toBeNull();
    expect(useAppStore.getState().matchEditBeforeSnapshot).toBeNull();
  });

  it('一致箇所を丸ごと別の内容に置換しても、各箇所が個別に持つ続きは保持される', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const source = buildNamedChainTree(characterId, ['p', 'q', 'r']);
    const target = buildNamedChainTree(characterId, ['p', 'q', 'r']);
    const replaceSource = buildNamedChainTree(characterId, ['x', 'y']);

    const store = useAppStore.getState();
    // targetのr(末尾)に元々あった独自の続き。置換後も繋ぎ直されることを確認する対象
    const preExistingId = store.addChildNode(characterId, target.treeId, target.ids[2], '既存の続き');

    useAppStore.getState().startMatchMode(source.ids[0]);
    useAppStore.getState().setMatchSelectedIds([source.ids[1], source.ids[2]]);
    useAppStore.getState().confirmMatchSearch(characterId, false);
    expect(useAppStore.getState().matchChainLength).toBe(3);

    useAppStore.getState().startReplaceSelection(replaceSource.ids[0]);
    useAppStore.getState().setReplaceSelectedIds([replaceSource.ids[1]]);
    useAppStore.getState().confirmReplaceSelection();
    expect(useAppStore.getState().replacementChainIds).toEqual([replaceSource.ids[0], replaceSource.ids[1]]);

    useAppStore.getState().propagateReplaceChanges(characterId);

    const character = getCharacter(characterId);

    const sourceTree = character.comboTrees.find((t) => t.id === source.treeId)!;
    const sourceX = findNodeByMoveName(sourceTree.root, 'x');
    expect(sourceX.id).not.toBe(source.ids[0]); // 丸ごと差し替えなので新しいID
    expect(sourceX.children).toHaveLength(1);
    expect(sourceX.children[0].moveName).toBe('y');
    expect(sourceX.children[0].children).toHaveLength(0); // 元々続きが無かった箇所は空のまま
    expect(findNodeInComboTrees(character.comboTrees, source.ids[1])).toBeNull(); // 旧'q'は消える
    expect(findNodeInComboTrees(character.comboTrees, source.ids[2])).toBeNull(); // 旧'r'は消える

    const targetTree = character.comboTrees.find((t) => t.id === target.treeId)!;
    const targetX = findNodeByMoveName(targetTree.root, 'x');
    const targetY = targetX.children[0];
    expect(targetY.moveName).toBe('y');
    const preserved = targetY.children.find((c) => c.id === preExistingId);
    expect(preserved?.moveName).toBe('既存の続き'); // 個別の続きはそのまま繋ぎ直される

    // 置換内容のコピー元(replaceSource自身)は一致箇所ではないため変更されない
    const replaceSourceTree = character.comboTrees.find((t) => t.id === replaceSource.treeId)!;
    expect(findNodeByMoveName(replaceSourceTree.root, 'x').id).toBe(replaceSource.ids[0]);

    // 反映後はモードごと完全に終了する
    expect(useAppStore.getState().matchedAnchorIds).toBeNull();
    expect(useAppStore.getState().replacementChainIds).toBeNull();
  });

  it('置換元として使ったノード自身が一致箇所に含まれる場合はスキップされる', () => {
    const characterId = useAppStore.getState().characters[0].id;
    const source = buildNamedChainTree(characterId, ['p', 'q', 'r']);
    const target = buildNamedChainTree(characterId, ['p', 'q', 'r']);

    useAppStore.getState().startMatchMode(source.ids[0]);
    useAppStore.getState().setMatchSelectedIds([source.ids[1], source.ids[2]]);
    useAppStore.getState().confirmMatchSearch(characterId, false);

    // 一致箇所(source)自身を編集してから、置換内容として選ぶ
    useAppStore.getState().updateNodeMoveName(characterId, source.treeId, source.ids[0], 'p改');
    useAppStore.getState().startReplaceSelection(source.ids[0]);
    useAppStore.getState().setReplaceSelectedIds([source.ids[1]]);
    useAppStore.getState().confirmReplaceSelection();
    useAppStore.getState().propagateReplaceChanges(characterId);

    const character = getCharacter(characterId);
    const sourceTree = character.comboTrees.find((t) => t.id === source.treeId)!;
    // 置換元自身はスキップされ、編集した内容のまま(idも変わらない)
    expect(findNodeByMoveName(sourceTree.root, 'p改').id).toBe(source.ids[0]);

    const targetTree = character.comboTrees.find((t) => t.id === target.treeId)!;
    expect(findNodeByMoveName(targetTree.root, 'p改').id).not.toBe(target.ids[0]);
  });
});

describe('技データベース（moveStatsDatabase）', () => {
  beforeEach(() => {
    useAppStore.setState({ characters: createInitialCharacterRoster(), moveStatsDatabase: {} });
  });

  it('setMoveStatsは指定キャラ・指定技だけを更新し、他キャラのデータには影響しない', () => {
    const [charA, charB] = useAppStore.getState().characters;

    useAppStore.getState().setMoveStats(charA.id, '弱P', {
      isMultiHit: false,
      hits: [
        {
          damage: 300,
          modifier: '',
          dGaugeGain: 10,
          saGaugeGain: 5,
          dGaugeChip: 20,
          dGaugeChipPunishCounter: -50,
          minDamageGuaranteePercent: null,
          dGaugeGainDuringRush: null,
          groundPlusFrame: '',
          airPlusFrame: '',
          cancelType: null,
        },
      ],
      cancelableSuperArtNames: [],
      sharesModifierAcrossHits: false,
    });

    expect(useAppStore.getState().moveStatsDatabase[charA.id]['弱P'].hits[0].damage).toBe(300);
    expect(useAppStore.getState().moveStatsDatabase[charB.id]).toBeUndefined();
  });

  it('複数ヒット技はhitsに段数ぶんの数値を持ち、区間合計が手計算通りになる', () => {
    const [char] = useAppStore.getState().characters;

    // 三段技で200/200/400ダメージの例
    useAppStore.getState().setMoveStats(char.id, '中K', {
      isMultiHit: true,
      hits: [
        { damage: 200, modifier: '', dGaugeGain: null, saGaugeGain: null, dGaugeChip: null, dGaugeChipPunishCounter: null, minDamageGuaranteePercent: null, dGaugeGainDuringRush: null, groundPlusFrame: '', airPlusFrame: '', cancelType: null },
        { damage: 200, modifier: '', dGaugeGain: null, saGaugeGain: null, dGaugeChip: null, dGaugeChipPunishCounter: null, minDamageGuaranteePercent: null, dGaugeGainDuringRush: null, groundPlusFrame: '', airPlusFrame: '', cancelType: null },
        { damage: 400, modifier: '', dGaugeGain: null, saGaugeGain: null, dGaugeChip: null, dGaugeChipPunishCounter: null, minDamageGuaranteePercent: null, dGaugeGainDuringRush: null, groundPlusFrame: '', airPlusFrame: '', cancelType: null },
      ],
      cancelableSuperArtNames: [],
      sharesModifierAcrossHits: false,
    });

    const stats = useAppStore.getState().moveStatsDatabase[char.id]['中K'];
    const allHitsTotal = stats.hits.reduce((sum, hit) => sum + (hit.damage ?? 0), 0);
    const lastTwoHitsTotal = stats.hits.slice(1, 3).reduce((sum, hit) => sum + (hit.damage ?? 0), 0);

    expect(allHitsTotal).toBe(800);
    expect(lastTwoHitsTotal).toBe(600);
  });

  it('restoreMoveStatsDatabaseは壊れた値をnullに落とし、hitsが空なら1要素で補う', () => {
    const [char] = useAppStore.getState().characters;

    useAppStore.getState().restoreMoveStatsDatabase({
      [char.id]: {
        '強P': {
          isMultiHit: false,
          hits: [{ damage: 'oops', modifier: '始動補正20%', dGaugeGain: 5, saGaugeGain: null, dGaugeChip: undefined }],
        },
        '2強K': { isMultiHit: true, hits: [] },
      },
      '存在しないキャラ扱いでもそのまま保持': { x: { isMultiHit: false, hits: [{ damage: 1, dGaugeGain: null, saGaugeGain: null, dGaugeChip: null }] } },
    });

    const db = useAppStore.getState().moveStatsDatabase;
    expect(db[char.id]['強P']).toEqual({
      isMultiHit: false,
      hits: [
        {
          damage: null,
          modifier: '始動補正20%',
          dGaugeGain: 5,
          saGaugeGain: null,
          dGaugeChip: null,
          dGaugeChipPunishCounter: null,
          minDamageGuaranteePercent: null,
          dGaugeGainDuringRush: null,
          groundPlusFrame: '',
          airPlusFrame: '',
          cancelType: null,
        },
      ],
      cancelableSuperArtNames: [],
      sharesModifierAcrossHits: false,
    });
    // hitsが空配列で保存されていても、読み込み後は最低1要素に補完される
    expect(db[char.id]['2強K'].hits).toHaveLength(1);
  });

  it('restoreMoveStatsDatabaseはcancelableSuperArtNamesを保持しつつ、文字列以外の要素は取り除く', () => {
    const [char] = useAppStore.getState().characters;

    useAppStore.getState().restoreMoveStatsDatabase({
      [char.id]: {
        '強P': {
          isMultiHit: false,
          hits: [],
          cancelableSuperArtNames: ['SA3', 42, null, 'SA1'],
        },
      },
    });

    expect(useAppStore.getState().moveStatsDatabase[char.id]['強P'].cancelableSuperArtNames).toEqual([
      'SA3',
      'SA1',
    ]);
  });

  it('有利フレーム（地上/空中ヒット）は幅のある表記も含めて自由記述の文字列のまま保持し、未入力・不正値は空文字に正規化する', () => {
    const [char] = useAppStore.getState().characters;

    useAppStore.getState().restoreMoveStatsDatabase({
      [char.id]: {
        '強P': {
          isMultiHit: false,
          hits: [{ damage: 900, groundPlusFrame: '+2~+4', airPlusFrame: 42 }],
        },
      },
    });

    const hit = useAppStore.getState().moveStatsDatabase[char.id]['強P'].hits[0];
    expect(hit.groundPlusFrame).toBe('+2~+4');
    expect(hit.airPlusFrame).toBe('');
  });

  it('壊れたJSON（配列やnull）を読み込んでも空のデータベースにフォールバックする', () => {
    useAppStore.getState().setMoveStats(useAppStore.getState().characters[0].id, '弱P', {
      isMultiHit: false,
      hits: [
        {
          damage: 999,
          modifier: '',
          dGaugeGain: null,
          saGaugeGain: null,
          dGaugeChip: null,
          dGaugeChipPunishCounter: null,
          minDamageGuaranteePercent: null,
          dGaugeGainDuringRush: null,
          groundPlusFrame: '',
          airPlusFrame: '',
          cancelType: null,
        },
      ],
      cancelableSuperArtNames: [],
      sharesModifierAcrossHits: false,
    });

    useAppStore.getState().restoreMoveStatsDatabase(null);

    expect(useAppStore.getState().moveStatsDatabase).toEqual({});
  });
});
