// src/utils/textDisplay.ts
// ノード名・グループ名表示で共通して使う、ちょっとしたテキスト整形。

import type { MoveNode } from '../types';
import { CANCEL_RUSH_MOVE_NAME } from './nodeVisualStyle';

/**
 * 表示テキスト中の「｜」を改行に変換する。自動折り返しが意図しない位置
 * （例:「Lv.」と「1」の間）で発生する問題を避けるため、改行を入れたい位置を
 * ユーザーが「｜」で明示的に指定できるようにするための変換（MoveNodeCircle.tsx・
 * GroupPillNode.tsx共通）。呼び出し側でwhiteSpace: 'pre-line'を指定しないと、
 * ここで挿入した改行文字がCSS側で潰されて効かない点に注意
 */
export function applyManualLineBreaks(text: string): string {
  return text.replace(/｜|\|/g, '\n');
}

/**
 * ノードカードに実際に表示するラベル文字列を求める（｜変換前の生テキスト）。
 * MoveNodeCircle.tsx（表示）とnodeSizing.ts（幅計算）の両方から同じロジックで
 * 呼び、表示内容と幅計算の対象がズレないようにする
 */
export function resolveDisplayLabel(node: Pick<MoveNode, 'moveName' | 'displayName'>): string {
  // 「キャンセルラッシュ」は名前が長く見切れやすいため、呼び名が未設定の場合に限り
  // デフォルトで改行位置を指定する（呼び名が設定されていればそちらを優先する）
  if (!node.displayName && node.moveName === CANCEL_RUSH_MOVE_NAME) return 'キャンセル｜ラッシュ';
  return node.displayName || node.moveName;
}
