// src/lib/tree/layout.ts

import type { NodePosition, DropZoneSpec, TreeLayout, TreeLayoutConfig, TreeNodeLike } from './types';

/**
 * このノードの子を展開表示するかどうか。分岐（子が複数）していないノードは
 * 開閉ボタン自体を持たない（2026-08-28ユーザー指定：開閉しても見た目がほぼ
 * 変わらないため）。そのため、過去に複数の子を持っていた頃に折りたたまれた
 * まま子が減って1つになったノードが、開くボタンも無いまま永久に折りたたまれた
 * ように見えてしまわないよう、子が1つ以下のノードは常に展開扱いにする
 */
export function isNodeExpanded(node: TreeNodeLike, collapsedSet: Set<string>): boolean {
  return node.children.length <= 1 || !collapsedSet.has(node.id);
}

/**
 * 実測したカード高さを元に、各ノードの座標を計算する。
 * 子を持つノードは「自分の子ノード群の中心」に縦位置を合わせ、葉ノードは
 * 木全体で重ならないよう順番に積み上げる（いわゆる tidy tree レイアウト）。
 *
 * widths は個別ノードの幅の上書き（例: 特殊記入のあるノードだけ少し横に広げたい場合）。
 * 列（深さ）ごとに揃える必要があるため、同じ深さに幅の異なるノードが混在する場合は
 * その列で最大の幅に揃え、次の列以降のx座標もその分だけ後ろにずれる。指定が無いノードは
 * config.cardWidth（ルートはrootWidth）にフォールバックする。
 */
export function computeTreeLayout<T extends TreeNodeLike>(
  root: T,
  collapsedSet: Set<string>,
  heights: Record<string, number>,
  config: TreeLayoutConfig,
  widths: Record<string, number> = {},
): TreeLayout {
  const {
    cardWidth,
    rootWidth,
    gapX,
    dropZoneHeight,
    defaultNodeHeight,
    defaultRootHeight,
  } = config;

  const heightOf = (id: string, isRoot: boolean) =>
    heights[id] ?? (isRoot ? defaultRootHeight : defaultNodeHeight);

  const widthOf = (id: string, isRoot: boolean) =>
    widths[id] ?? (isRoot ? rootWidth : cardWidth);

  const isExpanded = (node: TreeNodeLike) => isNodeExpanded(node, collapsedSet);

  // 0段目: 表示対象（閉じたノードの子孫は除く）の各深さで最大の幅を集計し、
  // 深さごとの開始x座標を前もって求める
  const columnWidth: number[] = [];
  let maxColumnDepth = 0;

  const collectColumnWidths = (node: TreeNodeLike, depth: number) => {
    maxColumnDepth = Math.max(maxColumnDepth, depth);
    const w = widthOf(node.id, depth === 0);
    columnWidth[depth] = Math.max(columnWidth[depth] ?? 0, w);

    if (isExpanded(node)) {
      node.children.forEach((child) => collectColumnWidths(child, depth + 1));
    }
  };

  collectColumnWidths(root, 0);

  const columnStartX: number[] = [0];
  for (let depth = 1; depth <= maxColumnDepth; depth += 1) {
    columnStartX[depth] = columnStartX[depth - 1] + columnWidth[depth - 1] + gapX;
  }

  const depthX = (depth: number) => columnStartX[depth];

  const requiredCache = new Map<string, number>();

  // 1段目: 各ノードが必要とする縦幅を子から積み上げて求める
  const computeRequired = (node: TreeNodeLike, depth: number): number => {
    const cached = requiredCache.get(node.id);
    if (cached !== undefined) return cached;

    const own = heightOf(node.id, depth === 0);
    const children = isExpanded(node) ? node.children : [];

    let required = own;
    if (children.length > 0) {
      // 分岐なし（子1つ）のノードには分岐用の余白は不要。積み上げると、深い
      // 一本道のコンボだけ縦に間延びし、兄弟の枝と中心がずれてしまうため
      // （ユーザー指摘、2026-08-24）、子が1つの時だけ余白を0にする
      const dropZonePad = children.length === 1 ? 0 : dropZoneHeight;
      const block =
        children.reduce(
          (sum, child) => sum + computeRequired(child, depth + 1),
          0,
        ) +
        (children.length + 1) * dropZonePad;

      required = Math.max(own, block);
    }

    requiredCache.set(node.id, required);
    return required;
  };

  computeRequired(root, 0);

  // 2段目: 必要な縦幅を元に、実際の座標を割り当てる
  const positions = new Map<string, NodePosition>();
  const dropZones: DropZoneSpec[] = [];
  let maxDepth = 0;

  // 戻り値: このノード自身の縦方向の中心Y座標
  const assign = (node: TreeNodeLike, depth: number, topY: number): number => {
    maxDepth = Math.max(maxDepth, depth);

    const own = heightOf(node.id, depth === 0);
    const required = requiredCache.get(node.id) ?? own;
    const children = isExpanded(node) ? node.children : [];
    // 列内は左寄せ（＝depthX(depth)そのまま）にする。一時期「幅の狭いノードだけ
    // 次列との間隔が間延びして見える」対策として右寄せを試したが、同じ列に幅広
    // ノード（specialNote付き・グループピル等）が混在すると、幅の狭い兄弟ノードが
    // 幅広ノード側に引き寄せられて縦の間隔が詰まり、親から扇状に伸びる接続線同士が
    // 交差して見える副作用の方が大きかった（ユーザー指摘、2026-08-24）。
    const nodeX = depthX(depth);

    if (children.length === 0) {
      // required === own のため、そのまま配置してよい
      positions.set(node.id, { x: nodeX, y: topY, height: own });
      return topY + own / 2;
    }

    // computeRequiredと同じ考え方: 分岐なし（子1つ）は分岐用の余白を消費しない
    const dropZonePad = children.length === 1 ? 0 : dropZoneHeight;

    const block =
      children.reduce(
        (sum, child) => sum + (requiredCache.get(child.id) ?? 0),
        0,
      ) +
      (children.length + 1) * dropZonePad;

    let cursorY = topY + (required - block) / 2;

    dropZones.push({
      key: `${node.id}-0`,
      parentId: node.id,
      insertIndex: 0,
      x: depthX(depth + 1),
      y: cursorY,
    });
    cursorY += dropZonePad;

    const childCenters: number[] = [];

    children.forEach((child, index) => {
      childCenters.push(assign(child, depth + 1, cursorY));
      cursorY += requiredCache.get(child.id) ?? 0;

      dropZones.push({
        key: `${node.id}-${index + 1}`,
        parentId: node.id,
        insertIndex: index + 1,
        x: depthX(depth + 1),
        y: cursorY,
      });
      cursorY += dropZonePad;
    });

    // 直接の子どもたち（最初と最後）の中心に自分を合わせる。
    // ただし自分の持ち場（[topY, topY + required]）からはみ出さないよう安全域にクランプする。
    const rawCenter =
      (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    const nodeY = Math.min(
      Math.max(rawCenter - own / 2, topY),
      topY + required - own,
    );

    positions.set(node.id, { x: nodeX, y: nodeY, height: own });
    return nodeY + own / 2;
  };

  assign(root, 0, 0);

  const totalHeight = requiredCache.get(root.id) ?? heightOf(root.id, true);
  const totalWidth = depthX(maxDepth) + columnWidth[maxDepth];

  return { positions, dropZones, width: totalWidth, height: totalHeight };
}
