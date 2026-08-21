// src/utils/damageModifierCalc.ts
// 技データの modifier 欄（自由記述、例:「始動補正20%＋コンボ補正20%」）に書かれた
// ダメージ補正を読み取り、計算できるようにする。ダメージ自動計算の準備段階のコードで、
// まだノードの自動計算UIには接続していない（後続の実装で使う）。
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

/**
 * コンボの1本道（modifier欄の文字列の並び。1番目が起点＝始動）ぶんの補正を、先頭から順に適用し、
 * 各ヒットのダメージに掛ける割合(%)を返す。始動は100%からスタートする。
 */
export function calculateDamageScalingPath(modifierTexts: string[]): number[] {
  const percents: number[] = [];
  let runningPercent = 100;

  for (const text of modifierTexts) {
    const modifiers = parseModifierText(text);
    runningPercent = applyHitModifiers(runningPercent, modifiers, percents.length === 0);
    percents.push(runningPercent);
  }

  return percents;
}
