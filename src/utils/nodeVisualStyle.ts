// src/utils/nodeVisualStyle.ts
// 属性の組み合わせから、ノードの見た目（本体色・枠線色）を導出する。
//
// ルール（企画書13ページ + ユーザー指示による変更）:
// - 本体色は「このノード自身の技がどう終わるか」を示す属性（ガード/空振り）で決まる。
//   優先順位: ガード > 空振り。
//   ただし「キャンセルラッシュ」ノードだけは目立たせるため、属性に関わらず常に緑にする。
// - 枠線色・接続線色は「このノード自身の技がカウンター/パニッシュカウンター/ラッシュだったか」で決まる。
//   優先順位: パニッシュカウンター > カウンター > ラッシュ。
//   接続線（親→このノード）もこのノード自身の枠線色に合わせる。つまり「2中P→2中Kがカウンターで
//   つながる」場合は 2中K 側にカウンター属性を付ける（2中P側は通常のまま）。
// - 空振りは色に加えて点線枠にする（枠線色とは独立）。
// - 枠線色が有効なノード・空振りノードは視認性のため枠線を太くする。
// - 状況限定（キャラ/位置限定）は色ではなく、独立した状況限定マーク（アイコン）のフラグにする。

import type { NodeAttribute, NodeAttributeType } from '../types';

/** このノードだけ、属性に関わらず本体色を緑にして目立たせる（src/data/commonMoves.ts の技名） */
const CANCEL_RUSH_MOVE_NAME = 'キャンセルラッシュ';

export type NodeBodyColorKind = 'default' | 'guard' | 'whiff' | 'cancelRush';
export type NodeBorderColorKind = 'default' | 'counter' | 'punishCounter' | 'rush';

export type NodeVisualStyle = {
  bodyColorKind: NodeBodyColorKind;
  borderColorKind: NodeBorderColorKind;
  borderWidth: 'normal' | 'thick';
  borderStyle: 'solid' | 'dashed';
  isSituational: boolean;
};

const BODY_COLOR_PRIORITY: NodeAttributeType[] = ['guard', 'whiff'];
const BORDER_COLOR_PRIORITY: NodeAttributeType[] = ['punishCounter', 'counter', 'rush'];

/** 自分自身の属性から、自分の枠線・接続線（親→自分）の色を決める */
export function resolveBorderColorKind(attributes: NodeAttribute[]): NodeBorderColorKind {
  const types = new Set(attributes.map((attribute) => attribute.type));
  return (
    (BORDER_COLOR_PRIORITY.find((type) => types.has(type)) as NodeBorderColorKind | undefined) ??
    'default'
  );
}

export function resolveNodeVisualStyle(moveName: string, attributes: NodeAttribute[]): NodeVisualStyle {
  const types = new Set(attributes.map((attribute) => attribute.type));

  const bodyColorKind: NodeBodyColorKind =
    moveName === CANCEL_RUSH_MOVE_NAME
      ? 'cancelRush'
      : (BODY_COLOR_PRIORITY.find((type) => types.has(type)) as NodeBodyColorKind | undefined) ?? 'default';

  const borderColorKind = resolveBorderColorKind(attributes);
  const isWhiff = types.has('whiff');

  return {
    bodyColorKind,
    borderColorKind,
    borderWidth: borderColorKind !== 'default' || isWhiff ? 'thick' : 'normal',
    borderStyle: isWhiff ? 'dashed' : 'solid',
    isSituational: types.has('characterLimited') || types.has('positionLimited'),
  };
}

/** ノード本体の背景色に使うCSS変数（index.cssに定義） */
export const NODE_BODY_COLOR_VAR: Record<NodeBodyColorKind, string> = {
  default: 'var(--bg-surface)',
  guard: 'var(--node-guard-bg)',
  whiff: 'var(--node-whiff-bg)',
  cancelRush: 'var(--node-cancel-rush-bg)',
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
