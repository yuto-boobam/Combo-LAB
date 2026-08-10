// src/lib/tree/layout.ts

import type { NodePosition, DropZoneSpec, TreeLayout, TreeLayoutConfig, TreeNodeLike } from './types';

/**
 * 実測したカード高さを元に、各ノードの座標を計算する。
 * 子を持つノードは「自分の子ノード群の中心」に縦位置を合わせ、葉ノードは
 * 木全体で重ならないよう順番に積み上げる（いわゆる tidy tree レイアウト）。
 */
export function computeTreeLayout<T extends TreeNodeLike>(
  root: T,
  collapsedSet: Set<string>,
  heights: Record<string, number>,
  config: TreeLayoutConfig,
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

  const depthX = (depth: number) =>
    depth === 0 ? 0 : rootWidth + gapX + (depth - 1) * (cardWidth + gapX);

  // ルートは開閉トグルを持たないため常に展開扱い
  const isExpanded = (node: TreeNodeLike, depth: number) =>
    depth === 0 || !collapsedSet.has(node.id);

  const requiredCache = new Map<string, number>();

  // 1段目: 各ノードが必要とする縦幅を子から積み上げて求める
  const computeRequired = (node: TreeNodeLike, depth: number): number => {
    const cached = requiredCache.get(node.id);
    if (cached !== undefined) return cached;

    const own = heightOf(node.id, depth === 0);
    const children = isExpanded(node, depth) ? node.children : [];

    let required = own;
    if (children.length > 0) {
      const block =
        children.reduce(
          (sum, child) => sum + computeRequired(child, depth + 1),
          0,
        ) +
        (children.length + 1) * dropZoneHeight;

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
    const children = isExpanded(node, depth) ? node.children : [];

    if (children.length === 0) {
      // required === own のため、そのまま配置してよい
      positions.set(node.id, { x: depthX(depth), y: topY, height: own });
      return topY + own / 2;
    }

    const block =
      children.reduce(
        (sum, child) => sum + (requiredCache.get(child.id) ?? 0),
        0,
      ) +
      (children.length + 1) * dropZoneHeight;

    let cursorY = topY + (required - block) / 2;

    dropZones.push({
      key: `${node.id}-0`,
      parentId: node.id,
      insertIndex: 0,
      x: depthX(depth + 1),
      y: cursorY,
    });
    cursorY += dropZoneHeight;

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
      cursorY += dropZoneHeight;
    });

    // 直接の子どもたち（最初と最後）の中心に自分を合わせる。
    // ただし自分の持ち場（[topY, topY + required]）からはみ出さないよう安全域にクランプする。
    const rawCenter =
      (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    const nodeY = Math.min(
      Math.max(rawCenter - own / 2, topY),
      topY + required - own,
    );

    positions.set(node.id, { x: depthX(depth), y: nodeY, height: own });
    return nodeY + own / 2;
  };

  assign(root, 0, 0);

  const totalHeight = requiredCache.get(root.id) ?? heightOf(root.id, true);
  const totalWidth =
    depthX(maxDepth) + (maxDepth === 0 ? rootWidth : cardWidth);

  return { positions, dropZones, width: totalWidth, height: totalHeight };
}
