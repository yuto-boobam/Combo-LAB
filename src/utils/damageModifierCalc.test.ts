import { describe, expect, it } from 'vitest';
import {
  applyAdditiveModifier,
  applyMultiplicativeModifier,
  calculateDamageScalingPath,
  parseModifierText,
} from './damageModifierCalc';

describe('parseModifierText', () => {
  it('単一の補正を読み取る', () => {
    expect(parseModifierText('始動補正20%')).toEqual([{ type: '始動補正', percent: 20 }]);
    expect(parseModifierText('コンボ補正20%')).toEqual([{ type: 'コンボ補正', percent: 20 }]);
    expect(parseModifierText('即時補正10%')).toEqual([{ type: '即時補正', percent: 10 }]);
    expect(parseModifierText('乗算補正15%')).toEqual([{ type: '乗算補正', percent: 15 }]);
  });

  it('「＋」区切りの複数併記を読み取る（始動/コンボ補正が両方記載されている技用）', () => {
    expect(parseModifierText('始動補正30%＋コンボ補正20%')).toEqual([
      { type: '始動補正', percent: 30 },
      { type: 'コンボ補正', percent: 20 },
    ]);
    expect(parseModifierText('始動補正20%＋コンボ補正20%')).toEqual([
      { type: '始動補正', percent: 20 },
      { type: 'コンボ補正', percent: 20 },
    ]);
  });

  it('「※」などの注記付き表記も読み取れる', () => {
    expect(parseModifierText('※即時補正10%')).toEqual([{ type: '即時補正', percent: 10 }]);
  });

  it('空文字や補正なしの技はから配列を返す', () => {
    expect(parseModifierText('')).toEqual([]);
  });
});

describe('applyAdditiveModifier / applyMultiplicativeModifier', () => {
  it('加算補正は現在値からパーセントポイントを引く（20%加算 → 80 → 60 → 40）', () => {
    let percent = 100;
    percent = applyAdditiveModifier(percent, 20);
    expect(percent).toBe(80);
    percent = applyAdditiveModifier(percent, 20);
    expect(percent).toBe(60);
    percent = applyAdditiveModifier(percent, 20);
    expect(percent).toBe(40);
  });

  it('乗算補正は現在値に(1 - percent/100)を掛ける（80% → 20%乗算 → 64%）', () => {
    expect(applyMultiplicativeModifier(80, 20)).toBe(64);
  });
});

describe('calculateDamageScalingPath', () => {
  it('始動補正だけの1ヒットコンボは、そのまま補正後の値になる', () => {
    expect(calculateDamageScalingPath(['始動補正20%'])).toEqual([80]);
  });

  it('始動補正なしの技で始まると100%のままになる', () => {
    expect(calculateDamageScalingPath([''])).toEqual([100]);
  });

  it('コンボ補正は加算され、以降のヒットへ持ち越される', () => {
    expect(calculateDamageScalingPath(['始動補正20%', 'コンボ補正20%', 'コンボ補正20%'])).toEqual([
      80, 60, 40,
    ]);
  });

  it('即時補正はコンボ補正と同じく、そのヒット自身にも以降のヒットにも持ち越される（実機確認済み）', () => {
    // 1発目: 100 - 20 = 80
    // 2発目(即時補正): 80 - 20 = 60。持ち越し値も60になる
    // 3発目(コンボ補正): 60 - 10 = 50
    expect(calculateDamageScalingPath(['始動補正20%', '即時補正20%', 'コンボ補正10%'])).toEqual([
      80, 60, 50,
    ]);
  });

  it('乗算補正は持続的な補正値そのものを掛け算で圧縮し、以降のヒットへ持ち越される', () => {
    // 1発目: 100 - 20 = 80
    // 2発目(乗算補正20%): 80 * 0.8 = 64
    // 3発目(コンボ補正10%): 64 - 10 = 54
    expect(calculateDamageScalingPath(['始動補正20%', '乗算補正20%', 'コンボ補正10%'])).toEqual([
      80, 64, 54,
    ]);
  });

  it('始動補正とコンボ補正が併記された技は、起点か否かで採用される値が変わる', () => {
    // 「強サンライズ」相当: 始動補正20%＋コンボ補正20% が併記された技
    expect(calculateDamageScalingPath(['始動補正20%＋コンボ補正20%'])).toEqual([80]);
    expect(calculateDamageScalingPath(['', '始動補正20%＋コンボ補正20%'])).toEqual([100, 80]);
  });

  it('実際に登録済みのイングリッドの補正表記をすべて解釈できる', () => {
    const realModifierTexts = [
      '※即時補正10%',
      'コンボ補正20%',
      '即時補正10%',
      '即時補正20%',
      '始動補正20%',
      '始動補正20%＋コンボ補正20%',
      '始動補正30%',
      '始動補正30%＋コンボ補正15%',
      '始動補正30%＋コンボ補正20%',
    ];

    for (const text of realModifierTexts) {
      expect(parseModifierText(text).length).toBeGreaterThan(0);
    }
  });
});
