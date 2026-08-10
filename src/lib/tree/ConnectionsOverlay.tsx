// src/lib/tree/ConnectionsOverlay.tsx
// SVGコネクター: 各ノードのDOM座標を監視し、動的にベジェ曲線を描画する。
// ドラッグ&ドロップやテキスト入力によるレイアウト変更に即座に追従する。

import { useEffect, useRef, useState } from 'react';
import type { TreeColumn, TreeLayout, TreeNodeLike } from './types';

const round1 = (value: number) => Math.round(value * 10) / 10;

export function ConnectionsOverlay<T extends TreeNodeLike>({
  columns,
  zoom,
  layout,
  idPrefix = 'node-',
  idleFrames = 8,
  strokeColor = 'var(--text-primary)',
}: {
  columns: TreeColumn<T>[];
  zoom: number;
  layout: TreeLayout | null;
  idPrefix?: string;
  /** 変化が無くなってからこのフレーム数だけ様子を見てポーリングを止める
   *（CSSトランジション中は座標が毎フレーム変わるため自動的に動き続け、
   *  静止したことが分かったら止まる＝アイドル時にCPUを使い続けない） */
  idleFrames?: number;
  strokeColor?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);

  useEffect(() => {
    let animationFrameId = 0;
    let idleFrameCount = 0;
    const lastPositions = new Map<string, string>();

    const updateLines = () => {
      const svg = svgRef.current;

      if (!svg) {
        animationFrameId = requestAnimationFrame(updateLines);
        return;
      }

      const svgRect = svg.getBoundingClientRect();
      const newPaths: { id: string; d: string }[] = [];
      let changed = false;

      // 描画すべきすべての「親 → 子」のペアをリスト化
      // （開いている列はすべて自分のparentIdを持つため、列ごとに一律で処理できる）
      const links: { parentId: string; childId: string }[] = columns.flatMap(
        (column) =>
          column.nodes.map((node) => ({
            parentId: column.parentId,
            childId: node.id,
          })),
      );

      links.forEach((link) => {
        const parentElement = document.getElementById(
          `${idPrefix}${link.parentId}`,
        );
        const childElement = document.getElementById(
          `${idPrefix}${link.childId}`,
        );

        if (!parentElement || !childElement) return;

        const parentRect = parentElement.getBoundingClientRect();
        const childRect = childElement.getBoundingClientRect();

        // 実測値はズームで拡縮された画面上の座標なので、論理座標に戻す。
        // 小数点以下を丸めて、サブピクセルのブレで「変化した」と誤検知しないようにする。
        // 親の右端中央
        const startX = round1((parentRect.right - svgRect.left) / zoom);
        const startY = round1(
          (parentRect.top + parentRect.height / 2 - svgRect.top) / zoom,
        );

        // 子の左端中央
        const endX = round1((childRect.left - svgRect.left) / zoom);
        const endY = round1(
          (childRect.top + childRect.height / 2 - svgRect.top) / zoom,
        );

        // 滑らかなベジェ曲線の制御点
        const distanceX = Math.max((endX - startX) / 2, 20);
        const cp1x = startX + distanceX;
        const cp1y = startY;
        const cp2x = endX - distanceX;
        const cp2y = endY;

        const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
        const id = `${link.parentId}-${link.childId}`;

        newPaths.push({ id, d });

        if (lastPositions.get(id) !== d) {
          changed = true;
          lastPositions.set(id, d);
        }
      });

      // 削除されたノードなどの検知
      if (changed || newPaths.length !== lastPositions.size) {
        if (newPaths.length !== lastPositions.size) {
          const newKeys = new Set(newPaths.map((path) => path.id));

          for (const key of lastPositions.keys()) {
            if (!newKeys.has(key)) {
              lastPositions.delete(key);
            }
          }

          changed = true;
        }

        if (changed) {
          setPaths(newPaths);
        }
      }

      if (changed) {
        idleFrameCount = 0;
      } else {
        idleFrameCount += 1;
      }

      // 一定フレーム変化がなければ一時停止する。
      // ノードの開閉・実測高さの確定・ズーム変更などpositionsが変わりうる操作は
      // すべてlayoutの再計算を経由するため、依存配列のlayoutが変わればeffectごと再始動する。
      if (idleFrameCount < idleFrames) {
        animationFrameId = requestAnimationFrame(updateLines);
      }
    };

    animationFrameId = requestAnimationFrame(updateLines);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [columns, zoom, layout, idPrefix, idleFrames]);

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'visible',
      }}
    >
      {paths.map((path) => (
        <path
          key={path.id}
          d={path.d}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeOpacity="0.5"
        />
      ))}
    </svg>
  );
}
