import { describe, expect, it } from 'vitest';
import { calculateBranchDGaugeChange, calculateBranchSaGaugeChange } from './comboGaugeCalc';
import type { MoveCategory, MoveDefinition, MoveHitStats, MoveNode, MoveStats, MoveStatsDatabase } from '../types';

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
    ...overrides,
  };
}

function makeStats(hits: MoveHitStats[], isMultiHit = false): MoveStats {
  return { isMultiHit, hits };
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

  it('dGaugeRecoveryBlockedが付いたノードは寄与0になる（連続ガード等の手動除外）', () => {
    const blocked = makeNode('blocked', '中P', { dGaugeRecoveryBlocked: true });
    const a = makeNode('a', '弱P', { children: [blocked] });

    const moveStatsDatabase: MoveStatsDatabase = {
      ryu: {
        '弱P': makeStats([makeHit({ dGaugeGain: 250 })]),
        '中P': makeStats([makeHit({ dGaugeGain: 1500 })]),
      },
    };

    expect(calculateBranchDGaugeChange('ryu', moveStatsDatabase, [], a, 'blocked')).toBe(250);
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
});
