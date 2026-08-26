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
 * 与えられた%が標準テーブル上のどの段(インデックス、0始まり)に位置するかを値から逆算する。
 * ちょうどテーブル上の値でなくても（技固有の補正でテーブルの区切りの途中に落ちても）、
 * 「まだ下回っていない直近の段」を返す。100%（テーブル先頭の重複）は2つ目の段(index1)を
 * 返す（以降の自然な1段ぶんの減衰が正しく機能するように、常に「もう1段目に居る」側を選ぶ）。
 */
function indexForValue(value: number): number {
  let index = 0;
  for (let i = 0; i < STANDARD_COMBO_TABLE.length; i += 1) {
    if (STANDARD_COMBO_TABLE[i] >= value) index = i;
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
  // 同じ技の直前のヒットと標準テーブルの段を共有する（強Kの2段目等）。trueの場合、
  // このヒットは新たに段を進めず、このヒットが属するグループの1段目が使った%と同じ%を
  // そのまま使う（自分の即時補正だけは反映する）。位置(何発目か)は通常通り消費する
  sharesTableStepWithPrevious?: boolean;
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
 * - 2発目以降の減衰ペースはscalingBase基準（省略時は標準テーブルの先頭=100）で進む。
 *   カウンター/パニカン始動の120%は1発目自身への一回限りのボーナスで、2発目以降の減衰
 *   ペースは通常の100%始動と同じ（実機確認済み）。ジャストパリィ始動のように「2発目以降も
 *   低いまま推移する」場合だけ、呼び出し側でscalingBaseにstartBaseと同じ値を渡す
 * - 起点の始動補正・2発目以降のコンボ補正/即時補正/乗算補正は、いずれも"次につなぐ技"に
 *   効く（即時補正だけは、それに加えて自分自身にも効く）。実機確認済み
 * - 2発目以降の標準テーブル参照は、何発目かではなく「テーブルの何段目にいるか」を基準に
 *   1段ずつ進む。技固有の始動補正・コンボ補正・即時補正がある場合は、テーブルの区切りに
 *   関わらずその%ポイントぶんをそのまま直接引く（例: 50%の技に「コンボ補正15%」が付いて
 *   いれば、次の技の基準値は35%。テーブルの区切り(50→40→30)に合わせて余分に引いたり
 *   しない）。技固有の補正が無いヒットは、その時点の値が標準テーブル上どの段にあるかを
 *   逆算し(indexForValue参照)、そこから自然に1段だけ減衰する
 * - 技固有の補正で直接引いた結果、テーブルの区切りの途中（例:35%）に落ちることがある。
 *   その状態のまま、次の無地の技は「今いる段からもう1段ぶんの減衰量」だけをそのまま直接
 *   引く（テーブルのキリのいい値に巻き戻したりしない。実機確認済み：ここを丸め直すと、
 *   コンボ補正の%がテーブルの区切りと噛み合わない技で誤差が出ることが判明した）
 * - システム動作（isSystemAction）は段を進めない（現在値をそのまま引き継ぐ）
 * - rushTriggerPosition以降（ラッシュ攻撃＝ラッシュ直後の技から）は、ラッシュが絡まない場合の
 *   計算結果に0.85を掛け、小数点以下切り捨てにする
 * - SA以外は、ラッシュを伴うコンボなら8%、伴わないコンボなら10%を下回らない
 *   （floorScaleが渡されていれば、この8%/10%にその倍率をかけたものが下限になる。
 *   ジャストパリィ始動は最低保証も半分＝8%×0.5=4%・10%×0.5=5%になることが実機確認済み）
 * - 技固有の補正（始動補正/コンボ補正/即時補正）による直接引き算は満額そのまま適用される。
 *   技固有の補正が無いヒットの「標準テーブルからの自然な1段ぶんの減衰」だけがnaturalStepScale
 *   の対象（ジャストパリィ始動はこの自然減衰だけ半分になることが実機確認済み。例:
 *   パニカン120%の50%＝60%始動→始動補正20%を直接引いて40%→次の無地の技は本来なら
 *   -10のところ-5だけ減衰して35%）
 * - SAは自身の`minDamageGuaranteePercent`を「これを下回らない」という下限として扱う（他の
 *   補正と同じくテーブル・ラッシュ倍率による自然な計算は行った上で、その結果が保証値を
 *   下回った時だけ保証値に引き上げる。自然計算が保証値を上回っている間は自然計算の方を使う。
 *   実機確認済み：以前は無条件に保証値を採用していたが、自然計算が保証値を上回るケースで
 *   ダメージを不当に下げてしまう不具合があった）
 */
export function calculateDamageScalingPath(
  hits: DamageHitInput[],
  rushTriggerPosition: number | null,
  startBase: number = 100,
  // 2発目以降の減衰ペースが基準にする値。省略時は標準テーブルの先頭(100)で、これは
  // startBaseが100以外（カウンター/パニカン始動120%等）でも変わらない（1発目自身への
  // ボーナスと、2発目以降の減衰ペースは別物であることが実機確認済み）。ジャストパリィ
  // 始動のように減衰ペース自体をstartBaseに合わせたい場合だけ、呼び出し側で明示的に渡す
  scalingBase: number = STANDARD_COMBO_TABLE[0],
  // 非SAの最低保証(8%/10%)にかける倍率。ジャストパリィ始動は最低保証も半分(4%/5%)に
  // なることが実機確認済みのため、その場合だけ呼び出し側で0.5を渡す。SA自身の
  // minDamageGuaranteePercentはこの倍率の対象外（実機確認済み、変化なし）
  floorScale: number = 1,
  // 技固有の補正（始動補正/コンボ補正/即時補正）が無いヒットの「自然な1段ぶんの減衰量」に
  // かける倍率。ジャストパリィ始動はこの自然減衰だけ半分になることが実機確認済み
  // （例: 60%→(始動補正20%を直接引いて)40%→本来なら-10のところ-5だけ減衰して35%。
  // 技固有の補正による直接引き算はこの倍率の対象外で、常に満額そのまま引かれる）
  naturalStepScale: number = 1,
): (number | null)[] {
  // システム動作（isSystemAction）は敵にヒットする行動ではないため、そもそも「何%の
  // 補正がかかったか」という概念自体が存在しない。percentはnull（対象外）を返す
  const rawPercents: (number | null)[] = [];
  // 次のヒットに引き継がれる「現在の補正値」と、標準テーブル上の現在地(インデックス、
  // 「無地の技が来たら次にどれだけ自然減衰するか」を求めるためだけに使う)。
  // 起点の値・startBaseとは独立して、標準テーブルの段＋技固有の補正の累積で進んでいく
  // （カウンター/パニカン始動の120%は1発目自身の表示値だけのボーナスで、2発目以降の減衰
  // ペースは通常の100%始動と同じであることが実機確認済み。scalingBaseは、ジャストパリィ
  // 始動のように「2発目以降の減衰ペース自体」も変えたい場合だけstartBaseと別の値を渡す）
  let carry = scalingBase;
  // scalingBaseが標準テーブルの先頭(100、デフォルト)ならテーブルの位置は0のまま
  // （[100,100]の重複によって1段目は自然減衰0になる、実機確認済みの仕組み）。
  // それ以外のscalingBase（ジャストパリィの60%等）は、テーブル上の実際の位置を
  // indexForValueで逆算する（0のままだと「100%からの1段目」を意味してしまい、
  // 60%の直後の段が本来の50%ではなくずれてしまう）
  let tableIndex = scalingBase === STANDARD_COMBO_TABLE[0] ? 0 : indexForValue(scalingBase);
  // sharesTableStepWithPreviousなヒット群が参照する「グループの基準値」（1段目がテーブルを
  // 進める前のcarry、または起点ならstartBase）。1段目以外のヒットで更新されるまで保持する
  let groupBaseValue: number | null = null;

  // 技固有の始動補正/コンボ補正/即時補正ぶんを直接引く（無ければ、今いる段からの自然な
  // 1段ぶんを直接引く）。乗算補正はその上で最後にまとめて掛ける
  const advance = (extraReduction: number, modifiers: ParsedModifier[]) => {
    let nextCarry: number;

    if (extraReduction > 0) {
      nextCarry = carry - extraReduction;
      tableIndex = indexForValue(nextCarry);
    } else {
      const nextIndex = Math.min(tableIndex + 1, STANDARD_COMBO_TABLE.length - 1);
      const naturalStep = STANDARD_COMBO_TABLE[tableIndex] - STANDARD_COMBO_TABLE[nextIndex];
      nextCarry = carry - naturalStep * naturalStepScale;
      tableIndex = nextIndex;
    }

    carry = nextCarry * forwardMultiplier(modifiers);
  };

  hits.forEach((hit, index) => {
    const isStarter = index === 0;
    const modifiers = parseModifierText(hit.modifierText);

    if (isStarter) {
      rawPercents.push(startBase); // 起点自身は始動補正の影響を受けない
      groupBaseValue = startBase;
      advance(forwardAdditiveReduction(modifiers, true), modifiers);
      return;
    }

    if (hit.isSystemAction) {
      rawPercents.push(null); // 敵にヒットしない行動には補正の概念自体が無い
      // 段は進めない。技固有の補正欄も通常無いので何もしない
      return;
    }

    if (hit.sharesTableStepWithPrevious && groupBaseValue !== null) {
      // 同じ技の2段目以降（強Kの2段目等）: 新たに段を進めず、グループの基準値をそのまま使う
      rawPercents.push(groupBaseValue - selfAdditiveReduction(modifiers));
      return;
    }

    const ownValue = carry - selfAdditiveReduction(modifiers);
    rawPercents.push(ownValue);
    groupBaseValue = carry; // このヒットが新しいグループの1段目になる

    advance(forwardAdditiveReduction(modifiers, false), modifiers);
  });

  const inRush = (position: number) => rushTriggerPosition !== null && position >= rushTriggerPosition;
  const floor =
    (rushTriggerPosition !== null ? RUSH_MIN_DAMAGE_PERCENT : NO_RUSH_MIN_DAMAGE_PERCENT) * floorScale;

  return rawPercents.map((percent, index) => {
    const hit = hits[index];
    if (hit.isSystemAction) return null; // 敵にヒットしない行動にラッシュ倍率・下限を適用しない

    const position = index + 1;
    const withRush = inRush(position) ? Math.floor(percent! * RUSH_DAMAGE_MULTIPLIER) : percent!;
    // SAは通常の8%/10%下限の代わりに、自身のminDamageGuaranteePercentを下限として使う
    // （自然計算がそれを上回っていれば、そのまま自然計算の値を使う）
    const effectiveFloor =
      hit.isSuperArt && hit.minDamageGuaranteePercent !== null ? hit.minDamageGuaranteePercent : floor;
    return Math.max(withRush, effectiveFloor);
  });
}
