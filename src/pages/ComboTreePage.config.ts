// src/pages/ComboTreePage.config.ts
// ComboTreePageの見た目に関する調整値。Rootedの TreePage.config.ts と同じ考え方。

import type { TreeLayoutConfig } from '../lib/tree';
import { NODE_WIDTH, NODE_DEFAULT_HEIGHT } from '../utils/nodeSizing';

/** 角丸長方形ノードのサイズ・列間隔など、木構造レイアウト計算に渡す寸法設定 */
export const TREE_LAYOUT_CONFIG: TreeLayoutConfig = {
  cardWidth: NODE_WIDTH,
  rootWidth: NODE_WIDTH,
  // NODE_WIDTHの縮小(88→68px)に合わせて列間隔も同程度縮め、間延びして見えないようにする。
  // 幅広ノード(specialNote/グループピル)がある列でも間隔が常に均一になるよう列内で
  // 右寄せ配置に変更した(layout.ts参照)。当初18まで詰めたが、分岐が多いノードから
  // 複数の接続線が近い間隔で扇状に伸びる際に線同士が交差して見えたため、24に戻した
  // (2026-08-24ユーザー報告)
  gapX: 24,
  // 縦方向の「隙間」の実体。分岐なし(子1つ)のノードでも子の前後2箇所ぶん(=2倍)が
  // 積み上がるため、深い一本道のコンボほど本来のノード高さ以上に間延びしやすい。
  // 10pxだとその累積が無視できないサイズになっていたため縮小した(ユーザー指摘により調整)
  dropZoneHeight: 4,
  defaultNodeHeight: NODE_DEFAULT_HEIGHT,
  defaultRootHeight: NODE_DEFAULT_HEIGHT,
};

/** キャンバス端の余白(px) */
export const CANVAS_PADDING = 48;

/** 1キャラが複数の木（森）を持つ場合、木と木の縦の間隔(px)。ラベル表示分の余白も含む */
export const TREE_BLOCK_GAP = 48;

/** ノードが閉じて消えるフェードアウトの所要時間(ms) */
export const EXIT_TRANSITION_MS = 200;

// ── 画面比率（ズーム）設定 ───────────────────────────────────────────────
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 1.5;
export const ZOOM_STEP = 0.1;
