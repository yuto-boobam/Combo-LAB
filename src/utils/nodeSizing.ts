// src/utils/nodeSizing.ts
// ノードカードの寸法定数・幅計算。MoveNodeCircle.tsx（コンポーネントファイル）から
// 分離している（react-refresh/only-export-componentsの制約により、コンポーネントの
// ファイルは基本的にコンポーネントのみをexportする必要があるため）。

import type { MoveNode } from '../types';
import { applyManualLineBreaks, resolveDisplayLabel } from './textDisplay';

// ノード幅の基本値（最小値）。以前は「一番長い技名でも改行させない」方針で
// 72→88→68→76→92→100pxと技名が長くなるたびに広げ続けていたが、それでも
// 別の少し長い技名が出るたびに同じ不満が繰り返されるため方針を転換。
// 基本サイズは80pxに固定し、技名がこれに収まらない時だけnodeWidthFor側で
// 技名の実際の長さに応じて幅を可変させる（＝改行が必要なほど長い技名の時だけ
// 広がる）。それでも改行させたい場合は技名に「｜」を入れて明示的に改行位置を
// 指定する運用のまま（2026-09-30ユーザー指摘：技によって柔軟にノードサイズを
// 変えるべき）
export const NODE_WIDTH = 80;
// nodeWidthForの可変計算で使う定数。MoveNodeCircle.tsxの技名span（fontSize 10,
// fontWeight 700）とノード本体のpadding（'5px 6px'）の実測に合わせている
const NODE_LABEL_FONT_SIZE = 10;
const NODE_LABEL_PADDING_X = 12; // padding '5px 6px' の左右合計
// index.cssの body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif }
// と同じフォント指定。Interは日本語グリフを持たないため、技名の日本語部分はOS標準の
// 日本語フォント（Windows/Mac/Linuxでそれぞれ異なる）にフォールバックして描画される。
// このフォールバック先フォントの全角文字は文字コード判定だけの概算より広く描画される
// ことがあり、それが「改行されないはずが改行される」不具合の原因だった
// （2026-09-30ユーザー指摘）
const NODE_LABEL_FONT = `700 ${NODE_LABEL_FONT_SIZE}px 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;
// 実測値そのままだと、ブラウザのCSSテキストレイアウトとCanvas計測の間のわずかな
// 誤差（字間の丸め等）で改行してしまう余地が残るため、少し余裕を持たせる
const NODE_LABEL_WIDTH_SAFETY_MARGIN = 1.08;

let measureContext: CanvasRenderingContext2D | null | undefined;

// ブラウザ実行時だけ使えるCanvas 2Dコンテキストを1つだけ作って使い回す（同じfontを
// 使う限りコンテキストを毎回作り直す必要は無い）。テスト環境（Node、documentが無い）
// ではnullを返し、呼び出し側は文字種ベースの概算にフォールバックする
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext !== undefined) return measureContext;
  if (typeof document === 'undefined') {
    measureContext = null;
    return measureContext;
  }
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) ctx.font = NODE_LABEL_FONT;
  measureContext = ctx;
  return measureContext;
}

// 全角文字（ひらがな・カタカナ・CJK漢字・全角記号）はほぼ正方形でフォントサイズと
// 同じ幅、半角文字（英数字・半角記号）はその約0.6倍、という単純な近似。Canvas計測が
// 使えない環境（テスト等）でのフォールバック専用
function isFullWidthChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x3000 && code <= 0x30ff) || // 全角記号・ひらがな・カタカナ
    (code >= 0x4e00 && code <= 0x9fff) || // CJK統合漢字
    (code >= 0xff00 && code <= 0xffef) // 全角英数・記号
  );
}

function estimateTextWidthByCharType(text: string): number {
  let width = 0;
  for (const char of text) {
    width += isFullWidthChar(char) ? NODE_LABEL_FONT_SIZE : NODE_LABEL_FONT_SIZE * 0.62;
  }
  return width;
}

function estimateTextWidth(text: string): number {
  const ctx = getMeasureContext();
  if (ctx) return ctx.measureText(text).width * NODE_LABEL_WIDTH_SAFETY_MARGIN;
  return estimateTextWidthByCharType(text);
}

/**
 * 表示ラベルのうち、実際に描画される行（「｜」で改行された場合は各行）の中で
 * 最も幅が必要な行を基準に、技名部分に必要な最小幅を求める
 */
function estimateLabelWidth(label: string): number {
  const lines = applyManualLineBreaks(label).split('\n');
  return Math.max(...lines.map(estimateTextWidth));
}
// 実測前（マウント直後）の仮の高さ。1〜2行の技名がだいたい収まる目安値で、
// 実際の高さはuseNodeHeightsの実測値にすぐ置き換わる（NODE_WIDTHと同じ比率で縮小）
export const NODE_DEFAULT_HEIGHT = 34;
// 特殊記入（ディレイ等）があるノードは、その1行が見切れやすいため少し横に広げる
// （ユーザー確認済み）。ComboTreePage側のcomputeTreeLayoutへ渡すwidthsマップも
// nodeWidthForで同じ値を使い、レイアウトと実際の見た目がズレないようにする
export const SPECIAL_NOTE_EXTRA_WIDTH = 20;
// 名前付きグループの折りたたみピル(GroupPillNode)専用の幅。技名1つ分より長くなりがちな
// グループ名が見切れにくいよう、通常ノードより広めにする（2026-08-23ユーザー指定）。
// 96pxだと9文字目で改行が起きていたため、あと1〜2文字ぶん改行なしで収まるよう
// 116pxへ拡大（2026-08-25ユーザー指定）
export const GROUP_PILL_WIDTH = 116;

// チュートリアル用キャラクターのノードだけ、注記（specialNote）に長めの説明文を
// 入れているため通常より広く・折り返し表示にしたい。実キャラのノードサイズには
// 影響させたくない（以前「ノードが少し大きすぎる」というフィードバックで68pxへ
// 縮小した経緯があるため）ので、tutorialCharacter.tsが振るノードid（"tut-node-"始まり）
// で判定する（characterIdをMoveNodeCircle/レイアウト計算まで持ち回さずに済む）
export function isTutorialNode(node: Pick<MoveNode, 'id'>): boolean {
  return node.id.startsWith('tut-node-');
}

// チュートリアルノードの追加幅（実キャラの特殊記入ぶんの拡張とは別に、さらに広げる）
export const TUTORIAL_NODE_EXTRA_WIDTH = 60;

export function nodeWidthFor(
  node: Pick<MoveNode, 'specialNote' | 'id' | 'moveName' | 'displayName'>,
): number {
  const requiredForLabel = Math.ceil(estimateLabelWidth(resolveDisplayLabel(node))) + NODE_LABEL_PADDING_X;
  const dynamicBase = Math.max(NODE_WIDTH, requiredForLabel);
  const base = node.specialNote ? dynamicBase + SPECIAL_NOTE_EXTRA_WIDTH : dynamicBase;
  return isTutorialNode(node) ? base + TUTORIAL_NODE_EXTRA_WIDTH : base;
}
