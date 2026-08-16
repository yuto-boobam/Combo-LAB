// src/utils/nodeVisualStyle.ts
// 属性の組み合わせから、ノードの見た目（本体色・枠線色）を導出する。
//
// ルール（企画書13ページ + ユーザー指示による変更）:
// - 本体色は「このノード自身の技がどう終わるか」を示す属性（ガード/空振り/コンボ締め）で決まる。
//   優先順位: ガード > 空振り > コンボ締め。
// - 枠線色・接続線色は「このノード自身の技がカウンター/パニッシュカウンターだったか」で決まる。
//   優先順位: パニッシュカウンター > カウンター。
//   接続線（親→このノード）もこのノード自身の枠線色に合わせる。つまり「2中P→2中Kがカウンターで
//   つながる」場合は 2中K 側にカウンター属性を付ける（2中P側は通常のまま）。
// - 空振りは色に加えて点線枠にする（枠線色とは独立）。
// - 枠線色が有効なノード・空振りノードは視認性のため枠線を太くする。
// - 状況限定（キャラ/位置限定）は色ではなく、独立した状況限定マーク（アイコン）のフラグにする。

import type { NodeAttribute, NodeAttributeType } from '../types';

export type NodeBodyColorKind = 'default' | 'guard' | 'whiff' | 'comboEnder';
export type NodeBorderColorKind = 'default' | 'counter' | 'punishCounter';

export type NodeVisualStyle = {
  bodyColorKind: NodeBodyColorKind;
  borderColorKind: NodeBorderColorKind;
  borderWidth: 'normal' | 'thick';
  borderStyle: 'solid' | 'dashed';
  isSituational: boolean;
};

const BODY_COLOR_PRIORITY: NodeAttributeType[] = ['guard', 'whiff', 'comboEnder'];
const BORDER_COLOR_PRIORITY: NodeAttributeType[] = ['punishCounter', 'counter'];

/** 自分自身の属性から、自分の枠線・接続線（親→自分）の色を決める */
export function resolveBorderColorKind(attributes: NodeAttribute[]): NodeBorderColorKind {
  const types = new Set(attributes.map((attribute) => attribute.type));
  return (
    (BORDER_COLOR_PRIORITY.find((type) => types.has(type)) as NodeBorderColorKind | undefined) ??
    'default'
  );
}

export function resolveNodeVisualStyle(attributes: NodeAttribute[]): NodeVisualStyle {
  const types = new Set(attributes.map((attribute) => attribute.type));

  const bodyColorKind =
    (BODY_COLOR_PRIORITY.find((type) => types.has(type)) as NodeBodyColorKind | undefined) ??
    'default';

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
  comboEnder: 'var(--node-combo-ender-bg)',
};

/** ノード枠線・接続線に使うCSS変数（index.cssに定義） */
export const NODE_BORDER_COLOR_VAR: Record<NodeBorderColorKind, string> = {
  default: 'var(--border)',
  counter: 'var(--node-counter-border)',
  punishCounter: 'var(--node-punish-counter-border)',
};
