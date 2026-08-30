// src/lib/tree/ConnectionsOverlay.tsx
// SVGコネクター: 各ノードのDOM座標を監視し、動的にベジェ曲線を描画する。
// ドラッグ&ドロップやテキスト入力によるレイアウト変更に即座に追従する。

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TreeColumn, TreeLayout, TreeNodeLike } from './types';

const round1 = (value: number) => Math.round(value * 10) / 10;

export function ConnectionsOverlay<T extends TreeNodeLike>({
  columns,
  zoom,
  layout,
  idPrefix = 'node-',
  idleFrames = 8,
  strokeColor = 'var(--text-primary)',
  getLinkColor,
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
  /** リンク（親→子）ごとに線の色を変えたい場合に指定する。子ノード自身の見た目に
   * 合わせて線を色付けしたいケースを想定し、対象の子ノードも渡す。
   * 未指定の場合はすべての線を strokeColor で描画する */
  getLinkColor?: (column: TreeColumn<T>, childNode: T) => string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<{ id: string; d: string; color: string }[]>([]);

  // columns（Reactの同期的なpropで、常に最新の「開いている親→子」一覧を表す）に存在しない
  // リンクは、非同期のrAFループがまだ追いついていなくても描画しない。ノードを閉じた瞬間、
  // 次のuseEffect実行を待たずに古い接続線が消えることを保証するための安全網
  // （閉じた親配下の接続線が残る不具合の修正）
  const validLinkIds = useMemo(
    () => new Set(columns.flatMap((column) => column.nodes.map((node) => `${column.parentId}-${node.id}`))),
    [columns],
  );

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
      const newPaths: { id: string; d: string; color: string }[] = [];
      let changed = false;

      // 描画すべきすべての「親 → 子」のペアをリスト化
      // （開いている列はすべて自分のparentIdを持つため、列ごとに一律で処理できる）
      const links: { parentId: string; childId: string; color: string }[] = columns.flatMap(
        (column) =>
          column.nodes.map((node) => ({
            parentId: column.parentId,
            childId: node.id,
            color: getLinkColor ? getLinkColor(column, node) : strokeColor,
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
        //
        // 2026-08-30に一度「縦距離もオフセットの下限に反映する」修正を試みたが、
        // 縦距離が横距離の2倍を超えると制御点同士が互いの反対側を追い越してしまい
        // （cp1xがendXを超え、cp2xがstartXを下回る）、ループ状に膨らんで悪化した
        // （ユーザー指摘、2026-08-30）。線の曲げ方では直せない・根本原因は
        // computeTreeLayout側で兄弟ノードの高さが揃っていないため縦距離が偏って
        // 伸びることだったので、そちらをlayout.ts側で対処し、ここは元の横距離基準に戻した。
        //
        // ただし横距離基準のcp1x/cp2xだけだと、縦距離が横距離よりずっと大きいリンク
        // （部分木が深い兄弟の隣で、後続の兄弟だけ大きく下に離れる場合など）では、
        // 始点・終点の接線が常に水平（cp1y=startY, cp2y=endY）なため、曲線が両端で
        // 一度水平に「垂れ下がって」から縦に大きく動く、たるんだロープのような見た目になる
        // （ユーザー指摘、2026-08-30）。x方向は動かさず（交差・ループの心配がないまま）、
        // 縦距離が横距離に対して大きいリンクだけ、制御点のy成分を終点側へわずかに
        // 寄せることで、両端の水平な垂れを減らし張った線に近づける。
        const distanceX = Math.max((endX - startX) / 2, 20);
        const dy = endY - startY;
        // 縦距離が横距離と同程度以下ならほぼ0、大きく上回るほど1に近づく（青天井ではない）
        const steepness = Math.min(Math.abs(dy) / (Math.abs(endX - startX) + distanceX), 1);
        const verticalPull = dy * 0.3 * steepness;
        const cp1x = startX + distanceX;
        const cp1y = startY + verticalPull;
        const cp2x = endX - distanceX;
        const cp2y = endY - verticalPull;

        const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
        const id = `${link.parentId}-${link.childId}`;

        newPaths.push({ id, d, color: link.color });

        const cacheKey = `${d}|${link.color}`;
        if (lastPositions.get(id) !== cacheKey) {
          changed = true;
          lastPositions.set(id, cacheKey);
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
  }, [columns, zoom, layout, idPrefix, idleFrames, strokeColor, getLinkColor]);

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
      {paths.filter((path) => validLinkIds.has(path.id)).map((path) => (
        <path
          key={path.id}
          d={path.d}
          fill="none"
          stroke={path.color}
          strokeWidth="2"
          strokeOpacity="0.5"
        />
      ))}
    </svg>
  );
}
