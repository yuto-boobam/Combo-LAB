// src/utils/nodeVisualStyle.ts
// 属性の組み合わせから、ノードの見た目（本体色・枠線）を導出する。
//
// ルール（企画書13ページ + ユーザー指示による変更）:
// - 本体色（通常/CH/PC/コンボ締め）は排他。UI側はラジオボタンで排他入力させる想定だが、
//   データ上重複が起きた場合に備えて優先順位: パニッシュカウンター > カウンター > コンボ締め。
//   （「カウンター始動 かつ コンボ締め」のようなケースはカウンター表記を優先する）
// - 枠線色が変わるのは「ガード」「空振り」のみ。状況限定（キャラ/位置限定）は
//   枠線色ではなく、ノードに独立した状況限定マーク（アイコン）を出すためのフラグにする。
// - 空振りは色ではなく点線枠のみ（企画書に空振り用の色指定はない）。
// - 枠線色が有効なノードは視認性のため枠線を太くする。

import type { NodeAttribute, NodeAttributeType } from '../types';

export type NodeBodyColorKind = 'default' | 'counter' | 'punishCounter' | 'comboEnder';
export type NodeBorderColorKind = 'default' | 'guard' | 'whiff';

export type NodeVisualStyle = {
  bodyColorKind: NodeBodyColorKind;
  borderColorKind: NodeBorderColorKind;
  borderWidth: 'normal' | 'thick';
  borderStyle: 'solid' | 'dashed';
  isSituational: boolean;
};

const BODY_COLOR_PRIORITY: NodeAttributeType[] = ['punishCounter', 'counter', 'comboEnder'];
const BORDER_COLOR_PRIORITY: NodeAttributeType[] = ['guard', 'whiff'];

export function resolveNodeVisualStyle(attributes: NodeAttribute[]): NodeVisualStyle {
  const types = new Set(attributes.map((attribute) => attribute.type));

  const bodyColorKind =
    (BODY_COLOR_PRIORITY.find((type) => types.has(type)) as NodeBodyColorKind | undefined) ??
    'default';

  const borderColorKind =
    (BORDER_COLOR_PRIORITY.find((type) => types.has(type)) as NodeBorderColorKind | undefined) ??
    'default';

  return {
    bodyColorKind,
    borderColorKind,
    borderWidth: borderColorKind === 'default' ? 'normal' : 'thick',
    borderStyle: borderColorKind === 'whiff' ? 'dashed' : 'solid',
    isSituational: types.has('characterLimited') || types.has('positionLimited'),
  };
}

/** ノード本体の背景色に使うCSS変数（index.cssに定義） */
export const NODE_BODY_COLOR_VAR: Record<NodeBodyColorKind, string> = {
  default: 'var(--bg-surface)',
  counter: 'var(--node-counter-bg)',
  punishCounter: 'var(--node-punish-counter-bg)',
  comboEnder: 'var(--node-combo-ender-bg)',
};

/** ノード枠線・接続線に使うCSS変数（index.cssに定義。空振りは色を持たないため通常の枠線色を使う） */
export const NODE_BORDER_COLOR_VAR: Record<NodeBorderColorKind, string> = {
  default: 'var(--border)',
  guard: 'var(--node-guard-border)',
  whiff: 'var(--border)',
};
