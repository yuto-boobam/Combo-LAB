// src/utils/nodeVisualStyle.ts
// 属性の組み合わせから、ノードの見た目（本体色・枠線色）を導出する。
//
// ルール（企画書13ページ + ユーザー指示による変更）:
// - 本体色は「このノード自身の技がどう終わるか」を示す属性（ガード/空振り/状況限）で決まる。
//   優先順位: ガード > 空振り > 状況限。状況限は属性エディタの「状況限」ボタン(situational)
//   単体のほか、キャラ限定/位置限定のメモ欄でも同じ本体色になる（どちらか一方でも該当）。
// - 枠線色・接続線色は「このノード自身の技がカウンター/パニッシュカウンター/ラッシュだったか」で決まる。
//   優先順位: パニッシュカウンター > カウンター > ラッシュ。
//   接続線（親→このノード）もこのノード自身の枠線色に合わせる。つまり「2中P→2中Kがカウンターで
//   つながる」場合は 2中K 側にカウンター属性を付ける（2中P側は通常のまま）。
// - 「キャンセルラッシュ」「生ラッシュ」ノードだけは目立たせるため、属性に関わらず
//   本体色を常に緑にする（優先順位より上位の特例）。ただし枠線色・接続線色まで緑に
//   するのは「キャンセルラッシュ」だけで、「生ラッシュ」の枠線・接続線は通常のまま。
// - 空振りは色に加えて点線枠にする（枠線色とは独立）。
// - 枠線色が有効なノード・空振りノードは視認性のため枠線を太くする。
// - ディレイは色ではなく、独立したディレイマーク（丸バッジ）のフラグにする。バッジにカーソルを
//   合わせるとspecialNote（「xF~yFディレイ」のような自由記述）がツールチップで見える。

import type { NodeAttribute, NodeAttributeType } from '../types';

/**
 * これらの技名のノードだけ、属性に関わらず本体色を緑にして目立たせる
 * （src/data/commonMoves.ts の技名。どちらも「ラッシュ」系の共通システム技）
 */
export const RUSH_HIGHLIGHT_MOVE_NAMES = ['キャンセルラッシュ', '生ラッシュ'];

/**
 * 「キャンセルラッシュ」だけは、本体色に加えて枠線色・接続線色も緑にする
 * （「生ラッシュ」は本体色のみ）。木のノード上での改行位置指定にも使う
 */
export const CANCEL_RUSH_MOVE_NAME = 'キャンセルラッシュ';

export type NodeBodyColorKind = 'default' | 'guard' | 'whiff' | 'situational' | 'rush';
export type NodeBorderColorKind = 'default' | 'counter' | 'punishCounter' | 'rush';

export type NodeVisualStyle = {
  bodyColorKind: NodeBodyColorKind;
  borderColorKind: NodeBorderColorKind;
  borderWidth: 'normal' | 'thick';
  borderStyle: 'solid' | 'dashed';
  hasDelay: boolean;
};

const BODY_COLOR_PRIORITY: NodeAttributeType[] = ['guard', 'whiff', 'situational'];
const BORDER_COLOR_PRIORITY: NodeAttributeType[] = ['punishCounter', 'counter', 'rush'];

/** 自分自身の技名・属性から、自分の枠線・接続線（親→自分）の色を決める */
export function resolveBorderColorKind(moveName: string, attributes: NodeAttribute[]): NodeBorderColorKind {
  if (moveName === CANCEL_RUSH_MOVE_NAME) return 'rush';

  const types = new Set(attributes.map((attribute) => attribute.type));
  return (
    (BORDER_COLOR_PRIORITY.find((type) => types.has(type)) as NodeBorderColorKind | undefined) ??
    'default'
  );
}

export function resolveNodeVisualStyle(moveName: string, attributes: NodeAttribute[]): NodeVisualStyle {
  const types = new Set(attributes.map((attribute) => attribute.type));
  const isSituational = types.has('characterLimited') || types.has('positionLimited');

  const bodyColorKind: NodeBodyColorKind =
    RUSH_HIGHLIGHT_MOVE_NAMES.includes(moveName)
      ? 'rush'
      : ((BODY_COLOR_PRIORITY.find((type) => types.has(type)) as NodeBodyColorKind | undefined) ??
        (isSituational ? 'situational' : 'default'));

  const borderColorKind = resolveBorderColorKind(moveName, attributes);
  const isWhiff = types.has('whiff');

  return {
    bodyColorKind,
    borderColorKind,
    borderWidth: borderColorKind !== 'default' || isWhiff ? 'thick' : 'normal',
    borderStyle: isWhiff ? 'dashed' : 'solid',
    hasDelay: types.has('delay'),
  };
}

/** ノード本体の背景色に使うCSS変数（index.cssに定義） */
export const NODE_BODY_COLOR_VAR: Record<NodeBodyColorKind, string> = {
  default: 'var(--bg-surface)',
  guard: 'var(--node-guard-bg)',
  whiff: 'var(--node-whiff-bg)',
  situational: 'var(--node-situational-bg)',
  rush: 'var(--node-rush-bg)',
};

/** ノード枠線に使うCSS変数（index.cssに定義） */
export const NODE_BORDER_COLOR_VAR: Record<NodeBorderColorKind, string> = {
  default: 'var(--border)',
  counter: 'var(--node-counter-border)',
  punishCounter: 'var(--node-punish-counter-border)',
  rush: 'var(--node-rush-border)',
};

/** 接続線に使うCSS変数。カウンター/パニッシュカウンター/ラッシュの色は枠線と共通だが、
 * 通常時は --border だと線としては薄すぎるため、少し主張の強い色にする */
export const NODE_LINE_COLOR_VAR: Record<NodeBorderColorKind, string> = {
  ...NODE_BORDER_COLOR_VAR,
  default: 'var(--text-primary)',
};
