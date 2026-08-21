// src/utils/damageModifierCalc.ts
// 技データの modifier 欄（自由記述、例:「始動補正20%＋コンボ補正20%」）と、実機確認済みの
// 標準コンボ補正テーブル・ラッシュ補正・SAの最低保証を組み合わせて、コンボ中の各ヒットに
// 掛かるダメージ補正(%)を計算する。コンボ木の経路をたどる部分は src/utils/comboGaugeCalc.ts の
// calculateBranchDamage が担い、このファイルは1ヒットぶん・1本道ぶんの純粋な計算だけを持つ。
//
// 4種類の補正（詳細は技データ画面の説明を参照）:
// - 始動補正: そのヒットがコンボの起点（1発目）だった時、"次につなぐ技"に補正がかかる
//   （実機確認済み: 起点自身のダメージには影響しない。あくまで次以降の技に効く補正）
// - コンボ補正: 2発目以降のヒットに付いている場合、同様に"次につなぐ技"に補正がかかる
//   （始動補正と同じく、そのヒット自身には影響しない）
// - 即時補正: 2発目以降のヒットに付いている場合、そのヒット自身にも、次につなぐ技にも
//   補正がかかる（始動補正・コンボ補正と違い、自分自身にも効くのが特徴）
// - 乗算補正: そのヒットが組み込まれた時点で、それ以降のコンボ補正値を掛け算で圧縮する
//   （これも次につなぐ技に効く）
//
// 加算系（始動補正・コンボ補正・即時補正）は「現在の%からpercentを引く」。
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

/** 加算補正: 現在の%からpercentポイントを引く */
export function applyAdditiveModifier(currentPercent: number, percent: number): number {
  return currentPercent - percent;
}

/** 乗算補正: 現在の%に (1 - percent/100) を掛ける */
export function applyMultiplicativeModifier(currentPercent: number, percent: number): number {
  return currentPercent * (1 - percent / 100);
}

// ── 標準コンボ補正テーブル ────────────────────────────────────────────────
// 実機確認済み。「今、補正値が何%の段にいるか」を基準に、次のヒットがどこまで減衰するかを表す
// （何発目かという連番ではなく、現在値そのものに対応する段を探して1段先に進める。詳細は
// stepDownFromCurrentValue のコメント参照）。10%で下げ止まる。
const STANDARD_COMBO_TABLE = [100, 100, 80, 70, 60, 50, 40, 30, 20, 10];

const RUSH_DAMAGE_MULTIPLIER = 0.85;
export const NO_RUSH_MIN_DAMAGE_PERCENT = 10;
export const RUSH_MIN_DAMAGE_PERCENT = 8;

/**
 * 標準テーブルの「今何段目にいるか」を表すインデックス(0始まり)を1段進める。
 * extraReduction(%)が指定されている場合、自然な1段ぶんの減衰だけでは足りない分、
 * さらに段を進めて埋め合わせる（例: 自然な1段=0%しか減らないのに、技固有の始動補正が
 * 20%ある場合、その先の段まで追加で進めて20%ぶんの減衰を確保する）。
 *
 * 値そのもの（100,80,70…）ではなくインデックスで管理するのがポイント。テーブルの先頭に
 * 100が2つ並ぶため、値だけを見て「今どの段か」を判定すると1段目と2段目の区別が付かず、
 * 減衰が止まってしまう（実際にこの問題で3段目の計算を誤ったことがあるため、必ずインデックスで
 * 管理すること）。
 */
function advanceTableIndex(currentIndex: number, extraReduction: number): number {
  let index = currentIndex;
  let consumed = 0;

  while (consumed < extraReduction && index < STANDARD_COMBO_TABLE.length - 1) {
    const nextIndex = index + 1;
    consumed += STANDARD_COMBO_TABLE[index] - STANDARD_COMBO_TABLE[nextIndex];
    index = nextIndex;
  }

  // extraReductionが0以下でも、最低1段は自然に進める
  if (index === currentIndex) {
    index = Math.min(currentIndex + 1, STANDARD_COMBO_TABLE.length - 1);
  }

  return index;
}

export type DamageHitInput = {
  modifierText: string;
  // SAは自身の最低保証をそのまま採用する（テーブル・ラッシュ倍率・他の補正の影響を受けない）
  isSuperArt: boolean;
  minDamageGuaranteePercent: number | null;
  // キャンセルラッシュ/生ラッシュ等、ダメージを持たないシステム動作。標準テーブルの段を
  // 進めない（現在の補正値をそのまま次のヒットへ引き継ぐ）が、位置(何発目か)は消費する
  isSystemAction?: boolean;
};

function forwardAdditiveReduction(modifiers: ParsedModifier[], isStarter: boolean): number {
  return modifiers
    .filter((m) => (isStarter ? m.type === '始動補正' : m.type === 'コンボ補正' || m.type === '即時補正'))
    .reduce((sum, m) => sum + m.percent, 0);
}

function selfAdditiveReduction(modifiers: ParsedModifier[]): number {
  // 即時補正だけが、次の技だけでなく自分自身のダメージにも効く
  return modifiers.filter((m) => m.type === '即時補正').reduce((sum, m) => sum + m.percent, 0);
}

function forwardMultiplier(modifiers: ParsedModifier[]): number {
  return modifiers
    .filter((m) => m.type === '乗算補正')
    .reduce((factor, m) => factor * (1 - m.percent / 100), 1);
}

/**
 * コンボの1本道（1番目が起点＝始動）ぶんの補正を、先頭から順に適用し、各ヒットのダメージに
 * 掛ける割合(%)を返す。
 *
 * - 起点（1発目）の値は startBase（通常100、カウンター/パニカン始動120、ジャストパリィ後
 *   パニカン始動50）がそのまま採用される。起点自身の始動補正は起点のダメージには影響しない
 * - 起点の始動補正・2発目以降のコンボ補正/即時補正/乗算補正は、いずれも"次につなぐ技"に
 *   効く（即時補正だけは、それに加えて自分自身にも効く）。実機確認済み
 * - 2発目以降の標準テーブル参照は、何発目かではなく「テーブルの何段目にいるか」を基準に
 *   1段ずつ進む（advanceTableIndex参照）。技固有の補正で前倒しに何段か進んだ場合、以降の
 *   自然減衰もその進んだ地点から続く
 * - システム動作（isSystemAction）は段を進めない（現在値をそのまま引き継ぐ）
 * - rushTriggerPosition以降（ラッシュ攻撃＝ラッシュ直後の技から）は、ラッシュが絡まない場合の
 *   計算結果に0.85を掛け、小数点以下切り捨てにする
 * - SA以外は、ラッシュを伴うコンボなら8%、伴わないコンボなら10%を下回らない
 * - SAは自身の`minDamageGuaranteePercent`をそのまま採用し、テーブル・ラッシュ倍率・下限の影響を受けない
 */
export function calculateDamageScalingPath(
  hits: DamageHitInput[],
  rushTriggerPosition: number | null,
  startBase: number = 100,
): number[] {
  const rawPercents: number[] = [];
  // 次のヒットに引き継がれる「現在の補正値」と、テーブル上の現在地(インデックス)。
  // 起点の値・startBaseとは独立して、標準テーブルの段＋技固有の補正の累積で進んでいく
  let carry = STANDARD_COMBO_TABLE[0];
  let tableIndex = 0;

  hits.forEach((hit, index) => {
    const isStarter = index === 0;

    if (hit.isSuperArt && hit.minDamageGuaranteePercent !== null) {
      rawPercents.push(hit.minDamageGuaranteePercent);
      // SA自身の補正欄は次のヒットへも影響させない（保証値がそのまま採用される特殊ケースのため）
      return;
    }

    const modifiers = parseModifierText(hit.modifierText);

    if (isStarter) {
      rawPercents.push(startBase); // 起点自身は始動補正の影響を受けない
      tableIndex = advanceTableIndex(tableIndex, forwardAdditiveReduction(modifiers, true));
      carry = STANDARD_COMBO_TABLE[tableIndex];
      return;
    }

    if (hit.isSystemAction) {
      rawPercents.push(carry); // 参考値（ダメージ0なので実際には使われない）
      // 段は進めない。技固有の補正欄も通常無いので何もしない
      return;
    }

    const ownValue = carry - selfAdditiveReduction(modifiers);
    rawPercents.push(ownValue);

    tableIndex = advanceTableIndex(tableIndex, forwardAdditiveReduction(modifiers, false));
    carry = STANDARD_COMBO_TABLE[tableIndex] * forwardMultiplier(modifiers);
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
