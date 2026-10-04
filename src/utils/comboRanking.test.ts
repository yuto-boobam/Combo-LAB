// src/utils/comboRanking.test.ts

import { describe, expect, it } from 'vitest';
import { collectComboEndingSummaries, sortComboEndingSummaries } from './comboRanking';
import type { ComboBranchStats, ComboTree, MoveHitStats, MoveNode, MoveStats, MoveStatsDatabase } from '../types';

const CHARACTER_ID = 'ryu';

function makeBranchStats(overrides: Partial<ComboBranchStats> = {}): ComboBranchStats {
  return {
    damage: null,
    dGaugeChange: null,
    opponentDGaugeChip: null,
    saGaugeGain: null,
    isDamageAutoSynced: true,
    isOpponentDGaugeChipAutoSynced: true,
    isDGaugeChangeAutoSynced: true,
    isSaGaugeGainAutoSynced: true,
    damageRating: null,
    dGaugeRating: null,
    saGaugeRating: null,
    carryRating: null,
    okizemeRating: null,
    difficultyRating: null,
    overallRating: null,
    isOverallRatingAutoSynced: true,
    plusFrame: null,
    isThrowRange: false,
    canOkizeme: false,
    isFavorite: false,
    startHitCondition: null,
    isJustParryStart: false,
    isRushStart: false,
    usesCA: false,
    finishingSpecialVariant: null,
    finishingMoveOptions: [],
    startingMoveNames: null,
    startingMoveCancelHitIndex: null,
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

function makeHit(overrides: Partial<MoveHitStats> = {}): MoveHitStats {
  return {
    damage: null,
    modifier: '',
    dGaugeGain: null,
    saGaugeGain: null,
    dGaugeChip: null,
    dGaugeChipPunishCounter: null,
    minDamageGuaranteePercent: null,
    dGaugeGainDuringRush: null,
    cancelType: null,
    ...overrides,
  };
}

function makeStats(hits: MoveHitStats[]): MoveStats {
  return { isMultiHit: false, hits, cancelableSuperArtNames: [], sharesModifierAcrossHits: false };
}

const EMPTY_STATS_DATABASE: MoveStatsDatabase = {};

describe('collectComboEndingSummaries（通常の木）', () => {
  it('葉ノードだけを終端として拾い、始動技(木のラベル)と経路(始動技を除く)を組み立てる', () => {
    const leaf = makeNode('leaf', '強昇竜拳', { branchStats: makeBranchStats({ damage: 2500 }) });
    const mid = makeNode('mid', 'キャンセルラッシュ', { children: [leaf] });
    const root = makeNode('root', '2中K', { children: [mid] });
    const trees = [makeTree('t1', '2中K', root)];

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, EMPTY_STATS_DATABASE, []);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      nodeId: 'leaf',
      treeId: 't1',
      starterLabel: '2中K',
      pathLabel: 'キャンセルラッシュ → 強昇竜拳',
      endingLabel: '強昇竜拳',
      isSelectedStarter: true,
    });
    expect(summaries[0].branchStats?.damage).toBe(2500);
  });

  it('finishingMoveOptionsを複数登録すると、「何も追加しない」「技Cを追加」「技SAを追加」がそれぞれ別の行としてダメージ付きで一覧に並ぶ（2026-10-03ユーザー要望）', () => {
    const b = makeNode('b', '強P', {
      // damage: 1200は「このノード自身で終わる」場合の自動計算値が既に保存されている状態を
      // 模している（実際のアプリではSideDrawerPanel.tsxのuseEffectが自動で反映する。
      // collectComboEndingSummariesはベース行を再計算せず実データをそのまま使うため）
      branchStats: makeBranchStats({
        damage: 1200,
        finishingMoveOptions: [
          { name: '強昇竜拳', specialVariant: null },
          { name: 'SA3', specialVariant: null },
        ],
      }),
    });
    const a = makeNode('a', '中K', { children: [b] });
    const trees = [makeTree('t1', '中K', a)];

    const moveStatsDatabase: MoveStatsDatabase = {
      [CHARACTER_ID]: {
        '中K': makeStats([makeHit({ damage: 500 })]),
        '強P': makeStats([makeHit({ damage: 700 })]),
        '強昇竜拳': makeStats([makeHit({ damage: 1000 })]),
        SA3: makeStats([makeHit({ damage: 4000, minDamageGuaranteePercent: 50 })]),
      },
    };

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, moveStatsDatabase, []);

    // A→Bで終わる（ベース行）・A→B→強昇竜拳・A→B→SA3の3行に展開される
    expect(summaries).toHaveLength(3);
    expect(summaries.map((s) => s.endingLabel).sort()).toEqual(['強P', '強P → SA3', '強P → 強昇竜拳']);

    const base = summaries.find((s) => s.endingLabel === '強P')!;
    const withNormalMove = summaries.find((s) => s.endingLabel === '強P → 強昇竜拳')!;
    const withSA = summaries.find((s) => s.endingLabel === '強P → SA3')!;

    // いずれも同じ実ノード(b)を指す（ジャンプ先は共通）
    expect([base, withNormalMove, withSA].every((s) => s.nodeId === 'b')).toBe(true);
    // 3行とも一意なkeyを持つ
    expect(new Set([base.key, withNormalMove.key, withSA.key]).size).toBe(3);

    expect(base.branchStats?.damage).toBe(1200); // 中K:500 + 強P:700(2発目=100%)
    expect(withNormalMove.branchStats?.damage).toBe(2000); // + 強昇竜拳:1000(3発目=80%)=800
    expect(withSA.branchStats?.damage).toBe(4400); // + SA3:4000*0.8(保証50%以上なので自然計算)=3200
  });

  it('登録した技ごとの評価・プラスフレーム等は、ノード自身の評価とは独立して一覧に反映される（2026-10-03ユーザー要望：SA2で締めた時とSA3で締めた時で評価を切り替えたい）', () => {
    const b = makeNode('b', '強P', {
      branchStats: makeBranchStats({
        damage: 1200,
        overallRating: 2, // ノード自身（何も追加しない場合）の評価
        plusFrame: -2,
        isThrowRange: false,
        finishingMoveOptions: [
          {
            name: 'SA3',
            specialVariant: null,
            damageRating: null,
            dGaugeRating: null,
            saGaugeRating: null,
            carryRating: null,
            okizemeRating: null,
            difficultyRating: null,
            overallRating: 5, // SA3で締めた場合専用の評価
            isOverallRatingAutoSynced: false,
            plusFrame: 10,
            isThrowRange: true,
            canOkizeme: true,
          },
        ],
      }),
    });
    const a = makeNode('a', '中K', { children: [b] });
    const trees = [makeTree('t1', '中K', a)];

    const moveStatsDatabase: MoveStatsDatabase = {
      [CHARACTER_ID]: {
        '中K': makeStats([makeHit({ damage: 500 })]),
        '強P': makeStats([makeHit({ damage: 700 })]),
        SA3: makeStats([makeHit({ damage: 4000 })]),
      },
    };

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, moveStatsDatabase, []);
    const base = summaries.find((s) => s.endingLabel === '強P')!;
    const withSA = summaries.find((s) => s.endingLabel === '強P → SA3')!;

    // ベース行（何も追加しない）はノード自身の評価のまま
    expect(base.branchStats?.overallRating).toBe(2);
    expect(base.branchStats?.plusFrame).toBe(-2);
    expect(base.branchStats?.isThrowRange).toBe(false);

    // SA3を追加した行は、SA3専用に登録した評価・プラスフレーム・投げ間合い・起き攻め可能が
    // 反映され、ノード自身の値を引き継がない
    expect(withSA.branchStats?.overallRating).toBe(5);
    expect(withSA.branchStats?.plusFrame).toBe(10);
    expect(withSA.branchStats?.isThrowRange).toBe(true);
    expect(withSA.branchStats?.canOkizeme).toBe(true);
  });

  it('分岐している場合は分岐ごとに別の終端として拾う', () => {
    const leafA = makeNode('leafA', '強昇竜拳');
    const leafB = makeNode('leafB', '地上強波掌');
    const root = makeNode('root', '強P', { children: [leafA, leafB] });
    const trees = [makeTree('t1', '強P', root)];

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, EMPTY_STATS_DATABASE, []);
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

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, EMPTY_STATS_DATABASE, []);
    // guardノード自身と、その先の葉(grandchild)の両方が終端として拾われる
    expect(summaries.map((s) => s.nodeId).sort()).toEqual(['grandchild', 'guard']);
  });

  it('始動技自身が終端(葉)の場合、経路は空文字になる', () => {
    const root = makeNode('root', '2中K');
    const trees = [makeTree('t1', '2中K', root)];

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, EMPTY_STATS_DATABASE, []);
    expect(summaries).toEqual([
      expect.objectContaining({ nodeId: 'root', starterLabel: '2中K', pathLabel: '' }),
    ]);
  });

  it('finishingMoveOptions追加前の形式のまま保存されたbranchStats（ショーケース/旧データ、フィールド自体が存在しない）でもクラッシュせず、ベース行だけを返す', () => {
    const { finishingMoveOptions: _omit, ...legacyBranchStatsFields } = { ...makeBranchStats(), damage: 1000 };
    const legacyBranchStats = legacyBranchStatsFields as ComboBranchStats;
    const leaf = makeNode('leaf', '強昇竜拳', { branchStats: legacyBranchStats });
    const root = makeNode('root', '2中K', { children: [leaf] });
    const trees = [makeTree('t1', '2中K', root)];

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, EMPTY_STATS_DATABASE, []);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].branchStats?.damage).toBe(1000);
  });
});

describe('collectComboEndingSummaries（汎用コンボ: rootがstartingMoveOptionsを持つ場合）', () => {
  it('候補一覧の数だけ行を展開する（1つの終端が始動技の数だけ表示される。2026-08-30ユーザー要望）', () => {
    const leaf = makeNode('leaf', '中P');
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [leaf],
    });
    const trees = [makeTree('t1', '中攻撃', genericRoot)];

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, EMPTY_STATS_DATABASE, []);

    expect(summaries).toHaveLength(2);
    expect(summaries.map((s) => s.starterLabel).sort()).toEqual(['弱K', '弱P']);
    // 展開後の行は全て同じ実ノードを指す（ジャンプ先が正しく実在のノードのままであること）
    expect(summaries.every((s) => s.nodeId === 'leaf')).toBe(true);
    // Reactのkeyとして使うkeyは行ごとに一意
    expect(new Set(summaries.map((s) => s.key)).size).toBe(2);
  });

  it('各候補ごとに、その技を始動技として使ったと仮定したダメージを計算する', () => {
    const leaf = makeNode('leaf', '中P');
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [leaf],
    });
    const trees = [makeTree('t1', '中攻撃', genericRoot)];

    const moveStatsDatabase: MoveStatsDatabase = {
      [CHARACTER_ID]: {
        '弱P': makeStats([makeHit({ damage: 300 })]),
        '弱K': makeStats([makeHit({ damage: 350 })]),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, moveStatsDatabase, []);

    const weakP = summaries.find((s) => s.starterLabel === '弱P')!;
    const weakK = summaries.find((s) => s.starterLabel === '弱K')!;
    // 弱P(300,起点=100%) + 中P(1000,テーブル2段目=100%) = 1300
    expect(weakP.branchStats?.damage).toBe(1300);
    // 弱K(350,起点=100%) + 中P(1000,テーブル2段目=100%) = 1350
    expect(weakK.branchStats?.damage).toBe(1350);
  });

  it('実際に選ばれている候補の行だけisSelectedStarterがtrueになり、評価等の手入力項目を保持する。他の行は未記録として扱う', () => {
    const leaf = makeNode('leaf', '中P', {
      branchStats: makeBranchStats({ startingMoveNames: ['弱K'], overallRating: 5, isFavorite: true }),
    });
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [leaf],
    });
    const trees = [makeTree('t1', '中攻撃', genericRoot)];

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, EMPTY_STATS_DATABASE, []);

    const weakP = summaries.find((s) => s.starterLabel === '弱P')!;
    const weakK = summaries.find((s) => s.starterLabel === '弱K')!;

    expect(weakK.isSelectedStarter).toBe(true);
    expect(weakK.branchStats?.overallRating).toBe(5);
    expect(weakK.branchStats?.isFavorite).toBe(true);

    expect(weakP.isSelectedStarter).toBe(false);
    expect(weakP.branchStats?.overallRating).toBeNull();
    expect(weakP.branchStats?.isFavorite).toBe(false);
  });

  it('finishingMoveOptionsを登録すると、始動技候補ごとに「その技を追加した場合」の行が別途展開される（選ばれていない候補でも計算される）', () => {
    const leaf = makeNode('leaf', '中P', {
      branchStats: makeBranchStats({
        startingMoveNames: ['弱K'],
        finishingMoveOptions: [{ name: 'SA3', specialVariant: null }],
      }),
    });
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [leaf],
    });
    const trees = [makeTree('t1', '中攻撃', genericRoot)];

    const moveStatsDatabase: MoveStatsDatabase = {
      [CHARACTER_ID]: {
        '弱P': makeStats([makeHit({ damage: 300 })]),
        '弱K': makeStats([makeHit({ damage: 350 })]),
        '中P': makeStats([makeHit({ damage: 1000 })]),
        'SA3': makeStats([makeHit({ damage: 2000 })]),
      },
    };

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, moveStatsDatabase, []);

    // ベース行（何も追加しない＝このノード自身で終わる）は、SA3を含まないダメージのまま
    const weakPBase = summaries.find((s) => s.starterLabel === '弱P' && s.endingLabel === '中P')!;
    expect(weakPBase.branchStats?.damage).toBe(1300);

    // SA3を追加した行は別途展開され、選ばれていない始動技候補（弱P）でも計算される
    // （登録した技は「このendingの終わり方」であり、始動技には依存しないため）
    const weakPWithSA3 = summaries.find((s) => s.starterLabel === '弱P' && s.endingLabel === '中P → SA3')!;
    expect(weakPWithSA3.branchStats?.damage).toBeGreaterThan(1300);
    const weakKWithSA3 = summaries.find((s) => s.starterLabel === '弱K' && s.endingLabel === '中P → SA3')!;
    expect(weakKWithSA3.branchStats?.damage).toBeGreaterThan(1350);
  });

  it('まだ始動技が選ばれていなくても、候補それぞれの行が計算済みで表示される（未選択でも参考値が見える）', () => {
    const leaf = makeNode('leaf', '中P');
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [leaf],
    });
    const trees = [makeTree('t1', '中攻撃', genericRoot)];

    const moveStatsDatabase: MoveStatsDatabase = {
      [CHARACTER_ID]: {
        '弱P': makeStats([makeHit({ damage: 300 })]),
        '弱K': makeStats([makeHit({ damage: 350 })]),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, moveStatsDatabase, []);

    expect(summaries.every((s) => !s.isSelectedStarter)).toBe(true);
    expect(summaries.every((s) => s.branchStats?.damage !== null)).toBe(true);
  });

  it('分岐が深く枝分かれした汎用コンボの木でも、末端(葉)×候補数ぶんすべて拾う（取りこぼしなし）', () => {
    // 実際の汎用コンボの木のように、途中で複数回分岐する構造を再現する
    //   root(中攻撃, 汎用, 候補2つ) -> a -> [leaf1, b -> [leaf2, leaf3]]
    //                              -> c -> [leaf4, leaf5, leaf6]
    const leaf1 = makeNode('leaf1', '強昇竜拳');
    const leaf2 = makeNode('leaf2', '中昇竜拳');
    const leaf3 = makeNode('leaf3', '強波掌撃');
    const b = makeNode('b', 'キャンセルラッシュ', { children: [leaf2, leaf3] });
    const a = makeNode('a', '強P', { children: [leaf1, b] });

    const leaf4 = makeNode('leaf4', '中足刀');
    const leaf5 = makeNode('leaf5', '強足刀');
    const leaf6 = makeNode('leaf6', 'OD足刀');
    const c = makeNode('c', '4強P', { children: [leaf4, leaf5, leaf6] });

    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [a, c],
    });
    const trees = [makeTree('t1', '中攻撃', genericRoot)];

    const summaries = collectComboEndingSummaries(trees, CHARACTER_ID, EMPTY_STATS_DATABASE, []);

    // 分岐点(a, b, c)自体は子を持つため終端に含まれない。葉6件 × 候補2件 = 12行
    expect(summaries).toHaveLength(12);
    const nodeIdCounts = new Map<string, number>();
    summaries.forEach((s) => nodeIdCounts.set(s.nodeId, (nodeIdCounts.get(s.nodeId) ?? 0) + 1));
    expect(Object.fromEntries(nodeIdCounts)).toEqual({
      leaf1: 2,
      leaf2: 2,
      leaf3: 2,
      leaf4: 2,
      leaf5: 2,
      leaf6: 2,
    });
  });
});

describe('sortComboEndingSummaries', () => {
  it('指定キーで降順にソートし、未入力(null)は常に末尾に置く', () => {
    const root = makeNode('root', '始動');
    const trees = [makeTree('t1', '始動', root)];
    const base = collectComboEndingSummaries(trees, CHARACTER_ID, EMPTY_STATS_DATABASE, [])[0];
    const summaries = [
      { ...base, key: 'a', nodeId: 'a', branchStats: makeBranchStats({ damage: 1000 }) },
      { ...base, key: 'b', nodeId: 'b', branchStats: makeBranchStats({ damage: null }) },
      { ...base, key: 'c', nodeId: 'c', branchStats: makeBranchStats({ damage: 3000 }) },
      { ...base, key: 'd', nodeId: 'd', branchStats: makeBranchStats({ damage: 2000 }) },
    ];

    const sortedDesc = sortComboEndingSummaries(summaries, 'damage', 'desc');
    expect(sortedDesc.map((s) => s.nodeId)).toEqual(['c', 'd', 'a', 'b']);

    const sortedAsc = sortComboEndingSummaries(summaries, 'damage', 'asc');
    expect(sortedAsc.map((s) => s.nodeId)).toEqual(['a', 'd', 'c', 'b']);
  });
});
