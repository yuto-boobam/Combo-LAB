// src/utils/starterMoveOptions.ts
// 「汎用コンボ」のroot（MoveNode.startingMoveOptions）を自由記述のテキストで
// 入力/編集するための変換。NewTreeSection（作成時）とTreeBlockHeader（作成後の編集）の
// 両方から使う（詳細はtypes.tsのMoveNode.startingMoveOptionsを参照）。
//
// 記法: 改行・カンマ・「、」で候補同士を区切る。1つの候補の中で複数の技を経由する場合
// （例: ジャンプ攻撃始動で「J強K→強P」を経てから汎用の続きに入る）は「→」または「->」で繋ぐ。
// さらに、経由する技のどこかで複数パターンがありうる場合（例:「J攻撃→強P/4強P/2強P」）は
// 「/」で並べる（2026-08-30ユーザー要望）。
//
// 「/」は保存時には展開しない（parseStarterMoveOptionsTextはそのまま1つのトークンとして
// 保持する）。展開すると「J中K/J強P→強P/2強P/4強P」のような短い入力が6候補ぶんに膨れ上がり、
// 木の見出し表示が長大になって見切れてしまう不具合があったため（2026-08-30ユーザー指摘：
// 「強Pと4強Pは中継技として使う分には結果に差が無いので、まとめて表示したい」）。
// 表示（TreeBlockHeaderの見出し・MoveNodeCircleのtitle等）はstartingMoveOptionsを
// そのままjoinするだけなので、この「/」入り表記が自然にそのままコンパクトに表示される。
// 実際に選ばせる時（BranchStatsEditor.tsxの「この枝の始動技」ピッカー）だけ、
// expandStarterMoveOptionsで初めて具体的な候補へ展開する（1候補=1つの決まった技の並び、
// という前提が必要な選択・ダメージ計算の場面でのみ使う。詳細は各関数のコメント参照）。
//
// 技名の後ろに括弧で条件を添えると、「その技がその条件で当たった時だけ繋がる」を表現できる
// （2026-08-30ユーザー要望。「〜の技のパニカンならつながる」を表現したい）。
// 括弧の中はC(カウンター)/PC(パニッシュカウンター)/Rの組み合わせを「/」で並べる
// （例:「強昇竜拳（C）」「強昇竜拳（PC/R）」）。技名を書かず「PC」「R」のように条件コードだけ
// 単独で書くと、技を問わず「その条件さえ満たせば繋がる」という意味になる。
// パース自体（parseStarterMoveOptionsText）はこの括弧を1つの技名文字列の一部としてそのまま
// 保持するだけで中身は解釈しない。実際にmoveName/attributesへ分解するのは
// src/utils/comboGaugeCalc.ts の resolveStartingMove が呼ぶparseStarterMoveToken（下記）。
// 括弧の中の「/」は候補展開用の「/」と衝突するため、括弧の中は展開対象から除外する
// （splitTopLevelPreservingParens参照）。

import type { NodeAttribute } from '../types';

/**
 * delimiterで分割するが、括弧（半角/全角どちらも）の中にある場合は分割しない。
 * 「強P（C）/4強P（PC/R）」のような文字列で、候補展開用の先頭の「/」と、
 * 条件指定の中の「/」を区別するために使う
 */
function splitTopLevelPreservingParens(text: string, delimiter: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of text) {
    if (char === '(' || char === '（') depth += 1;
    else if (char === ')' || char === '）') depth = Math.max(0, depth - 1);

    if (char === delimiter && depth === 0) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function cartesianProduct(steps: string[][]): string[][] {
  return steps.reduce<string[][]>(
    (chains, alternatives) => chains.flatMap((chain) => alternatives.map((name) => [...chain, name])),
    [[]],
  );
}

/**
 * テキスト⇄startingMoveOptions（MoveNode.startingMoveOptions）の変換。「/」は展開せず、
 * 各段の生の文字列（例:「強P/4強P」）をそのまま1トークンとして保持する
 * （見出し表示をコンパクトに保つため。展開が必要な場面はexpandStarterMoveOptions参照）
 */
export function parseStarterMoveOptionsText(text: string): string[][] {
  return text
    .split(/[\n,、]/)
    .map((candidate) =>
      candidate
        .split(/→|->/)
        .map((step) => step.trim())
        .filter((step) => step.length > 0),
    )
    .filter((chain) => chain.length > 0);
}

export function serializeStarterMoveOptions(options: string[][]): string {
  return options.map((chain) => chain.join('→')).join('\n');
}

/**
 * startingMoveOptionsの各段が「強P/4強P」のように複数パターンを含んでいる場合、
 * 具体的な組み合わせ（直積）へ展開する。技を1つずつ選ばせる必要がある場面
 * （BranchStatsEditor.tsxの「この枝の始動技」ピッカー）だけで使う。
 * 括弧の中の「/」（条件指定「PC/R」用）は展開対象に含めない
 * （splitTopLevelPreservingParens参照）
 */
export function expandStarterMoveOptions(options: string[][]): string[][] {
  return options.flatMap((chain) => {
    const steps = chain
      .map((step) =>
        splitTopLevelPreservingParens(step, '/')
          .map((name) => name.trim())
          .filter((name) => name.length > 0),
      )
      .filter((alternatives) => alternatives.length > 0);

    return steps.length > 0 ? cartesianProduct(steps) : [];
  });
}

const CONDITION_ATTRIBUTE_MAP: Record<string, NodeAttribute['type']> = {
  C: 'counter',
  PC: 'punishCounter',
  R: 'rush',
};

function parseConditionCodes(raw: string): NodeAttribute[] {
  return raw
    .split('/')
    .map((token) => token.trim().toUpperCase())
    .filter((token) => token in CONDITION_ATTRIBUTE_MAP)
    .map((token) => ({ type: CONDITION_ATTRIBUTE_MAP[token] }) as NodeAttribute);
}

/**
 * parseStarterMoveOptionsTextで保存された1トークン（例:「強昇竜拳（PC/R）」「PC」「弱P」）を
 * 実際の技名と属性（NodeAttribute、始動条件の判定・枠線色に使う）へ分解する。
 * 括弧が無く、トークン全体がC/PC/Rの組み合わせだけの場合は、技名を問わず条件だけを
 * 表す候補として扱う（moveNameは空文字を返す。呼び出し側=resolveStartingMoveで
 * 技データ未登録と同じ扱い＝ダメージ0・位置だけ消費、になる）
 */
export function parseStarterMoveToken(token: string): { moveName: string; attributes: NodeAttribute[] } {
  const trimmed = token.trim();

  const parenMatch = trimmed.match(/^(.*?)[（(]([^）)]*)[）)]\s*$/);
  if (parenMatch) {
    const [, namePart, conditionPart] = parenMatch;
    return { moveName: namePart.trim(), attributes: parseConditionCodes(conditionPart) };
  }

  const bareAttributes = parseConditionCodes(trimmed);
  const isBareCondition =
    bareAttributes.length > 0 &&
    trimmed.split('/').every((token2) => token2.trim().toUpperCase() in CONDITION_ATTRIBUTE_MAP);
  if (isBareCondition) {
    return { moveName: '', attributes: bareAttributes };
  }

  return { moveName: trimmed, attributes: [] };
}
