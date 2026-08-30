import { describe, expect, it } from 'vitest';
import {
  calculateBranchDGaugeBreakdown,
  calculateBranchDGaugeChange,
  calculateBranchDGaugeMinimumRequired,
  calculateBranchDamage,
  calculateBranchOpponentDGaugeChip,
  calculateBranchSaGaugeChange,
  calculateOdLevelConstraint,
  calculateOdLevelConstraintForVariant,
  calculateRequiredStartHitCondition,
} from './comboGaugeCalc';
import type {
  ComboBranchStats,
  MoveCategory,
  MoveDefinition,
  MoveHitStats,
  MoveNode,
  MoveStats,
  MoveStatsDatabase,
} from '../types';

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
    okizemeRating: null,
    difficultyRating: null,
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
    groundPlusFrame: '',
    airPlusFrame: '',
    cancelType: null,
    ...overrides,
  };
}

function makeStats(hits: MoveHitStats[], isMultiHit = false, sharesModifierAcrossHits = false): MoveStats {
  return { isMultiHit, hits, cancelableSuperArtNames: [], sharesModifierAcrossHits };
}

function makeMove(name: string, category: MoveCategory): MoveDefinition {
  return { id: name, name, category };
}

describe('calculateBranchSaGaugeChange', () => {
  it('root〜対象ノードの経路上にある各技のSAゲージ増減を合計する', () => {
    const c = makeNode('c', '強P');
    const b = makeNode('b', '中P', { children: [c] });
    const a = makeNode('a', '弱P', { children: [b] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱P': makeStats([makeHit({ saGaugeGain: 300 })]),
        '中P': makeStats([makeHit({ saGaugeGain: 500 })]),
        '強P': makeStats([makeHit({ saGaugeGain: 1000 })]),
      },
    };

    expect(calculateBranchSaGaugeChange('ryu', moveStatsDatabase, a, 'c')).toBe(1800);
    expect(calculateBranchSaGaugeChange('ryu', moveStatsDatabase, a, 'b')).toBe(800);
    expect(calculateBranchSaGaugeChange('ryu', moveStatsDatabase, a, 'a')).toBe(300);
  });

  it('末尾がSAだと、消費量として登録された負の値が効いて合計がマイナスに振れる', () => {
    const sa = makeNode('sa', 'コズミックレイ');
    const starter = makeNode('starter', '強P', { children: [sa] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ saGaugeGain: 1000 })]),
        'コズミックレイ': makeStats([makeHit({ saGaugeGain: -3000 })]),
      },
    };

    expect(calculateBranchSaGaugeChange('ingrid', moveStatsDatabase, starter, 'sa')).toBe(-2000);
  });

  it('複数ヒット技は全段ぶんのSAゲージ増減を合計する', () => {
    const node = makeNode('grow', '4中K->強P');

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '4中K->強P': makeStats(
          [makeHit({ saGaugeGain: 500 }), makeHit({ saGaugeGain: 1000 })],
          true,
        ),
      },
    };

    expect(calculateBranchSaGaugeChange('ingrid', moveStatsDatabase, node, 'grow')).toBe(1500);
  });

  it('技データが1件も登録されていない経路ではnullを返す', () => {
    const node = makeNode('a', '未登録の技');
    expect(calculateBranchSaGaugeChange('ingrid', {}, node, 'a')).toBeNull();
  });

  it('経路の一部だけ技データが無くても、登録済みの分だけで合計する', () => {
    const b = makeNode('b', '未登録の技');
    const a = makeNode('a', '弱P', { children: [b] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: { '弱P': makeStats([makeHit({ saGaugeGain: 300 })]) },
    };

    expect(calculateBranchSaGaugeChange('ryu', moveStatsDatabase, a, 'b')).toBe(300);
  });

  it('対象ノードが木の中に存在しなければnullを返す', () => {
    const a = makeNode('a', '弱P');
    expect(calculateBranchSaGaugeChange('ryu', {}, a, '存在しないid')).toBeNull();
  });
});

describe('calculateBranchOpponentDGaugeChip', () => {
  it('経路上のSAヒットのdGaugeChipPunishCounterを合計する。SA以外は寄与0', () => {
    const sa = makeNode('sa', 'コズミックレイ');
    const starter = makeNode('starter', '強P', { children: [sa] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeChipPunishCounter: 9999 })]),
        'コズミックレイ': makeStats([makeHit({ dGaugeChipPunishCounter: 2000 })]),
      },
    };
    const moveList = [makeMove('コズミックレイ', 'superArt')];

    expect(
      calculateBranchOpponentDGaugeChip('ingrid', moveStatsDatabase, moveList, starter, 'sa'),
    ).toBe(2000);
  });

  it('末端のbranchStats.isJustParryStartがtrueなら合計を半分にする', () => {
    const sa = makeNode('sa', 'コズミックレイ', {
      branchStats: makeBranchStats({ isJustParryStart: true }),
    });
    const starter = makeNode('starter', '強P', { children: [sa] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: { 'コズミックレイ': makeStats([makeHit({ dGaugeChipPunishCounter: 2000 })]) },
    };
    const moveList = [makeMove('コズミックレイ', 'superArt')];

    expect(
      calculateBranchOpponentDGaugeChip('ingrid', moveStatsDatabase, moveList, starter, 'sa'),
    ).toBe(1000);
  });

  it('技データが1件も登録されていない経路ではnullを返す', () => {
    const node = makeNode('a', '未登録の技');
    expect(calculateBranchOpponentDGaugeChip('ingrid', {}, [], node, 'a')).toBeNull();
  });
});

describe('calculateBranchDGaugeChange', () => {
  it('ラッシュを挟まない経路は各技のdGaugeGainを単純合計する', () => {
    const b = makeNode('b', '中P');
    const a = makeNode('a', '弱P', { children: [b] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱P': makeStats([makeHit({ dGaugeGain: 250 })]),
        '中P': makeStats([makeHit({ dGaugeGain: 1500 })]),
      },
    };

    expect(calculateBranchDGaugeChange('ryu', moveStatsDatabase, [], a, 'b')).toBe(1750);
  });

  it('キャンセルラッシュより後は、通常技のヒット回復が0になる', () => {
    const afterRush = makeNode('after', '中K');
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [afterRush] });
    const starter = makeNode('starter', '強P', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 3000 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: -2000 })]),
        '中K': makeStats([makeHit({ dGaugeGain: 2000 })]),
      },
    };

    // 3000(強P) + (-2000)(ラッシュ消費) + 0(ラッシュ後の中Kは回復しない) = 1000
    expect(calculateBranchDGaugeChange('ingrid', moveStatsDatabase, [], starter, 'after')).toBe(1000);
  });

  it('キャンセルラッシュ中に生ラッシュを挟んでも、生ラッシュ自身のコストは常に加算される（回帰）', () => {
    // 強P → キャンセルラッシュ → 中K(回復しない) → 生ラッシュ(コストは常に乗る) → 中P(回復しない)
    const afterSecondRush = makeNode('after2', '中P');
    const rawRush = makeNode('raw', '生ラッシュ', { children: [afterSecondRush] });
    const afterFirstRush = makeNode('after', '中K', { children: [rawRush] });
    const cancelRush = makeNode('rush', 'キャンセルラッシュ', { children: [afterFirstRush] });
    const starter = makeNode('starter', '強P', { children: [cancelRush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 3000 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: -2000 })]),
        '中K': makeStats([makeHit({ dGaugeGain: 2000 })]),
        '生ラッシュ': makeStats([makeHit({ dGaugeGain: -10000 })]),
        '中P': makeStats([makeHit({ dGaugeGain: 1500 })]),
      },
    };

    // 3000(強P) + (-2000)(キャンセルラッシュ消費) + 0(中Kは回復しない)
    // + (-10000)(生ラッシュのコストは常に乗る) + 0(生ラッシュ後もキャンセルラッシュ中なので中Pは回復しない) = -9000
    expect(calculateBranchDGaugeChange('ingrid', moveStatsDatabase, [], starter, 'after2')).toBe(-9000);
  });

  it('キャンセルラッシュ中でもSA技だけはdGaugeGainDuringRushの値を使う', () => {
    const sa = makeNode('sa', 'コズミックレイ');
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [sa] });
    const starter = makeNode('starter', '強P', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 3000 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: 0 })]),
        'コズミックレイ': makeStats([makeHit({ dGaugeGain: 20000, dGaugeGainDuringRush: 15000 })]),
      },
    };

    const moveList: MoveDefinition[] = [makeMove('コズミックレイ', 'superArt')];

    // 3000 + 0 + 15000(ラッシュ中のSA専用値) = 18000
    expect(calculateBranchDGaugeChange('ingrid', moveStatsDatabase, moveList, starter, 'sa')).toBe(18000);
  });

  it('dGaugeGainDuringRushが未入力のSA技は、ラッシュ中は0として扱う', () => {
    const sa = makeNode('sa', 'サンシャイン(Lv1)');
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [sa] });
    const starter = makeNode('starter', '強P', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 3000 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: 0 })]),
        'サンシャイン(Lv1)': makeStats([makeHit({ dGaugeGain: 5000 })]),
      },
    };

    const moveList: MoveDefinition[] = [makeMove('サンシャイン(Lv1)', 'superArt')];

    expect(calculateBranchDGaugeChange('ingrid', moveStatsDatabase, moveList, starter, 'sa')).toBe(3000);
  });

  it('キャンセルラッシュ中でも「歩き」ノードは例外的に回復できる（実機確認済み。歩き以外の通常技は0のまま）', () => {
    const walk = makeNode('walk', '前歩き(10F~20F)');
    const normalAfterRush = makeNode('normal', '中P', { children: [walk] });
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [normalAfterRush] });
    const starter = makeNode('starter', '強P', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '強P': makeStats([makeHit({ dGaugeGain: 3000 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: -2000 })]),
        '中P': makeStats([makeHit({ dGaugeGain: 1500 })]),
        '前歩き(10F~20F)': makeStats([makeHit({ dGaugeGain: 800 })]),
      },
    };

    // 強P:3000 + キャンセルラッシュ:-2000 + 中P(ラッシュ中の通常技なので0) +
    // 前歩き(ラッシュ中でも例外的に回復):800 = 1800
    expect(calculateBranchDGaugeChange('ryu', moveStatsDatabase, [], starter, 'walk')).toBe(1800);
  });

  it('ガード属性のノードは、ガード回復量が未実装のため寄与0になる', () => {
    const guarded = makeNode('guarded', '中P', { attributes: [{ type: 'guard' }] });
    const a = makeNode('a', '弱P', { children: [guarded] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱P': makeStats([makeHit({ dGaugeGain: 250 })]),
        '中P': makeStats([makeHit({ dGaugeGain: 1500 })]),
      },
    };

    expect(calculateBranchDGaugeChange('ryu', moveStatsDatabase, [], a, 'guarded')).toBe(250);
  });

  it('空振り属性のノードは寄与0になる', () => {
    const whiffed = makeNode('whiffed', '中P', { attributes: [{ type: 'whiff' }] });
    const a = makeNode('a', '弱P', { children: [whiffed] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱P': makeStats([makeHit({ dGaugeGain: 250 })]),
        '中P': makeStats([makeHit({ dGaugeGain: 1500 })]),
      },
    };

    expect(calculateBranchDGaugeChange('ryu', moveStatsDatabase, [], a, 'whiffed')).toBe(250);
  });

  it('技データが1件も登録されていない経路ではnullを返す', () => {
    const node = makeNode('a', '未登録の技');
    expect(calculateBranchDGaugeChange('ingrid', {}, [], node, 'a')).toBeNull();
  });

  it('最初のゲージ消費(キャンセルラッシュ)より前の回復も除外せず合計に含める（2026-08-26〜: 除外トグルは廃止、常に合計に含める）', () => {
    const afterRush = makeNode('after', '中K');
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [afterRush] });
    const starter = makeNode('starter', '強P', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 3000 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: -2000 })]),
        '中K': makeStats([makeHit({ dGaugeGain: 2000 })]),
      },
    };

    // 強P(3000) + キャンセルラッシュ(-2000) + 0(ラッシュ後の中Kは回復しない) = 1000
    expect(calculateBranchDGaugeChange('ingrid', moveStatsDatabase, [], starter, 'after')).toBe(1000);
  });

  it('usesODが付いたノードより前の回復も除外せず合計に含める', () => {
    const beam = makeNode('beam', '強サンフレア(ビーム|Lv. 2)', { usesOD: true });
    const starter = makeNode('starter', '強P', { children: [beam] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 3000 })]),
        '強サンフレア(ODビーム|Lv. 2)': makeStats([makeHit({ dGaugeGain: -20000 })]),
      },
    };

    expect(calculateBranchDGaugeChange('ingrid', moveStatsDatabase, [], starter, 'beam')).toBe(-17000);
  });
});

describe('calculateBranchDGaugeBreakdown', () => {
  it('1ノードずつの増減と、その合計(calculateBranchDGaugeChangeと一致)を返す。最初のゲージ消費(キャンセルラッシュ)より前のステップにはisEarlyRecovery:trueが付く', () => {
    const afterRush = makeNode('after', '中K');
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [afterRush] });
    const starter = makeNode('starter', '強P', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 3000 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: -2000 })]),
        '中K': makeStats([makeHit({ dGaugeGain: 2000 })]),
      },
    };

    const breakdown = calculateBranchDGaugeBreakdown('ingrid', moveStatsDatabase, [], starter, 'after');

    // 強P(+3000、キャンセルラッシュより前なのでisEarlyRecovery) → キャンセルラッシュ(-2000) → 中K(ラッシュ後は回復0)
    expect(breakdown?.steps.map(({ label, value, isEarlyRecovery }) => ({
      label,
      value,
      isEarlyRecovery,
    }))).toEqual([
      { label: '強P', value: 3000, isEarlyRecovery: true },
      { label: 'キャンセルラッシュ', value: -2000, isEarlyRecovery: undefined },
      { label: '中K', value: 0, isEarlyRecovery: undefined },
    ]);
    expect(breakdown?.total).toBe(1000);
    expect(breakdown?.total).toBe(
      calculateBranchDGaugeChange('ingrid', moveStatsDatabase, [], starter, 'after'),
    );
  });

  it('totalExcludingEarlyRecoveryは、最初のゲージ消費より前の回復ぶんを除いた参考値になる（合計欄の括弧書き用）', () => {
    const afterRush = makeNode('after', '中K');
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [afterRush] });
    const starter = makeNode('starter', '強P', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 2000 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: -27500 })]),
        '中K': makeStats([makeHit({ dGaugeGain: 2000 })]),
      },
    };

    const breakdown = calculateBranchDGaugeBreakdown('ingrid', moveStatsDatabase, [], starter, 'after');

    // total = 2000(強P) + -27500(キャンセルラッシュ) + 0(ラッシュ後の中Kは回復しない) = -25500
    // totalExcludingEarlyRecovery = 強P(早期回復ぶん)を除いた -27500 + 0 = -27500
    expect(breakdown?.total).toBe(-25500);
    expect(breakdown?.totalExcludingEarlyRecovery).toBe(-27500);
  });

  it('経路上に消費技（キャンセルラッシュ/生ラッシュ/OD)が無ければ、totalExcludingEarlyRecoveryはtotalと一致する（呼び出し側は括弧書きを表示しない）', () => {
    const b = makeNode('b', '中P');
    const a = makeNode('a', '弱P', { children: [b] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱P': makeStats([makeHit({ dGaugeGain: 250 })]),
        '中P': makeStats([makeHit({ dGaugeGain: 1500 })]),
      },
    };

    const breakdown = calculateBranchDGaugeBreakdown('ryu', moveStatsDatabase, [], a, 'b');
    expect(breakdown?.total).toBe(1750);
    expect(breakdown?.totalExcludingEarlyRecovery).toBe(1750);
  });

  it('技データが1件も登録されていない経路ではnullを返す', () => {
    const node = makeNode('a', '未登録の技');
    expect(calculateBranchDGaugeBreakdown('ingrid', {}, [], node, 'a')).toBeNull();
  });
});

describe('calculateBranchDGaugeMinimumRequired', () => {
  it('経路上に消費行動（キャンセルラッシュ/生ラッシュ/OD）が無ければ0を返す', () => {
    const b = makeNode('b', '中P');
    const a = makeNode('a', '弱P', { children: [b] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱P': makeStats([makeHit({ dGaugeGain: 250 })]),
        '中P': makeStats([makeHit({ dGaugeGain: 1500 })]),
      },
    };

    expect(calculateBranchDGaugeMinimumRequired('ryu', moveStatsDatabase, [], a, 'b')).toBe(0);
  });

  it('消費行動の間に十分な回復があれば、名目コストの合計より遥かに少ないゲージ(=1)で足りる（消費は0にfloorされ、実際には満額を持っている必要が無いため）', () => {
    // 強P(回復) -> 生ラッシュ(消費30000) -> 中K(回復10000) -> 生ラッシュ(消費30000) -> 中P(回復40000) -> 生ラッシュ(消費30000)
    // 生ラッシュはキャンセルラッシュと違い「以降の通常技の回復を0にする」抑制を掛けないため、
    // 間の中K・中Pの回復がそのまま効く（inRushの複雑さを避けたテスト構成）
    const rush3 = makeNode('rush3', '生ラッシュ');
    const afterRush2 = makeNode('afterRush2', '中P', { children: [rush3] });
    const rush2 = makeNode('rush2', '生ラッシュ', { children: [afterRush2] });
    const afterRush1 = makeNode('afterRush1', '中K', { children: [rush2] });
    const rush1 = makeNode('rush1', '生ラッシュ', { children: [afterRush1] });
    const starter = makeNode('starter', '強P', { children: [rush1] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 1000 })]),
        '生ラッシュ': makeStats([makeHit({ dGaugeGain: -30000 })]),
        '中K': makeStats([makeHit({ dGaugeGain: 10000 })]),
        '中P': makeStats([makeHit({ dGaugeGain: 40000 })]),
      },
    };

    expect(
      calculateBranchDGaugeMinimumRequired('ingrid', moveStatsDatabase, [], starter, 'rush3'),
    ).toBe(1);
  });

  it('消費行動が回復を挟まず連続すると、1つ目を「払い切って余りを残す」必要があるため名目コストを超える量が必要になる', () => {
    // キャンセルラッシュ(消費30000) -> 生ラッシュ(消費30000)、間に回復なし
    const rawRush = makeNode('rawRush', '生ラッシュ');
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [rawRush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: -30000 })]),
        '生ラッシュ': makeStats([makeHit({ dGaugeGain: -30000 })]),
      },
    };

    // 1つ目のキャンセルラッシュ消費後に1でも残す必要があるため、30000ちょうどでは足りず30001必要
    expect(
      calculateBranchDGaugeMinimumRequired('ingrid', moveStatsDatabase, [], rush, 'rawRush'),
    ).toBe(30001);
  });

  it('技データが1件も登録されていない経路ではnullを返す', () => {
    const node = makeNode('a', '未登録の技');
    expect(calculateBranchDGaugeMinimumRequired('ingrid', {}, [], node, 'a')).toBeNull();
  });
});

describe('calculateBranchDamage', () => {
  it('実機確認済みの例を再現する: 始動補正20%の技→キャンセルラッシュ→無地の技 で3発目が68%換算になる', () => {
    const hitK = makeNode('hitK', '強K', { branchStats: makeBranchStats() });
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [hitK] });
    const starter = makeNode('starter', '2中K', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '2中K': makeStats([makeHit({ damage: 1000, modifier: '始動補正20%' })]),
        'キャンセルラッシュ': makeStats([makeHit({ damage: 0 })]),
        '強K': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // 2中K: 始動補正は自分自身には効かないため100%のまま → 1000
    // キャンセルラッシュ: システム動作なのでダメージ0
    // 強K: 2中Kの始動補正20%ぶん前倒しで進んだ段(80%)にラッシュ0.85倍 → 1000*0.68=680
    // 合計: 1000+0+680=1680
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, [], starter, 'hitK')).toBe(1680);
  });

  it('ジャストパリィ始動(常にパニカン扱い)の実機確認済みの例を再現する: 弱P(60%)→弱K(始動補正20%を直接引いて40%)→中サンライズ(自然減衰半分で35%)', () => {
    const naka = makeNode('naka', '中サンライズ', { branchStats: makeBranchStats({ isJustParryStart: true }) });
    const weakK = makeNode('weakK', '弱K', { children: [naka] });
    const starter = makeNode('starter', '弱P', { children: [weakK] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '弱P': makeStats([makeHit({ damage: 300, modifier: '始動補正20%' })]),
        '弱K': makeStats([makeHit({ damage: 300, modifier: '始動補正20%' })]),
        '中サンライズ': makeStats([makeHit({ damage: 1200, modifier: 'コンボ補正20%' })]),
      },
    };

    // 1発目 弱P: startBase60% → 300*60%=180
    // 2発目 弱K: 弱Pの始動補正20%を直接引いて60-20=40% → 300*40%=120
    //   （弱K自身の始動補正20%は起点でないノードには効かないため、次には反映されない）
    // 3発目 中サンライズ: 技固有の補正が無い自然減衰。本来のテーブル通りなら40→30だが、
    //   ジャストパリィ始動は自然減衰が半分になるため40→35 → 1200*35%=420
    // 合計: 180+120+420=720
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, [], starter, 'naka')).toBe(720);
  });

  it('ターゲットコンボ(1ノードに複数ヒット)は、その段数ぶん標準テーブルの位置を消費する', () => {
    // a→aターゲットコンボ(2発分)の後に無地の技を続けると、その技は3発目のテーブル値(80%)になる
    const after = makeNode('after', '中P');
    const targetCombo = makeNode('tc', '中P→中K', { children: [after] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '中P→中K': makeStats(
          [makeHit({ damage: 500, modifier: '' }), makeHit({ damage: 500, modifier: '' })],
          true,
        ),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // 1発目:500*1.0 + 2発目:500*1.0(テーブル2発目=100%) + 3発目:1000*0.8(テーブル3発目=80%) = 500+500+800=1800
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], targetCombo, 'after')).toBe(1800);
  });

  it('sharesModifierAcrossHitsが立った複数ヒット技(強Kの1・2段目等)は、段ごとに補正を分けず同じ%を使う', () => {
    // ターゲットコンボ(中P→中K)とは違い、同じ技(強K)が2回ヒットしているだけなので、
    // 1段目・2段目は同じ%になり、次の技は「強Kぶんで1段だけ」前倒しされる
    const after = makeNode('after', '中P');
    const strongK = makeNode('sk', '強K', { children: [after] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '強K': makeStats(
          [makeHit({ damage: 500 }), makeHit({ damage: 400 })],
          true,
          true, // sharesModifierAcrossHits
        ),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // 1発目:500*1.0(起点=100%、テーブル1段目) + 2発目:400*1.0(強Kぶんで消費するのは1段だけなので
    // 1発目と同じ100%、テーブル2段目もまだ100%) + 3発目:1000*1.0(強Kが1段しか消費していないため
    // まだテーブル2段目=100%のまま) = 500+400+1000=1900
    // （sharesModifierAcrossHitsが無い場合は3発目が80%まで落ちてしまい、合計が1700と低く出る。
    // 次のテストで回帰確認）
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], strongK, 'after')).toBe(1900);
  });

  it('sharesModifierAcrossHitsが立っていない複数ヒット技は、従来通り段ごとに個別消費する（回帰確認）', () => {
    const after = makeNode('after', '中P');
    const strongK = makeNode('sk', '強K', { children: [after] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '強K': makeStats([makeHit({ damage: 500 }), makeHit({ damage: 400 })], true),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // 1発目:500*1.0 + 2発目:400*1.0(2発目のテーブル100%) + 3発目:1000*0.8(3発目のテーブル80%) = 500+400+800=1700
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], strongK, 'after')).toBe(1700);
  });

  it('SAの自然計算値が保証を下回った時だけ、minDamageGuaranteePercentまで引き上げる', () => {
    const sa = makeNode('sa', 'コズミックレイ');
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [sa] });
    // 中Kに乗算補正80%を付けて、コズミックレイに入る時点の自然計算値を保証(50%)より
    // 低く(16%→ラッシュ0.85倍で13%)しておく。この場合だけ保証値50%が採用される
    const midHit = makeNode('mid', '中K', { children: [rush] });
    const starter = makeNode('starter', '強P', { children: [midHit] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ damage: 900 })]),
        '中K': makeStats([makeHit({ damage: 700, modifier: '乗算補正80%' })]),
        'キャンセルラッシュ': makeStats([makeHit({ damage: 0 })]),
        'コズミックレイ': makeStats([
          makeHit({ damage: 4000, minDamageGuaranteePercent: 50 }),
        ]),
      },
    };
    const moveList: MoveDefinition[] = [makeMove('コズミックレイ', 'superArt')];

    // 強P:900(100%) + 中K:700(100%、乗算補正は自分には効かない) + キャンセルラッシュ:0 +
    // コズミックレイ: 自然計算13%は保証50%を下回るため50%採用 → 4000*0.5=2000
    // 合計: 900+700+0+2000=3600
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, moveList, starter, 'sa')).toBe(3600);
  });

  it('末端ノードがfinishingSpecialVariantを持つ場合、moveNameはそのまま(例:SA1)で技データは`moveName(variant)`のキーを参照する', () => {
    const sa = makeNode('sa', 'SA1', {
      branchStats: makeBranchStats({ finishingSpecialVariant: 'Lv. 1' }),
    });
    const starter = makeNode('starter', '強P', { children: [sa] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ damage: 900 })]),
        // ノードのmoveNameは"SA1"のままだが、実際に参照されるべきキーは"SA1(Lv. 1)"
        'SA1(Lv. 1)': makeStats([makeHit({ damage: 4000, minDamageGuaranteePercent: 50 })]),
      },
    };
    const moveList: MoveDefinition[] = [makeMove('SA1', 'superArt')];

    // 強P: 100%(起点) → 900、SA1: 自然計算100%は保証50%を上回るため自然計算を採用
    // (isSuperArt判定もmoveName"SA1"のまま正しく検出) → 4000*100%=4000
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, moveList, starter, 'sa')).toBe(4900);
  });

  it('末端ノード以外(経路の途中)ではfinishingSpecialVariantを参照しない(末端固有の仕様のため)', () => {
    const after = makeNode('after', '中K');
    const sa = makeNode('sa', 'SA1', {
      children: [after],
      branchStats: makeBranchStats({ finishingSpecialVariant: 'Lv. 1' }),
    });
    const starter = makeNode('starter', '強P', { children: [sa] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ damage: 900 })]),
        'SA1(Lv. 1)': makeStats([makeHit({ damage: 4000 })]),
        '中K': makeStats([makeHit({ damage: 700 })]),
      },
    };

    // SA1ノード自体は経路の途中(末端はafter)なので、branchStats.finishingSpecialVariantが
    // 付いていても無視され、素の"SA1"キーで探す(データが無いので技データ未登録扱いになる)
    // 強P:900(100%) → SA1:技データ未登録なのでdamage0(位置だけ消費、3発目相当) →
    // 中K:700*80%=560 (合計1460)
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, [], starter, 'after')).toBe(1460);
  });

  it('SAのmoveNameが既に特殊性能込み(例:SA2(SA2|Lv. 1))で確定していても、isSuperArt判定を正しく検出する(baseMoveNameの効果)', () => {
    const sa = makeNode('sa', 'SA2(SA2|Lv. 1)');
    const starter = makeNode('starter', '強P', { children: [sa] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ damage: 900 })]),
        'SA2(SA2|Lv. 1)': makeStats([
          makeHit({ damage: 4000, minDamageGuaranteePercent: 50 }),
        ]),
      },
    };
    const moveList: MoveDefinition[] = [makeMove('SA2', 'superArt')];

    // moveNameが"SA2(SA2|Lv. 1)"でも、括弧より前の"SA2"でMoveDefinitionと照合できるため
    // isSuperArt(=SA用の下限ロジック対象)として正しく検出される(以前はここが素の名前と
    // 完全一致しないと判定できなかった)。自然計算100%は保証50%を上回るため自然計算を採用
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, moveList, starter, 'sa')).toBe(4900);
  });

  it('カウンター始動は末端ノードのbranchStatsから基準値120%を採用する', () => {
    const starter = makeNode('starter', '強P', {
      branchStats: makeBranchStats({ startHitCondition: 'カウンター' }),
    });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: { '強P': makeStats([makeHit({ damage: 1000 })]) },
    };

    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], starter, 'starter')).toBe(1200);
  });

  it('経路上のノードにカウンター属性が付いているだけで、末端のstartHitCondition未入力でも120%を採用する', () => {
    const leaf = makeNode('leaf', 'ビームLv.0', {
      attributes: [{ type: 'counter' }],
      branchStats: makeBranchStats(), // startHitConditionは未入力(null)のまま
    });
    const starter = makeNode('starter', '2中K', { children: [leaf] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '2中K': makeStats([makeHit({ damage: 1000 })]),
        'ビームLv.0': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    expect(calculateBranchDamage('ingrid', moveStatsDatabase, [], starter, 'leaf')).toBe(2200);
  });

  it('経路上のパニッシュカウンター属性の方が末端の手動入力(カウンター)より厳しい場合はパニッシュカウンター側を優先する', () => {
    const leaf = makeNode('leaf', 'ビームLv.0', {
      attributes: [{ type: 'punishCounter' }],
      branchStats: makeBranchStats({ startHitCondition: 'カウンター' }),
    });
    const starter = makeNode('starter', '2中K', { children: [leaf] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: { '2中K': makeStats([makeHit({ damage: 1000 })]) },
    };

    // 通常のジャストパリィ無しでは120%までしか上がらないが、パニカン優先の分岐(50%)は
    // ジャストパリィ始動時のみなのでここでは120%になることだけ確認する
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, [], starter, 'leaf')).toBe(1200);
  });

  it('空振り・ガード属性のノードはダメージ0で、後続ヒットの位置もずらさない', () => {
    const after = makeNode('after', '中P');
    const guarded = makeNode('guarded', '弱P', { attributes: [{ type: 'guard' }], children: [after] });
    const starter = makeNode('starter', '強P', { children: [guarded] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '強P': makeStats([makeHit({ damage: 1000 })]),
        '弱P': makeStats([makeHit({ damage: 300 })]),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // ガードされた弱Pは寄与0・位置も消費しないため、中Pは(強Pの次)=2発目扱い(100%)になる
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], starter, 'after')).toBe(2000);
  });

  it('ラッシュ以外でも技データにdamage:0と明示登録されている行動(チャージ等)は標準テーブルの段を進めない', () => {
    const after = makeNode('after', '中K');
    const charge = makeNode('charge', 'チャージ', { children: [after] });
    const starter = makeNode('starter', '強P', { children: [charge] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ damage: 1000 })]),
        'チャージ': makeStats([makeHit({ damage: 0 })]),
        '中K': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // チャージは段を進めないため、中Kは(強Pの次)=2発目扱い(100%)のまま
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, [], starter, 'after')).toBe(2000);
  });

  it('技データ未登録のノードは(damageが不明なだけで実際にはヒットしているはずなので)従来通り段を進める', () => {
    const after = makeNode('after', '中K');
    const unregistered = makeNode('unregistered', '未登録の技', { children: [after] });
    const starter = makeNode('starter', '強P', { children: [unregistered] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ damage: 1000 })]),
        '中K': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // 未登録技は段を進めるため、中Kは3発目扱い(80%)になる
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, [], starter, 'after')).toBe(1800);
  });

  it('生ラッシュもキャンセルラッシュと同じく以降のヒットに0.85倍が発生する（Dゲージとは違う扱い）', () => {
    const after = makeNode('after', '中K');
    const rush = makeNode('rush', '生ラッシュ', { children: [after] });
    const starter = makeNode('starter', '強P', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '強P': makeStats([makeHit({ damage: 1000 })]),
        '生ラッシュ': makeStats([makeHit({ damage: 0 })]),
        '中K': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // 強P: 始動補正が無いので自然に1段だけ進む(テーブルの最初の2段はどちらも100%のため据え置き)
    // 生ラッシュ: システム動作なので段を進めずダメージ0
    // 中K: 強Pの次の自然な段(100%、まだ2発しか実質進んでいないため)にラッシュ0.85倍 → 1000*0.85=850
    // 合計: 1000+0+850=1850
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], starter, 'after')).toBe(1850);
  });

  it('始動技自体がラッシュ攻撃の場合は0.85倍が発生しない', () => {
    const after = makeNode('after', '中K');
    const starter = makeNode('starter', 'キャンセルラッシュ', { children: [after] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        'キャンセルラッシュ': makeStats([makeHit({ damage: 0 })]),
        '中K': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // ラッシュが始動技なので0.85倍は発生せず、中Kは標準テーブルの2発目(100%)のまま
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], starter, 'after')).toBe(1000);
  });

  it('技データが1件も登録されていない経路ではnullを返す', () => {
    const node = makeNode('a', '未登録の技');
    expect(calculateBranchDamage('ryu', {}, [], node, 'a')).toBeNull();
  });
});

describe('startingMoveOptions（複数の始動技から同じ続きに繋がる「汎用コンボ」）', () => {
  it('rootがstartingMoveOptionsを持ち、末端のstartingMoveNamesが未選択の間はnullを返す（自動計算を空欄のままにする）', () => {
    const leaf = makeNode('leaf', '中P', { branchStats: makeBranchStats() }); // startingMoveNames未選択
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [leaf],
    });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱P': makeStats([makeHit({ damage: 300 })]),
        '弱K': makeStats([makeHit({ damage: 350 })]),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], genericRoot, 'leaf')).toBeNull();
  });

  it('末端でstartingMoveNamesを選ぶと、rootをその技として扱ってダメージ計算に含める', () => {
    const leaf = makeNode('leaf', '中P', { branchStats: makeBranchStats({ startingMoveNames: ['弱K'] }) });
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['弱K']],
      children: [leaf],
    });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱P': makeStats([makeHit({ damage: 300 })]),
        '弱K': makeStats([makeHit({ damage: 350 })]),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // 弱K(350, 起点なので100%) + 中P(1000, テーブル2段目もまだ100%) = 350+1000=1350
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], genericRoot, 'leaf')).toBe(1350);
  });

  it('startingMoveOptionsが無い通常のrootは、startingMoveNamesが未設定でも従来通りroot自身の技で計算する', () => {
    const leaf = makeNode('leaf', '中P', { branchStats: makeBranchStats() });
    const starter = makeNode('starter', '弱K', { children: [leaf] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱K': makeStats([makeHit({ damage: 350 })]),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // 汎用コンボ経由(前のテスト)と全く同じ経路・同じ技構成なので、同じ1350になる
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], starter, 'leaf')).toBe(1350);
  });

  it('候補が複数技の並び（ジャンプ攻撃始動: J強K→強P→汎用の続き）の場合、両方をrootの位置に順番に差し込んで計算する', () => {
    const leaf = makeNode('leaf', '中P', {
      branchStats: makeBranchStats({ startingMoveNames: ['J強K', '強P'] }),
    });
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['弱P'], ['J強K', '強P']],
      children: [leaf],
    });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        'J強K': makeStats([makeHit({ damage: 400 })]),
        '強P': makeStats([makeHit({ damage: 600 })]),
        '中P': makeStats([makeHit({ damage: 1000 })]),
      },
    };

    // J強K(400, 起点=100%) + 強P(600, テーブル2段目=100%) + 中P(1000, テーブル3段目=80%)
    // = 400+600+800=1800
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], genericRoot, 'leaf')).toBe(1800);
  });

  it('候補の技名に括弧で条件（例:「強昇竜拳（C）」）が付いていれば、その条件がダメージ計算・始動条件判定に反映される', () => {
    const leaf = makeNode('leaf', '中P', {
      branchStats: makeBranchStats({ startingMoveNames: ['強昇竜拳（C）'] }),
    });
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['強昇竜拳（C）']],
      children: [leaf],
    });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '強昇竜拳': makeStats([makeHit({ damage: 1000 })]),
        '中P': makeStats([makeHit({ damage: 500 })]),
      },
    };

    // カウンター始動として自動判定される（手動でstartHitConditionを設定しなくてもよい）
    expect(calculateRequiredStartHitCondition(genericRoot, 'leaf')).toBe('カウンター');
    // 強昇竜拳(1000, カウンター始動=120%) + 中P(500, テーブル2段目=100%) = 1200+500=1700
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], genericRoot, 'leaf')).toBe(1700);
  });

  it('技名を伴わない条件だけの候補（例:「PC」）は、技を問わず「パニッシュカウンターなら繋がる」を表現し、その分のダメージは0扱いになる', () => {
    const leaf = makeNode('leaf', '中P', {
      branchStats: makeBranchStats({ startingMoveNames: ['PC'] }),
    });
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['PC']],
      children: [leaf],
    });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '中P': makeStats([makeHit({ damage: 500 })]),
      },
    };

    expect(calculateRequiredStartHitCondition(genericRoot, 'leaf')).toBe('パニカン');
    // 始動技自体は技データが特定できないためダメージ0（位置だけ消費）。中Pはパニカン始動の
    // 120%が1発目に一回限りで乗る仕様のため、2発目である中Pには影響せず100%のまま = 500
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], genericRoot, 'leaf')).toBe(500);
  });

  it('条件付きの技を経由する並び（例:「強K（PC）→強P」）も、1段目の条件を反映しつつ2段目以降を続けて計算する', () => {
    const leaf = makeNode('leaf', '中P', {
      branchStats: makeBranchStats({ startingMoveNames: ['強K（PC）', '強P'] }),
    });
    const genericRoot = makeNode('root', '中攻撃', {
      startingMoveOptions: [['強K（PC）', '強P']],
      children: [leaf],
    });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '強K': makeStats([makeHit({ damage: 800 })]),
        '強P': makeStats([makeHit({ damage: 600 })]),
        '中P': makeStats([makeHit({ damage: 500 })]),
      },
    };

    expect(calculateRequiredStartHitCondition(genericRoot, 'leaf')).toBe('パニカン');
    // 強K(800, パニカン始動=120%) + 強P(600, テーブル2段目=100%) + 中P(500, テーブル3段目=80%)
    // = 960+600+400=1960
    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], genericRoot, 'leaf')).toBe(1960);
  });
});

describe('finishingSuperArtName（末端の直後、木にノードを追加せずSAで締める）', () => {
  it('末端ノードがfinishingSuperArtNameを持つ場合、ダメージ計算にそのSAぶんが合成される', () => {
    const after = makeNode('after', '強P', {
      branchStats: makeBranchStats({ finishingSuperArtName: 'SA3' }),
    });
    const starter = makeNode('starter', '中K', { children: [after] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '中K': makeStats([makeHit({ damage: 500 })]),
        '強P': makeStats([makeHit({ damage: 700 })]),
        SA3: makeStats([makeHit({ damage: 4000, minDamageGuaranteePercent: 50 })]),
      },
    };
    const moveList: MoveDefinition[] = [makeMove('SA3', 'superArt')];

    // 中K:500(100%) + 強P:700(2発目=100%) + SA3:3発目=80%、自然計算80%は保証50%を上回るため
    // そのまま採用 → 4000*0.8=3200 → 合計 500+700+3200=4400
    expect(calculateBranchDamage('ryu', moveStatsDatabase, moveList, starter, 'after')).toBe(4400);
  });

  it('finishingSuperArtNameが未設定(null)なら、これまで通り末端ノードだけで計算する', () => {
    const after = makeNode('after', '強P', { branchStats: makeBranchStats() });
    const starter = makeNode('starter', '中K', { children: [after] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '中K': makeStats([makeHit({ damage: 500 })]),
        '強P': makeStats([makeHit({ damage: 700 })]),
        SA3: makeStats([makeHit({ damage: 4000 })]),
      },
    };
    const moveList: MoveDefinition[] = [makeMove('SA3', 'superArt')];

    expect(calculateBranchDamage('ryu', moveStatsDatabase, moveList, starter, 'after')).toBe(1200);
  });

  it('SAゲージ計算にも合成したSAの消費量(負の値)が反映される', () => {
    const after = makeNode('after', '強P', {
      branchStats: makeBranchStats({ finishingSuperArtName: 'SA3' }),
    });
    const starter = makeNode('starter', '中K', { children: [after] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '中K': makeStats([makeHit({ saGaugeGain: 200 })]),
        '強P': makeStats([makeHit({ saGaugeGain: 300 })]),
        SA3: makeStats([makeHit({ saGaugeGain: -6000 })]),
      },
    };

    expect(calculateBranchSaGaugeChange('ryu', moveStatsDatabase, starter, 'after')).toBe(-5500);
  });

  it('Dゲージ計算は、木にノードを追加していない合成後のSAまで含めて経路全体を合計する', () => {
    const after = makeNode('after', '強P', {
      branchStats: makeBranchStats({ finishingSuperArtName: 'SA3' }),
    });
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [after] });
    const starter = makeNode('starter', '中K', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '中K': makeStats([makeHit({ dGaugeGain: 999 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: -3000 })]),
        '強P': makeStats([makeHit({ dGaugeGain: 500 })]), // ラッシュ中の通常技は回復0
        SA3: makeStats([makeHit({ dGaugeGain: 100, dGaugeGainDuringRush: 400 })]),
      },
    };
    const moveList: MoveDefinition[] = [makeMove('SA3', 'superArt')];

    // 中K:999 + キャンセルラッシュ:-3000 + 強P:0(ラッシュ中の通常技) + SA3:400(dGaugeGainDuringRush)
    expect(calculateBranchDGaugeChange('ryu', moveStatsDatabase, moveList, starter, 'after')).toBe(-1601);
  });

  it('合成したSAの技データが未登録でも、他のノードの合計は保たれる', () => {
    const after = makeNode('after', '強P', {
      branchStats: makeBranchStats({ finishingSuperArtName: '未登録SA' }),
    });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '強P': makeStats([makeHit({ damage: 700 })]),
      },
    };

    expect(calculateBranchDamage('ryu', moveStatsDatabase, [], after, 'after')).toBe(700);
  });
});

describe('calculateRequiredStartHitCondition', () => {
  it('経路上のどのノードにもカウンター/パニカン属性が無ければnullを返す', () => {
    const leaf = makeNode('leaf', '中P');
    const starter = makeNode('starter', '2中K', { children: [leaf] });
    expect(calculateRequiredStartHitCondition(starter, 'leaf')).toBeNull();
  });

  it('経路上のノードにカウンター属性が付いていれば「カウンター」を返す', () => {
    const leaf = makeNode('leaf', 'ビームLv.0', { attributes: [{ type: 'counter' }] });
    const starter = makeNode('starter', '2中K', { children: [leaf] });
    expect(calculateRequiredStartHitCondition(starter, 'leaf')).toBe('カウンター');
  });

  it('経路上のノードにパニッシュカウンター属性が付いていれば「パニカン」を返す', () => {
    const leaf = makeNode('leaf', 'ビームLv.0', { attributes: [{ type: 'punishCounter' }] });
    const starter = makeNode('starter', '2中K', { children: [leaf] });
    expect(calculateRequiredStartHitCondition(starter, 'leaf')).toBe('パニカン');
  });

  it('カウンターとパニッシュカウンターが経路上の別ノードに混在していれば、厳しい方(パニカン)を返す', () => {
    const mid = makeNode('mid', 'ビームLv.0', { attributes: [{ type: 'counter' }] });
    const leaf = makeNode('leaf', 'SA3', { attributes: [{ type: 'punishCounter' }] });
    mid.children = [leaf];
    const starter = makeNode('starter', '2中K', { children: [mid] });
    expect(calculateRequiredStartHitCondition(starter, 'leaf')).toBe('パニカン');
  });

  it('始動技(root)自身にパニッシュカウンター属性が付いていれば「パニカン」を返す(「〜のパニカン始動」コンボ)', () => {
    const leaf = makeNode('leaf', '中P');
    const starter = makeNode('starter', '2中K', {
      children: [leaf],
      attributes: [{ type: 'punishCounter' }],
    });
    expect(calculateRequiredStartHitCondition(starter, 'leaf')).toBe('パニカン');
    // 始動技自身に対して聞いても同じ結果になる
    expect(calculateRequiredStartHitCondition(starter, 'starter')).toBe('パニカン');
  });

  it('対象ノードが木の中に存在しなければnullを返す', () => {
    const starter = makeNode('starter', '2中K');
    expect(calculateRequiredStartHitCondition(starter, '存在しないID')).toBeNull();
  });
});

const BEAM_MOVE_LIST: MoveDefinition[] = [
  {
    id: 'beam',
    name: 'サンフレア',
    category: 'special',
    hasSpecialVariant: true,
    specialVariantsByStrength: {
      中: ['ビーム|Lv. 0'],
      強: ['ビーム|Lv. 1', 'ビーム|Lv. 2', 'ビーム|Lv. 3'],
    },
  },
];

describe('calculateOdLevelConstraint', () => {
  it('最小Lv.は通常版のみ選べる(normalOnly)', () => {
    const node = makeNode('n', '中サンフレア(ビーム|Lv. 0)');
    expect(calculateOdLevelConstraint(node, BEAM_MOVE_LIST)).toBe('normalOnly');
  });

  it('最大Lv.はOD版のみ選べる(odOnly)', () => {
    const node = makeNode('n', '強サンフレア(ビーム|Lv. 3)');
    expect(calculateOdLevelConstraint(node, BEAM_MOVE_LIST)).toBe('odOnly');
  });

  it('中間のLv.は通常/OD版どちらも選べる(either)', () => {
    expect(calculateOdLevelConstraint(makeNode('n1', '強サンフレア(ビーム|Lv. 1)'), BEAM_MOVE_LIST)).toBe(
      'either',
    );
    expect(calculateOdLevelConstraint(makeNode('n2', '強サンフレア(ビーム|Lv. 2)'), BEAM_MOVE_LIST)).toBe(
      'either',
    );
  });

  it('Lv.を含まない技名は対象外(null)', () => {
    const node = makeNode('n', '強P');
    expect(calculateOdLevelConstraint(node, BEAM_MOVE_LIST)).toBeNull();
  });

  it('moveListに対応する技が見つからなければnull', () => {
    const node = makeNode('n', '未知の技(ビーム|Lv. 1)');
    expect(calculateOdLevelConstraint(node, BEAM_MOVE_LIST)).toBeNull();
  });
});

describe('calculateOdLevelConstraintForVariant', () => {
  const move = BEAM_MOVE_LIST[0];

  it('最小Lv.はnormalOnly、最大Lv.はodOnly、中間はeitherを返す（技マスタ側の行生成で使う）', () => {
    expect(calculateOdLevelConstraintForVariant('ビーム|Lv. 0', move)).toBe('normalOnly');
    expect(calculateOdLevelConstraintForVariant('ビーム|Lv. 1', move)).toBe('either');
    expect(calculateOdLevelConstraintForVariant('ビーム|Lv. 2', move)).toBe('either');
    expect(calculateOdLevelConstraintForVariant('ビーム|Lv. 3', move)).toBe('odOnly');
  });

  it('Lv.を含まない選択肢（チャージ等）はnull', () => {
    expect(calculateOdLevelConstraintForVariant('チャージ', move)).toBeNull();
  });

  it('技が指定されていなければnull', () => {
    expect(calculateOdLevelConstraintForVariant('ビーム|Lv. 1', undefined)).toBeNull();
  });
});

describe('usesODによる参照キーの切り替え（OD版は同じLv.の別データを直接参照する）', () => {
  it('usesODが付いたノードは、同じLv.のまま「OD」が前置された登録済みデータを参照する', () => {
    const beam = makeNode('beam', '強サンフレア(ビーム|Lv. 1)', { usesOD: true });
    const starter = makeNode('starter', '強P', { children: [beam] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ damage: 900 })]),
        '強サンフレア(ビーム|Lv. 1)': makeStats([makeHit({ damage: 1100 })]),
        '強サンフレア(ODビーム|Lv. 1)': makeStats([makeHit({ damage: 1100, dGaugeGain: 0 })]),
      },
    };

    // usesOD:trueなので、「ビーム|Lv. 1」ではなく「ODビーム|Lv. 1」の登録済みデータが使われる
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, BEAM_MOVE_LIST, starter, 'beam')).toBe(2000);
  });

  it('usesODが付いていなければ、OD無しのキーのデータをそのまま使う', () => {
    const beam = makeNode('beam', '強サンフレア(ビーム|Lv. 1)');
    const starter = makeNode('starter', '強P', { children: [beam] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ damage: 900 })]),
        '強サンフレア(ビーム|Lv. 1)': makeStats([makeHit({ damage: 1100 })]),
        '強サンフレア(ODビーム|Lv. 1)': makeStats([makeHit({ damage: 9999 })]),
      },
    };

    expect(calculateBranchDamage('ingrid', moveStatsDatabase, BEAM_MOVE_LIST, starter, 'beam')).toBe(2000);
  });

  it('OD専用データが登録されていない場合はnull（未登録扱い）になる', () => {
    const beam = makeNode('beam', '強サンフレア(ビーム|Lv. 2)', { usesOD: true });
    const starter = makeNode('starter', '強P', { children: [beam] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ damage: 900 })]),
        '強サンフレア(ビーム|Lv. 2)': makeStats([makeHit({ damage: 1350 })]),
        // 「ODビーム|Lv. 2」は未登録
      },
    };

    // ビーム自体が技データ未登録扱いになりdamage0(位置のみ消費)。強P分の900のみ
    expect(calculateBranchDamage('ingrid', moveStatsDatabase, BEAM_MOVE_LIST, starter, 'beam')).toBe(900);
  });

  it('SAゲージ・Dゲージの自動計算でも同じくOD専用のキーを参照する', () => {
    const beam = makeNode('beam', '強サンフレア(ビーム|Lv. 1)', { usesOD: true });
    const starter = makeNode('starter', '強P', { children: [beam] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ saGaugeGain: 100, dGaugeGain: 500 })]),
        '強サンフレア(ビーム|Lv. 1)': makeStats([makeHit({ saGaugeGain: 800, dGaugeGain: 2000 })]),
        '強サンフレア(ODビーム|Lv. 1)': makeStats([makeHit({ saGaugeGain: 800, dGaugeGain: 0 })]),
      },
    };

    expect(calculateBranchSaGaugeChange('ingrid', moveStatsDatabase, starter, 'beam')).toBe(900);
    expect(calculateBranchDGaugeChange('ingrid', moveStatsDatabase, BEAM_MOVE_LIST, starter, 'beam')).toBe(
      500,
    );
  });

  it('キャンセルラッシュ後でも、usesODが付いたノードのDゲージ値は握りつぶされず加算される（回帰）', () => {
    // 強P → キャンセルラッシュ → ビーム(OD使用、-20000のOD発動コスト込み)
    const beam = makeNode('beam', '強サンフレア(ビーム|Lv. 2)', { usesOD: true });
    const rush = makeNode('rush', 'キャンセルラッシュ', { children: [beam] });
    const starter = makeNode('starter', '強P', { children: [rush] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ingrid: {
        '強P': makeStats([makeHit({ dGaugeGain: 3000 })]),
        'キャンセルラッシュ': makeStats([makeHit({ dGaugeGain: -2000 })]),
        '強サンフレア(ビーム|Lv. 2)': makeStats([makeHit({ dGaugeGain: 3000 })]),
        '強サンフレア(ODビーム|Lv. 2)': makeStats([makeHit({ dGaugeGain: -20000 })]),
      },
    };

    // 3000(強P) + (-2000)(ラッシュ消費) + (-20000)(OD版の値がそのまま加算される。
    // ラッシュ後は非SA技を0にする既存ルールの対象外になるべき) = -19000
    // 以前は「ラッシュ後の非SA技は0」ルールがusesODより優先されてしまい、-20000が
    // 握りつぶされ1000になっていた
    expect(calculateBranchDGaugeChange('ingrid', moveStatsDatabase, BEAM_MOVE_LIST, starter, 'beam')).toBe(
      -19000,
    );
  });
});

describe('node.hitIndices（複数ヒット技のうち実際に何段目が当たったか）', () => {
  const moveList: MoveDefinition[] = [makeMove('強K', 'normal'), makeMove('SA1', 'superArt')];

  it('calculateBranchDamage: hitIndicesに1だけ指定すると、1段目のhitsだけを合計する', () => {
    const twoHit = makeStats([makeHit({ damage: 1000 }), makeHit({ damage: 500 })], true);
    const moveStatsDatabase: MoveStatsDatabase = { char: { 強K: twoHit } };

    const full = makeNode('n', '強K');
    const partial = makeNode('n', '強K', { hitIndices: [1] });

    const fullDamage = calculateBranchDamage('char', moveStatsDatabase, moveList, full, 'n');
    const partialDamage = calculateBranchDamage('char', moveStatsDatabase, moveList, partial, 'n');

    // 始動技1発目は基準100%のため、1段目のみなら1000がそのまま合計になる
    expect(partialDamage).toBe(1000);
    // 2段目まで当たれば、2段目ぶんの補正済みダメージが上乗せされ1段目のみより大きくなる
    expect(fullDamage).not.toBeNull();
    expect(fullDamage!).toBeGreaterThan(partialDamage!);
  });

  it('calculateBranchSaGaugeChange: hitIndicesに2だけ指定すると、2段目のSAゲージ増加だけを合計する（2段技のうち2段目しか当たらないケース）', () => {
    const twoHit = makeStats([makeHit({ saGaugeGain: 300 }), makeHit({ saGaugeGain: 200 })], true);
    const moveStatsDatabase: MoveStatsDatabase = { char: { 強K: twoHit } };

    const full = makeNode('n', '強K');
    const onlyFirst = makeNode('n', '強K', { hitIndices: [1] });
    const onlySecond = makeNode('n', '強K', { hitIndices: [2] });

    expect(calculateBranchSaGaugeChange('char', moveStatsDatabase, full, 'n')).toBe(500);
    expect(calculateBranchSaGaugeChange('char', moveStatsDatabase, onlyFirst, 'n')).toBe(300);
    expect(calculateBranchSaGaugeChange('char', moveStatsDatabase, onlySecond, 'n')).toBe(200);
  });

  it('calculateBranchDGaugeChange: hitIndicesに[2, 3]を指定すると、4段技のうち中間の段だけを合計する', () => {
    const fourHit = makeStats(
      [
        makeHit({ dGaugeGain: 100 }),
        makeHit({ dGaugeGain: 200 }),
        makeHit({ dGaugeGain: 300 }),
        makeHit({ dGaugeGain: 400 }),
      ],
      true,
    );
    const moveStatsDatabase: MoveStatsDatabase = { char: { 強K: fourHit } };

    const full = makeNode('n', '強K');
    // 4段技のうち2〜3段目だけ当たった
    const middleOnly = makeNode('n', '強K', { hitIndices: [2, 3] });

    expect(calculateBranchDGaugeChange('char', moveStatsDatabase, moveList, full, 'n')).toBe(1000);
    expect(calculateBranchDGaugeChange('char', moveStatsDatabase, moveList, middleOnly, 'n')).toBe(500);
  });

  it('calculateBranchOpponentDGaugeChip: SA技でhitIndicesに1だけ指定すると、1段目の削り量だけを合計する', () => {
    const twoHit = makeStats(
      [makeHit({ dGaugeChipPunishCounter: -1000 }), makeHit({ dGaugeChipPunishCounter: -2000 })],
      true,
    );
    const moveStatsDatabase: MoveStatsDatabase = { char: { SA1: twoHit } };

    const full = makeNode('n', 'SA1');
    const partial = makeNode('n', 'SA1', { hitIndices: [1] });

    expect(calculateBranchOpponentDGaugeChip('char', moveStatsDatabase, moveList, full, 'n')).toBe(-3000);
    expect(calculateBranchOpponentDGaugeChip('char', moveStatsDatabase, moveList, partial, 'n')).toBe(-1000);
  });

  it('hitIndicesが全段を含む、範囲外の値しか無い、または未設定なら従来通り全段を使う', () => {
    const twoHit = makeStats([makeHit({ saGaugeGain: 300 }), makeHit({ saGaugeGain: 200 })], true);
    const moveStatsDatabase: MoveStatsDatabase = { char: { 強K: twoHit } };

    const allSelected = makeNode('n', '強K', { hitIndices: [1, 2] });
    const outOfRange = makeNode('n', '強K', { hitIndices: [5] });
    const unset = makeNode('n', '強K');

    expect(calculateBranchSaGaugeChange('char', moveStatsDatabase, allSelected, 'n')).toBe(500);
    expect(calculateBranchSaGaugeChange('char', moveStatsDatabase, outOfRange, 'n')).toBe(500);
    expect(calculateBranchSaGaugeChange('char', moveStatsDatabase, unset, 'n')).toBe(500);
  });
});
