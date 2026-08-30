// src/utils/comboRanking.test.ts

import { describe, expect, it } from 'vitest';
import { collectComboEndingSummaries, sortComboEndingSummaries } from './comboRanking';
import type { ComboBranchStats, ComboTree, MoveNode } from '../types';

function makeBranchStats(overrides: Partial<ComboBranchStats> = {}): ComboBranchStats {
  return {
    damage: null,
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
    startingMoveNames: null,
    ...overrides,
  };
}

function makeNode(id: string, moveName: string, overrides: Partial<MoveNode> = {}): MoveNode {
  return {
    id,
    moveName,
    attributes: [],
    specialNote: '',
    branchStats: null,
    createdBy: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    children: [],
    ...overrides,
  };
}

function makeTree(id: string, label: string, root: MoveNode): ComboTree {
  return { id, label, root };
}

describe('collectComboEndingSummaries', () => {
  it('葉ノードだけを終端として拾い、始動技(木のラベル)と経路(始動技を除く)を組み立てる', () => {
    const leaf = makeNode('leaf', '強昇竜拳', { branchStats: makeBranchStats({ damage: 2500 }) });
    const mid = makeNode('mid', 'キャンセルラッシュ', { children: [leaf] });
    const root = makeNode('root', '2中K', { children: [mid] });
    const trees = [makeTree('t1', '2中K', root)];

    const summaries = collectComboEndingSummaries(trees);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      nodeId: 'leaf',
      treeId: 't1',
      starterLabel: '2中K',
      pathLabel: 'キャンセルラッシュ → 強昇竜拳',
      endingLabel: '強昇竜拳',
    });
    expect(summaries[0].branchStats?.damage).toBe(2500);
  });

  it('分岐している場合は分岐ごとに別の終端として拾う', () => {
    const leafA = makeNode('leafA', '強昇竜拳');
    const leafB = makeNode('leafB', '地上強波掌');
    const root = makeNode('root', '強P', { children: [leafA, leafB] });
    const trees = [makeTree('t1', '強P', root)];

    const summaries = collectComboEndingSummaries(trees);
    expect(summaries.map((s) => s.nodeId).sort()).toEqual(['leafA', 'leafB']);
  });

  it('ガード/空振り属性のノードは葉でなくても終端として拾う', () => {
    const grandchild = makeNode('grandchild', '中P');
    const guardNode = makeNode('guard', '強P', {
      attributes: [{ type: 'guard' }],
      children: [grandchild],
    });
    const root = makeNode('root', '2中K', { children: [guardNode] });
    const trees = [makeTree('t1', '2中K', root)];

    const summaries = collectComboEndingSummaries(trees);
    // guardノード自身と、その先の葉(grandchild)の両方が終端として拾われる
    expect(summaries.map((s) => s.nodeId).sort()).toEqual(['grandchild', 'guard']);
  });

  it('始動技自身が終端(葉)の場合、経路は空文字になる', () => {
    const root = makeNode('root', '2中K');
    const trees = [makeTree('t1', '2中K', root)];

    const summaries = collectComboEndingSummaries(trees);
    expect(summaries).toEqual([
      expect.objectContaining({ nodeId: 'root', starterLabel: '2中K', pathLabel: '' }),
    ]);
  });
});

describe('collectComboEndingSummaries（汎用コンボ: rootがstartingMoveOptionsを持つ場合）', () => {
  it('末端でstartingMoveNamesが選ばれていれば、tree.labelの代わりにそれを始動技として使う', () => {
    const leaf = makeNode('leaf', '強昇竜拳', {
      branchStats: makeBranchStats({ startingMoveNames: ['弱K'] }),
    });
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [leaf],
    });
    const trees = [makeTree('t1', '中攻撃', genericRoot)];

    const summaries = collectComboEndingSummaries(trees);
    expect(summaries[0].starterLabel).toBe('弱K');
  });

  it('複数技の並び（ジャンプ攻撃始動）が選ばれていれば「→」で繋いで始動技として使う', () => {
    const leaf = makeNode('leaf', '強昇竜拳', {
      branchStats: makeBranchStats({ startingMoveNames: ['J強K', '強P'] }),
    });
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['J強K', '強P']],
      children: [leaf],
    });
    const trees = [makeTree('t1', '中攻撃', genericRoot)];

    const summaries = collectComboEndingSummaries(trees);
    expect(summaries[0].starterLabel).toBe('J強K → 強P');
  });

  it('末端でまだstartingMoveNamesが選ばれていなければ、未選択であることがわかるラベルにする', () => {
    const leaf = makeNode('leaf', '強昇竜拳');
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [leaf],
    });
    const trees = [makeTree('t1', '中攻撃', genericRoot)];

    const summaries = collectComboEndingSummaries(trees);
    expect(summaries[0].starterLabel).toBe('中攻撃(始動技未選択)');
  });
});

describe('sortComboEndingSummaries', () => {
  it('指定キーで降順にソートし、未入力(null)は常に末尾に置く', () => {
    const root = makeNode('root', '始動');
    const trees = [makeTree('t1', '始動', root)];
    const summaries = [
      { ...collectComboEndingSummaries(trees)[0], nodeId: 'a', branchStats: makeBranchStats({ damage: 1000 }) },
      { ...collectComboEndingSummaries(trees)[0], nodeId: 'b', branchStats: makeBranchStats({ damage: null }) },
      { ...collectComboEndingSummaries(trees)[0], nodeId: 'c', branchStats: makeBranchStats({ damage: 3000 }) },
      { ...collectComboEndingSummaries(trees)[0], nodeId: 'd', branchStats: makeBranchStats({ damage: 2000 }) },
    ];

    const sortedDesc = sortComboEndingSummaries(summaries, 'damage', 'desc');
    expect(sortedDesc.map((s) => s.nodeId)).toEqual(['c', 'd', 'a', 'b']);

    const sortedAsc = sortComboEndingSummaries(summaries, 'damage', 'asc');
    expect(sortedAsc.map((s) => s.nodeId)).toEqual(['a', 'd', 'c', 'b']);
  });
});
