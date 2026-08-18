// src/pages/ComboTreePage.config.ts
// ComboTreePageの見た目に関する調整値。Rootedの TreePage.config.ts と同じ考え方。

import type { TreeLayoutConfig } from '../lib/tree';
import { NODE_WIDTH, NODE_DEFAULT_HEIGHT } from '../components/MoveNodeCircle';

/** 角丸長方形ノードのサイズ・列間隔など、木構造レイアウト計算に渡す寸法設定 */
export const TREE_LAYOUT_CONFIG: TreeLayoutConfig = {
  cardWidth: NODE_WIDTH,
  rootWidth: NODE_WIDTH,
  gapX: 36,
  dropZoneHeight: 10,
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
