import { describe, expect, it } from 'vitest';
import { calculateBranchSaGaugeChange } from './comboGaugeCalc';
import type { MoveHitStats, MoveNode, MoveStats, MoveStatsDatabase } from '../types';

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
    ...overrides,
  };
}

function makeStats(hits: MoveHitStats[], isMultiHit = false): MoveStats {
  return { isMultiHit, hits };
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
