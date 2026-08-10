// src/lib/tree/useNodeHeights.ts

import { useEffect, useRef, useState } from 'react';

/**
 * 現在DOM上にあるノードカードの実寸高さを計測する。
 * 毎フレームポーリングする代わりに、実際にサイズが変化した時だけ反応する
 * ResizeObserverを使う（アイドル時のCPU消費を避けるため）。ノードの増減は
 * MutationObserverで検知し、観測対象を追従させる。
 *
 * 計測対象は `id="${idPrefix}${nodeId}"` を持つDOM要素。
 */
export function useNodeHeights(
  zoom: number,
  idPrefix = 'node-',
): Record<string, number> {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const latestRef = useRef<Record<string, number>>({});
  const observedRef = useRef<Set<Element>>(new Set());

  // ズームは値が変わるたびにobserverを張り直す必要はなく（測定値をズームで
  // 割った論理サイズはズーム非依存のため）、計測時に最新値を参照できれば十分
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const applyMeasurement = (element: Element) => {
      const id = element.id.slice(idPrefix.length);
      // 実測値はズームで拡縮された画面上のサイズなので、論理サイズに戻す
      const measuredHeight = Math.round(
        element.getBoundingClientRect().height / zoomRef.current,
      );

      if (measuredHeight > 0 && latestRef.current[id] !== measuredHeight) {
        latestRef.current = { ...latestRef.current, [id]: measuredHeight };
        setHeights(latestRef.current);
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => applyMeasurement(entry.target));
    });

    // 開閉操作でノードカードのDOM要素が増減するたびに、観測対象を同期する
    const syncObservedElements = () => {
      const elements = document.querySelectorAll<HTMLElement>(
        `[id^="${idPrefix}"]`,
      );
      const currentSet = new Set<Element>(elements);

      currentSet.forEach((element) => {
        if (!observedRef.current.has(element)) {
          resizeObserver.observe(element);
          observedRef.current.add(element);
          applyMeasurement(element);
        }
      });

      observedRef.current.forEach((element) => {
        if (!currentSet.has(element)) {
          resizeObserver.unobserve(element);
          observedRef.current.delete(element);
        }
      });
    };

    syncObservedElements();

    const mutationObserver = new MutationObserver(syncObservedElements);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      observedRef.current.clear();
    };
  }, [idPrefix]);

  return heights;
}
