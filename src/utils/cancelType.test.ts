// src/utils/cancelType.test.ts
import { describe, expect, it } from 'vitest';
import { deriveCancelableSuperArtNames } from './cancelType';
import type { MoveHitStats } from '../types';

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

describe('deriveCancelableSuperArtNames', () => {
  it.each(['全般', 'SAすべて', 'SA2以上', 'SA3のみ'] as const)(
    '1段でも「%s」であれば["SA3"]を返す',
    (cancelType) => {
      const hits = [makeHit(), makeHit({ cancelType })];
      expect(deriveCancelableSuperArtNames(hits)).toEqual(['SA3']);
    },
  );

  it.each(['一部の必殺', '不可'] as const)(
    '全ての段が「%s」またはnullなら空配列を返す',
    (cancelType) => {
      const hits = [makeHit({ cancelType }), makeHit({ cancelType: null })];
      expect(deriveCancelableSuperArtNames(hits)).toEqual([]);
    },
  );

  it('hitsが空配列でも空配列を返す（例外を投げない）', () => {
    expect(deriveCancelableSuperArtNames([])).toEqual([]);
  });
});
