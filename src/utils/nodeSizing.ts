// src/utils/nodeSizing.ts
// ノードカードの寸法定数・幅計算。MoveNodeCircle.tsx（コンポーネントファイル）から
// 分離している（react-refresh/only-export-componentsの制約により、コンポーネントの
// ファイルは基本的にコンポーネントのみをexportする必要があるため）。

import type { MoveNode } from '../types';

// 「キャンセルラッシュ」のような5文字の技名でも1行目（「キャンセル」）が折り返さず、
// ｜で指定した位置で2行に分かれるように少し広めにしている（以前は72px→88pxに拡大した後、
// 「ノード自体が少し大きすぎる」というフィードバックにより約77%の68pxへ縮小。この調整は
// ズーム初期値ではなく寸法そのものを変える形で行う、とユーザーから明示的な指定あり）
export const NODE_WIDTH = 68;
// 実測前（マウント直後）の仮の高さ。1〜2行の技名がだいたい収まる目安値で、
// 実際の高さはuseNodeHeightsの実測値にすぐ置き換わる（NODE_WIDTHと同じ比率で縮小）
export const NODE_DEFAULT_HEIGHT = 34;
// 特殊記入（ディレイ等）があるノードは、その1行が見切れやすいため少し横に広げる
// （ユーザー確認済み）。ComboTreePage側のcomputeTreeLayoutへ渡すwidthsマップも
// nodeWidthForで同じ値を使い、レイアウトと実際の見た目がズレないようにする
export const SPECIAL_NOTE_EXTRA_WIDTH = 20;
// 名前付きグループの折りたたみピル(GroupPillNode)専用の幅。技名1つ分より長くなりがちな
// グループ名が見切れにくいよう、通常ノードより広めにする（2026-08-23ユーザー指定）
export const GROUP_PILL_WIDTH = 96;

export function nodeWidthFor(node: Pick<MoveNode, 'specialNote'>): number {
  return node.specialNote ? NODE_WIDTH + SPECIAL_NOTE_EXTRA_WIDTH : NODE_WIDTH;
}
