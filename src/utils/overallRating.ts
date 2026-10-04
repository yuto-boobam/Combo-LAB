// src/utils/overallRating.ts
// 「総合評価」の自動計算。他の6項目（ダメージ/Dゲージ/SAゲージ/運び/起き攻め内容/難易度）
// の加重平均から求める（2026-10-02ユーザー要望：総合評価を他の評価と独立に毎回手入力する
// のではなく、既定値として自動計算し、必要な時だけ手で上書きできるようにしたい）。
//
// 重みはユーザー指定（2026-10-02）：
//   ダメージ・起き攻め内容・Dゲージ ＞ 運び ＞ SAゲージ・難易度
// を3段階の比率(3:2:1)で表す。難易度は「5＝簡単」で他の項目と同じ「5が良い」向きのため、
// 反転せずそのまま重み付けに使う（ユーザー確認済み）。
//
// 未入力（null）の項目は無視し、入力済みの項目だけの重みで正規化した加重平均を取る
// （2026-10-02ユーザー指定）。1つも入力が無ければ null を返す（偽の既定値を出さないため）。

import type { Rating5 } from '../types';

const OVERALL_RATING_WEIGHTS: Record<
  'damageRating' | 'okizemeRating' | 'dGaugeRating' | 'carryRating' | 'saGaugeRating' | 'difficultyRating',
  number
> = {
  damageRating: 3,
  okizemeRating: 3,
  dGaugeRating: 3,
  carryRating: 2,
  saGaugeRating: 1,
  difficultyRating: 1,
};

// ComboBranchStats・FinishingMoveOptionの両方から、総合評価の加重平均に必要な6項目だけを
// 抜き出した形（FinishingMoveOptionは技ごとの評価の各項目自体が省略可能なため、プロパティ
// 自体を任意にする。省略時はnullと同じ「未入力」として扱う）
type RatingInputs = Partial<Record<keyof typeof OVERALL_RATING_WEIGHTS, Rating5 | null>>;

/**
 * stats内の6項目（未入力のものは無視）から、総合評価の自動計算値を求める。
 * 加重平均を四捨五入し、Rating5の範囲(1〜5)にクランプする。入力が1つも無ければnull
 */
export function calculateWeightedOverallRating(stats: RatingInputs): Rating5 | null {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const [key, weight] of Object.entries(OVERALL_RATING_WEIGHTS) as [
    keyof typeof OVERALL_RATING_WEIGHTS,
    number,
  ][]) {
    const value = stats[key];
    if (value == null) continue;
    weightedSum += value * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) return null;

  const rounded = Math.round(weightedSum / weightTotal);
  const clamped = Math.min(5, Math.max(1, rounded));
  return clamped as Rating5;
}
