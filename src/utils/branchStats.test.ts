import { describe, expect, it } from 'vitest';
import { resolveEffectiveBranchStats } from './branchStats';
import type { ComboBranchStats, MoveNode } from '../types';

const emptyStats: ComboBranchStats = {
  damage: 2000,
  dGaugeChange: 10,
  saGaugeGain: 20,
  damageRating: 3,
  dGaugeRating: 3,
  saGaugeRating: 3,
  overallRating: 3,
  plusFrame: 3,
  isThrowRange: false,
  canOkizeme: true,
};

const move = (overrides: Partial<MoveNode> = {}): MoveNode => ({
  id: overrides.id ?? 'node',
  moveName: '技',
  attributes: [],
  specialNote: '',
  branchStats: null,
  createdBy: '',
  createdAt: '',
  children: [],
  ...overrides,
});

describe('resolveEffectiveBranchStats', () => {
  it('自分自身がbranchStatsを持っていればそれを使う', () => {
    const node = move({ branchStats: emptyStats });
    expect(resolveEffectiveBranchStats(node, [])).toBe(emptyStats);
  });

  it('祖先に「コンボ締め」属性 + branchStatsがあれば引き継ぐ', () => {
    const comboEnderAncestor = move({
      id: 'ender',
      attributes: [{ type: 'comboEnder' }],
      branchStats: emptyStats,
    });
    const setupNode = move({ id: 'setup' });
    const leaf = move({ id: 'leaf' });

    expect(
      resolveEffectiveBranchStats(leaf, [comboEnderAncestor, setupNode]),
    ).toBe(emptyStats);
  });

  it('祖先が「コンボ締め」属性を持たない場合は引き継がない', () => {
    const nonEnderAncestor = move({ id: 'a', branchStats: emptyStats });
    const leaf = move({ id: 'leaf' });

    expect(resolveEffectiveBranchStats(leaf, [nonEnderAncestor])).toBeNull();
  });

  it('祖先が複数のコンボ締めを持つ場合は直近のものを優先する', () => {
    const olderStats: ComboBranchStats = { ...emptyStats, damage: 1000 };
    const older = move({
      id: 'older',
      attributes: [{ type: 'comboEnder' }],
      branchStats: olderStats,
    });
    const newer = move({
      id: 'newer',
      attributes: [{ type: 'comboEnder' }],
      branchStats: emptyStats,
    });
    const leaf = move({ id: 'leaf' });

    expect(resolveEffectiveBranchStats(leaf, [older, newer])).toBe(emptyStats);
  });
});
