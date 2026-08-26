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
    // 敵にヒットしない行動なのでpercentがnull(補正対象外)になり、段も進めない。強K(3発目)は
    // 始動補正ぶん前倒しで進んだ段(80%)にラッシュ0.85倍を掛けた68%になる
    const hits = [damageHit('始動補正20%'), damageHit('', { isSystemAction: true }), damageHit('')];
    expect(calculateDamageScalingPath(hits, 3)).toEqual([100, null, 68]);
  });

  it('システム動作(isSystemAction)はラッシュ発生後でも0.85倍・下限の対象にならずnullのまま', () => {
    const hits = [damageHit(''), damageHit('', { isSystemAction: true })];
    // ラッシュ発生位置を2発目からにしても、システム動作自身にはラッシュ倍率も下限も適用しない
    expect(calculateDamageScalingPath(hits, 2)).toEqual([100, null]);
  });

  it('sharesTableStepWithPrevious: 同じ技の2段目（強Kの2段目等）は新たに段を進めず、1段目と同じ%になる', () => {
    // 通常技(起点) → 強K1段目(100%の段) → 強K2段目(sharesTableStepWithPrevious) → 次の技
    // 強K1段目・2段目はどちらも同じ100%の段のまま。次の技は「強Kぶんで1段だけ」前倒しされる(80%)
    const hits = [
      damageHit(''),
      damageHit(''),
      damageHit('', { sharesTableStepWithPrevious: true }),
      damageHit(''),
    ];
    expect(calculateDamageScalingPath(hits, null)).toEqual([100, 100, 100, 80]);
  });

  it('sharesTableStepWithPrevious付きのヒットも、自身の即時補正だけは反映される', () => {
    const hits = [
      damageHit(''),
      damageHit(''),
      damageHit('即時補正10%', { sharesTableStepWithPrevious: true }),
    ];
    // 2段目(グループの基準=100%)自身には即時補正が効かないため100%のまま
    // 3段目はグループの基準値100%から、自身の即時補正10%を引いた90%
    expect(calculateDamageScalingPath(hits, null)).toEqual([100, 100, 90]);
  });

  it('sharesTableStepWithPreviousは起点(1発目)が複数ヒット技の場合にも効き、どちらも起点の基準値になる', () => {
    const hits = [
      damageHit(''),
      damageHit('', { sharesTableStepWithPrevious: true }),
      damageHit(''),
    ];
    // 起点2段ぶんはどちらもstartBase(120)のまま。3発目は起点ぶん1段だけ前倒し(100%)
    expect(calculateDamageScalingPath(hits, null, 120)).toEqual([120, 120, 100]);
  });

  it('scalingBase省略時は、startBaseが100以外でも2発目以降は通常の100%始動と同じペースで減衰する（カウンター/パニカン始動の120%は1発目だけのボーナス）', () => {
    const hits = [damageHit(''), damageHit(''), damageHit('')];
    // startBase=120は1発目だけに反映され、2発目以降はscalingBase省略時のデフォルト(100)から
    // 通常通り減衰する（100→100→80と同じペース。1発目の値だけが120に置き換わる）
    expect(calculateDamageScalingPath(hits, null, 120)).toEqual([120, 100, 80]);
  });

  it('scalingBase+naturalStepScaleでジャストパリィ始動を再現する: 技固有の直接引き算は満額、自然減衰だけ半分になる（実機確認済み: 弱P(始動補正20%,起点60%)→弱K(始動補正20%だが起点でないため無視)→中サンライズ(コンボ補正20%だが後続無し)で60→40→35）', () => {
    const hits = [damageHit('始動補正20%'), damageHit('始動補正20%'), damageHit('コンボ補正20%')];
    // 1発目→2発目: 弱Pの始動補正20%を直接引くだけ（60-20=40、naturalStepScaleの対象外）
    // 2発目→3発目: 弱K自身の始動補正は起点でないため次に効かず、技固有の補正が無いヒットの
    // 「自然な1段ぶんの減衰」になる。本来のテーブル通りなら-10(40→30)だが、naturalStepScale=0.5
    // により半分の-5だけ減衰して35になる
    expect(calculateDamageScalingPath(hits, null, 60, 60, undefined, 0.5)).toEqual([60, 40, 35]);
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

  it('SAの自然計算値がminDamageGuaranteePercentを上回っている間は、自然計算の方をそのまま使う（実機確認済みの訂正後の仕様）', () => {
    // 以前は無条件に保証値(50%)を採用していたが、自然計算(テーブル80%×ラッシュ0.85=85%)の方が
    // 保証値より高いケースでダメージを不当に下げてしまう不具合があった。保証値はあくまで
    // 「これを下回らない」という下限であり、自然計算が上回っていればそちらを使う
    const hits = [
      damageHit(''),
      damageHit('', { isSuperArt: true, minDamageGuaranteePercent: 50 }),
    ];
    expect(calculateDamageScalingPath(hits, 2)).toEqual([100, 85]);
  });

  it('SAの自然計算値がminDamageGuaranteePercentを下回った時だけ、保証値まで引き上げる', () => {
    // 乗算補正80%で自然計算を大きく下げ(テーブル80%×0.2倍×ラッシュ0.85≒13%)、
    // 保証値50%を下回るようにする → この場合だけ保証値50%が採用される
    const hits = [
      damageHit(''),
      damageHit('乗算補正80%'),
      damageHit('', { isSuperArt: true, minDamageGuaranteePercent: 50 }),
    ];
    expect(calculateDamageScalingPath(hits, 3)).toEqual([100, 100, 50]);
  });

  it('ラッシュ無しコンボは10%を下回らない', () => {
    const hits = [damageHit(''), damageHit('乗算補正99%'), damageHit('')];
    expect(calculateDamageScalingPath(hits, null)).toEqual([100, 100, 10]);
  });

  it('ラッシュありコンボは8%を下回らない', () => {
    const hits = [damageHit(''), damageHit('乗算補正99%'), damageHit('')];
    expect(calculateDamageScalingPath(hits, 3)).toEqual([100, 100, 8]);
  });

  it('floorScaleに0.5を渡すと下限が半分(5%/4%)になる（ジャストパリィ始動の最低保証半減、実機確認済み。SA自身のminDamageGuaranteePercentは対象外）', () => {
    const hits = [damageHit(''), damageHit('乗算補正99%'), damageHit('')];
    expect(calculateDamageScalingPath(hits, null, 100, undefined, 0.5)).toEqual([100, 100, 5]);
    expect(calculateDamageScalingPath(hits, 3, 100, undefined, 0.5)).toEqual([100, 100, 4]);
  });

  it('技固有の補正がテーブルの区切りと噛み合わない場合、区切りに丸めず%ポイントをそのまま直接引く（実機確認済みの回帰例）', () => {
    // 実機で「7,8,9発目=29%,21%,12%」と確認されたコンボの再現。5発目のコンボ補正15%は
    // テーブルの区切り(50→40→30、10刻み)に噛み合わないため、以前は誤って区切りの30%まで
    // 前倒しされてしまい(7発目が25%になる不具合)、以降のヒットも連鎖してズレていた
    const hits = [
      damageHit('始動補正20%'), // 1発目 起点
      damageHit('', { isSystemAction: true }), // 2発目 キャンセルラッシュ
      damageHit(''), // 3発目
      damageHit('始動補正20%＋コンボ補正20%'), // 4発目
      damageHit('始動補正30%＋コンボ補正15%'), // 5発目（区切りと噛み合わないコンボ補正15%）
      damageHit('', { isSystemAction: true }), // 6発目 生ラッシュ
      damageHit(''), // 7発目
      damageHit(''), // 8発目
      damageHit('コンボ補正20%'), // 9発目
    ];

    expect(calculateDamageScalingPath(hits, 2, 120)).toEqual([
      120,
      null,
      68,
      59,
      42,
      null,
      29,
      21,
      12,
    ]);
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
