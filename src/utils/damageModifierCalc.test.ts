import { describe, expect, it } from 'vitest';
import {
  applyAdditiveModifier,
  applyMultiplicativeModifier,
  calculateDamageScalingPath,
  parseModifierText,
  type DamageHitInput,
} from './damageModifierCalc';

function damageHit(modifierText: string, overrides: Partial<DamageHitInput> = {}): DamageHitInput {
  return { modifierText, isSuperArt: false, minDamageGuaranteePercent: null, ...overrides };
}

function noModHits(count: number): DamageHitInput[] {
  return Array.from({ length: count }, () => damageHit(''));
}

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
  it('技固有のmodifierが無い経路は、標準コンボ補正テーブル通りに減衰する（実機確認済み）', () => {
    expect(calculateDamageScalingPath(noModHits(10), null)).toEqual([
      100, 100, 80, 70, 60, 50, 40, 30, 20, 10,
    ]);
  });

  it('10発目以降は10%で下げ止まる', () => {
    const result = calculateDamageScalingPath(noModHits(12), null);
    expect(result[9]).toBe(10);
    expect(result[10]).toBe(10);
    expect(result[11]).toBe(10);
  });

  it('ラッシュ発生後は、標準テーブルの値に0.85を掛けて小数点以下切り捨てにした値になる（実機確認済み）', () => {
    // 1発目はラッシュの影響を受けない(ラッシュ攻撃が起点になることは無いため)
    expect(calculateDamageScalingPath(noModHits(10), 2)).toEqual([
      100, 85, 68, 59, 51, 42, 34, 25, 17, 8,
    ]);
  });

  it('カウンター/パニカン始動は起点の基準値が120になる', () => {
    expect(calculateDamageScalingPath([damageHit('')], null, 120)).toEqual([120]);
  });

  it('ジャストパリィ後パニカン始動は起点の基準値が50になる', () => {
    expect(calculateDamageScalingPath([damageHit('')], null, 50)).toEqual([50]);
  });

  it('始動補正は起点自身のダメージには影響せず、次につなぐ技にだけ効く（実機確認済みの訂正後の仕様）', () => {
    // 「始動補正20%の2中Kを起点に、2中K→キャンセルラッシュ→強Kとすると100%→68%になる」
    // という実機確認済みの例を再現する。起点(2中K)自身は100%のまま、キャンセルラッシュは
    // システム動作なので段を進めず、強K(3発目)は始動補正ぶん前倒しで進んだ段(80%)にラッシュ
    // 0.85倍を掛けた68%になる
    const hits = [damageHit('始動補正20%'), damageHit('', { isSystemAction: true }), damageHit('')];
    expect(calculateDamageScalingPath(hits, 3)).toEqual([100, 80, 68]);
  });

  it('弱P→弱K→中サンライズの実機確認済みの例（100%→80%→70%）を再現する', () => {
    // 弱P(始動補正20%,起点)→弱K(始動補正20%だが起点ではないため無視される)→
    // 中サンライズ(コンボ補正20%だが後続が無いため使われない)
    // 弱Pの始動補正20%が次(弱K)を80%まで前倒しし、中サンライズはその80%の段から
    // 自然に1段(70%)進む。弱K自身の始動補正・中サンライズ自身のコンボ補正はどちらも
    // 「次につなぐ技」専用のため、後続が無い/起点でないケースでは効かない
    const hits = [damageHit('始動補正20%'), damageHit('始動補正20%'), damageHit('コンボ補正20%')];
    expect(calculateDamageScalingPath(hits, null)).toEqual([100, 80, 70]);
  });

  it('技固有のコンボ補正は、そのヒット自身には効かず、次につなぐ技にだけ加算される', () => {
    const hits = [damageHit(''), damageHit('コンボ補正20%'), damageHit('')];
    // 2発目: 自身のコンボ補正は自分には効かないため、テーブルの自然な段(100%)のまま
    // 3発目: 2発目のコンボ補正20%ぶん前倒しで進んだ段(80%)になる
    expect(calculateDamageScalingPath(hits, null)).toEqual([100, 100, 80]);
  });

  it('即時補正は、そのヒット自身にも次につなぐ技にも効く', () => {
    const hits = [damageHit(''), damageHit('即時補正20%'), damageHit('')];
    // 2発目: 自身の即時補正が自分にも効くため、テーブルの自然な段(100%)から20引いた80%
    // 3発目: 即時補正20%ぶん前倒しで進んだ段(80%)になる
    expect(calculateDamageScalingPath(hits, null)).toEqual([100, 80, 80]);
  });

  it('乗算補正は、そのヒット自身には効かず、次につなぐ技の値を(1-percent/100)倍する', () => {
    const hits = [damageHit(''), damageHit('乗算補正20%'), damageHit('')];
    // 2発目: 自身の乗算補正は自分には効かないため100%のまま
    // 3発目: テーブルの自然な段(80%)に乗算補正20%(×0.8)がかかり64%になる
    expect(calculateDamageScalingPath(hits, null)).toEqual([100, 100, 64]);
  });

  it('SAは自身のminDamageGuaranteePercentをそのまま採用し、テーブル・ラッシュ・下限の影響を受けない', () => {
    const hits = [
      damageHit(''),
      damageHit('', { isSuperArt: true, minDamageGuaranteePercent: 50 }),
    ];
    expect(calculateDamageScalingPath(hits, 2)).toEqual([100, 50]);
  });

  it('ラッシュ無しコンボは10%を下回らない', () => {
    const hits = [damageHit(''), damageHit('乗算補正99%'), damageHit('')];
    expect(calculateDamageScalingPath(hits, null)).toEqual([100, 100, 10]);
  });

  it('ラッシュありコンボは8%を下回らない', () => {
    const hits = [damageHit(''), damageHit('乗算補正99%'), damageHit('')];
    expect(calculateDamageScalingPath(hits, 3)).toEqual([100, 100, 8]);
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
