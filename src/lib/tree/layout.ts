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
 * 各ノードのx座標は「親のx + 親自身の実幅 + gapX」で決まる（親の系譜だけを辿る）。
 * 深さが同じでも別の枝のノードの幅からは影響を受けない。一度分岐した枝は二度と
 * 交わらないため、深さ単位で幅を揃える必要は無く、揃えると無関係な枝の幅に
 * 引きずられて余白が間延びしてしまう（ユーザー指摘、2026-08-30）。
 *
 * widths は個別ノードの幅の上書き（例: 特殊記入のあるノードだけ少し横に広げたい場合）。
 * 指定が無いノードは config.cardWidth（ルートはrootWidth）にフォールバックする。
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
      // グループピルなど、兄弟の中に実測高さが突出して高いノードが混ざると、
      // そのノードより後ろの兄弟だけ余計に押し下げられて接続線の縦距離が
      // 不揃いに伸び、線が「たるんで」見える（ユーザー指摘、2026-08-30）。
      // 同じ親を持つ子同士は、最低でも一番背の高い兄弟の実測高さぶんの
      // スロットを確保して行の高さを揃える（実際の見た目の高さ自体は変えない。
      // スロット内では中央寄せする＝assign側のslotHeightOf参照）
      const slotHeight = Math.max(...children.map((child) => heightOf(child.id, false)));
      const block =
        children.reduce(
          (sum, child) => sum + Math.max(computeRequired(child, depth + 1), slotHeight),
          0,
        ) +
        (children.length + 1) * dropZonePad;

      required = Math.max(own, block);
    }

    requiredCache.set(node.id, required);
    return required;
  };

  computeRequired(root, 0);

  // 2段目: 必要な縦幅と各ノード自身の実幅を元に、実際の座標を割り当てる
  const positions = new Map<string, NodePosition>();
  const dropZones: DropZoneSpec[] = [];
  let maxRightEdge = 0;

  // 戻り値: このノード自身の縦方向の中心Y座標
  // nodeX: 親から「親のx + 親の実幅 + gapX」で渡された、このノード自身のx座標
  const assign = (node: TreeNodeLike, depth: number, topY: number, nodeX: number): number => {
    const isRoot = depth === 0;
    const own = heightOf(node.id, isRoot);
    const ownWidth = widthOf(node.id, isRoot);
    const required = requiredCache.get(node.id) ?? own;
    const children = isExpanded(node) ? node.children : [];

    maxRightEdge = Math.max(maxRightEdge, nodeX + ownWidth);

    if (children.length === 0) {
      // required === own のため、そのまま配置してよい
      positions.set(node.id, { x: nodeX, y: topY, height: own });
      return topY + own / 2;
    }

    // computeRequiredと同じ考え方: 分岐なし（子1つ）は分岐用の余白を消費しない
    const dropZonePad = children.length === 1 ? 0 : dropZoneHeight;
    // computeRequiredと同じスロット高さ（一番背の高い兄弟の実測高さ）
    const slotHeight = Math.max(...children.map((child) => heightOf(child.id, false)));
    const slotHeightOf = (child: TreeNodeLike) =>
      Math.max(requiredCache.get(child.id) ?? 0, slotHeight);

    const block =
      children.reduce((sum, child) => sum + slotHeightOf(child), 0) +
      (children.length + 1) * dropZonePad;

    let cursorY = topY + (required - block) / 2;
    // 子のx座標は自分自身の実幅だけを基準にする。兄弟の別の枝が幅広でも、
    // 二度と交わらない自分の子孫の位置には影響させない。
    const childX = nodeX + ownWidth + gapX;

    dropZones.push({
      key: `${node.id}-0`,
      parentId: node.id,
      insertIndex: 0,
      x: childX,
      y: cursorY,
    });
    cursorY += dropZonePad;

    const childCenters: number[] = [];

    children.forEach((child, index) => {
      const childSlot = slotHeightOf(child);
      const childRequired = requiredCache.get(child.id) ?? 0;
      // スロットの方が広い（他の兄弟に高さを合わせるため広げた）場合、
      // 余白は子の上下に均等に振り分けて中央寄せする
      const childTopY = cursorY + (childSlot - childRequired) / 2;

      childCenters.push(assign(child, depth + 1, childTopY, childX));
      cursorY += childSlot;

      dropZones.push({
        key: `${node.id}-${index + 1}`,
        parentId: node.id,
        insertIndex: index + 1,
        x: childX,
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

  assign(root, 0, 0, 0);

  const totalHeight = requiredCache.get(root.id) ?? heightOf(root.id, true);

  return { positions, dropZones, width: maxRightEdge, height: totalHeight };
}
