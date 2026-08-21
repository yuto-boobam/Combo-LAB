// src/utils/damageModifierCalc.ts
// 技データの modifier 欄（自由記述、例:「始動補正20%＋コンボ補正20%」）と、実機確認済みの
// 標準コンボ補正テーブル・ラッシュ補正・SAの最低保証を組み合わせて、コンボ中の各ヒットに
// 掛かるダメージ補正(%)を計算する。コンボ木の経路をたどる部分は src/utils/comboGaugeCalc.ts の
// calculateBranchDamage が担い、このファイルは1ヒットぶん・1本道ぶんの純粋な計算だけを持つ。
//
// 4種類の補正（詳細は技データ画面の説明を参照）:
// - 始動補正: コンボの起点（1発目）にヒットさせた時だけ適用される
// - コンボ補正: 2発目以降にヒットさせた時に適用され、以降のヒットにも持ち越される（加算）
// - 即時補正: 2発目以降にヒットさせた時に適用される。実機確認の結果、コンボ補正と同じく
//   その技自身にも、以降のヒットにも持ち越される（加算）ことが分かった。計算上はコンボ補正と同じ扱い
// - 乗算補正: コンボに組み込まれた時点で、それ以降のコンボ補正値を掛け算で圧縮する
//
// 加算系（始動補正・コンボ補正）は「現在の%からpercentを引く」（100 →20%→ 80 →20%→ 60 …）。
// 乗算補正は「現在の%に (1 - percent/100) を掛ける」（80% →20%乗算→ 64%）。

export type ModifierType = '始動補正' | 'コンボ補正' | '即時補正' | '乗算補正';

export type ParsedModifier = {
  type: ModifierType;
  percent: number;
};

const MODIFIER_TYPES: ModifierType[] = ['始動補正', 'コンボ補正', '即時補正', '乗算補正'];

/**
 * modifier欄の自由記述から補正を読み取る。「＋」区切りの複数併記（始動補正20%＋コンボ補正20%）や、
 * 「※即時補正10%」のような注記の※も許容する。読み取れない断片は無視する
 */
export function parseModifierText(text: string): ParsedModifier[] {
  const results: ParsedModifier[] = [];

  for (const segment of text.split(/[+＋]/)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const type = MODIFIER_TYPES.find((candidate) => trimmed.includes(candidate));
    if (!type) continue;

    const match = trimmed.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!match) continue;

    results.push({ type, percent: Number(match[1]) });
  }

  return results;
}

/** 加算補正（始動補正・コンボ補正）: 現在の%からpercentポイントを引く */
export function applyAdditiveModifier(currentPercent: number, percent: number): number {
  return currentPercent - percent;
}

/** 乗算補正: 現在の%に (1 - percent/100) を掛ける */
export function applyMultiplicativeModifier(currentPercent: number, percent: number): number {
  return currentPercent * (1 - percent / 100);
}

/**
 * 1ヒットぶんの補正を適用し、このヒット以降に使う持続的な補正値(%)を返す。
 * isStarter=trueの時は始動補正だけを見る（コンボ補正・即時補正は2発目以降専用のため無視）。
 * isStarter=falseの時はコンボ補正・即時補正・乗算補正を見る（始動補正は無視）。
 * コンボ補正と即時補正は計算上は同じ扱い（加算して以降のヒットにも持ち越す）。
 */
export function applyHitModifiers(
  currentPercent: number,
  modifiers: ParsedModifier[],
  isStarter: boolean,
): number {
  let percent = currentPercent;

  for (const modifier of modifiers) {
    if (isStarter) {
      if (modifier.type === '始動補正') {
        percent = applyAdditiveModifier(percent, modifier.percent);
      }
      continue;
    }

    if (modifier.type === 'コンボ補正' || modifier.type === '即時補正') {
      percent = applyAdditiveModifier(percent, modifier.percent);
    } else if (modifier.type === '乗算補正') {
      percent = applyMultiplicativeModifier(percent, modifier.percent);
    }
  }

  return percent;
}

// ── 標準コンボ補正テーブル ────────────────────────────────────────────────
// 実機確認済み。技固有のmodifier欄が空欄のヒットに適用される既定の減衰。
// 値は「その位置(何発目か)での補正%」(1発目=起点)。10発目以降は10で下げ止まる。
// 技固有のmodifier欄に値がある場合は、このテーブルの減衰に「加えて」その値ぶんも引かれる
// （ユーザー確認済み: (始動補正)+(コンボ補正)+(技固有のコンボ補正) という加算式）
const STANDARD_COMBO_TABLE = [100, 100, 80, 70, 60, 50, 40, 30, 20, 10];

const RUSH_DAMAGE_MULTIPLIER = 0.85;
export const NO_RUSH_MIN_DAMAGE_PERCENT = 10;
export const RUSH_MIN_DAMAGE_PERCENT = 8;

function tableValueForPosition(position: number): number {
  const index = Math.min(Math.max(position, 1), STANDARD_COMBO_TABLE.length) - 1;
  return STANDARD_COMBO_TABLE[index];
}

export type DamageHitInput = {
  modifierText: string;
  // SAは自身の最低保証をそのまま採用する（テーブル・ラッシュ倍率・他の補正の影響を受けない）
  isSuperArt: boolean;
  minDamageGuaranteePercent: number | null;
};

/**
 * コンボの1本道（1番目が起点＝始動）ぶんの補正を、先頭から順に適用し、各ヒットのダメージに
 * 掛ける割合(%)を返す。
 *
 * 重要: 起点（1発目）の計算と、2発目以降の計算は独立している。起点は
 * 「startBase(通常100、カウンター/パニカン始動120、ジャストパリィ後パニカン始動50) から
 * その技自身の始動補正を引いた値」がそのまま採用され、2発目以降の標準テーブル参照には
 * 一切引き継がれない（起点の始動補正やstartBaseが2発目以降の減衰量に影響しない）。
 * 2発目以降は常に100を起点とした標準テーブルの段差＋技固有のコンボ補正/即時補正/乗算補正の
 * 累積で計算する。この挙動は実機確認済みの例
 * （始動補正20%の技で始まり→キャンセルラッシュ→無地の技、で3発目が68%になる）から逆算して
 * 確認済み: 3発目は始動技の-20%の影響を受けず、標準テーブルの3発目(80%)にラッシュ0.85倍だけが
 * 掛かった値(68%)と一致する。
 *
 * - rushTriggerPosition以降（ラッシュ攻撃＝ラッシュ直後の技から）は、ラッシュが絡まない場合の
 *   計算結果に0.85を掛け、小数点以下切り捨てにする（テーブルの段差を0.85倍するのではなく、
 *   最終結果に後から0.85を掛ける方式。実機のラッシュ後テーブルの値と一致することを確認済み）
 * - SA以外は、ラッシュを伴うコンボなら8%、伴わないコンボなら10%を下回らない
 * - SAは自身の`minDamageGuaranteePercent`をそのまま採用し、テーブル・ラッシュ倍率・下限の影響を受けない
 */
export function calculateDamageScalingPath(
  hits: DamageHitInput[],
  rushTriggerPosition: number | null,
  startBase: number = 100,
): number[] {
  const rawPercents: number[] = [];
  // 2発目以降の標準テーブル参照＋技固有のコンボ補正/即時補正/乗算補正の累積値。
  // 常に100からスタートし、起点(1発目)の値やstartBaseとは独立している
  let runningPercent = 100;

  hits.forEach((hit, index) => {
    const position = index + 1;
    const isStarter = position === 1;

    if (hit.isSuperArt && hit.minDamageGuaranteePercent !== null) {
      rawPercents.push(hit.minDamageGuaranteePercent);
      return;
    }

    if (isStarter) {
      rawPercents.push(applyHitModifiers(startBase, parseModifierText(hit.modifierText), true));
      return;
    }

    const tableStep = tableValueForPosition(position - 1) - tableValueForPosition(position);
    runningPercent = applyAdditiveModifier(runningPercent, tableStep);
    runningPercent = applyHitModifiers(runningPercent, parseModifierText(hit.modifierText), false);
    rawPercents.push(runningPercent);
  });

  const inRush = (position: number) => rushTriggerPosition !== null && position >= rushTriggerPosition;
  const floor = rushTriggerPosition !== null ? RUSH_MIN_DAMAGE_PERCENT : NO_RUSH_MIN_DAMAGE_PERCENT;

  return rawPercents.map((percent, index) => {
    const hit = hits[index];
    if (hit.isSuperArt && hit.minDamageGuaranteePercent !== null) return percent; // SAは保証値をそのまま使う

    const position = index + 1;
    const withRush = inRush(position) ? Math.floor(percent * RUSH_DAMAGE_MULTIPLIER) : percent;
    return Math.max(withRush, floor);
  });
}
