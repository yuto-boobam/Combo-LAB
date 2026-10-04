// src/utils/overallRating.test.ts
import { describe, expect, it } from 'vitest';
import { calculateWeightedOverallRating } from './overallRating';
import type { ComboBranchStats } from '../types';

function makeStats(overrides: Partial<ComboBranchStats> = {}): ComboBranchStats {
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

describe('calculateWeightedOverallRating', () => {
  it('6項目すべてが未入力ならnullを返す（偽の既定値を出さない）', () => {
    expect(calculateWeightedOverallRating(makeStats())).toBeNull();
  });

  it('6項目すべてが同じ値なら、重み付けに関わらずその値になる', () => {
    const stats = makeStats({
      damageRating: 4,
      okizemeRating: 4,
      dGaugeRating: 4,
      carryRating: 4,
      saGaugeRating: 4,
      difficultyRating: 4,
    });
    expect(calculateWeightedOverallRating(stats)).toBe(4);
  });

  it('重みの高い項目（ダメージ・起き攻め内容・Dゲージ）が結果をより強く引っ張る', () => {
    // 重み3の3項目を5、重み1の2項目を1（重み2の運びは未入力で無視）
    // (5*3 + 5*3 + 5*3 + 1*1 + 1*1) / (3+3+3+1+1) = 47/11 = 4.27... → 四捨五入で4
    const stats = makeStats({
      damageRating: 5,
      okizemeRating: 5,
      dGaugeRating: 5,
      saGaugeRating: 1,
      difficultyRating: 1,
    });
    expect(calculateWeightedOverallRating(stats)).toBe(4);
  });

  it('未入力の項目は無視して、入力済みの項目だけの重みで正規化する', () => {
    // ダメージ(重み3)だけ5、他はすべて未入力 → 5のまま
    const stats = makeStats({ damageRating: 5 });
    expect(calculateWeightedOverallRating(stats)).toBe(5);
  });

  it('難易度は「5＝簡単」として他の項目と同じ向きでそのまま加重平均に使う', () => {
    // ダメージ(重み3)=1、難易度(重み1)=5 → (1*3 + 5*1)/(3+1) = 8/4 = 2
    const stats = makeStats({ damageRating: 1, difficultyRating: 5 });
    expect(calculateWeightedOverallRating(stats)).toBe(2);
  });

  it('加重平均の結果は1〜5の範囲にクランプされる（小数は四捨五入）', () => {
    // ダメージ(重み3)=2, 運び(重み2)=3 → (2*3+3*2)/(3+2)=12/5=2.4 → 四捨五入で2
    const stats = makeStats({ damageRating: 2, carryRating: 3 });
    expect(calculateWeightedOverallRating(stats)).toBe(2);
  });
});
