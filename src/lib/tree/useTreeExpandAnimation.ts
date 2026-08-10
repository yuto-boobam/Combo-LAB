// src/lib/tree/useTreeExpandAnimation.ts

import { useEffect, useRef, useState } from 'react';
import type { NodePosition, TreeLayout } from './types';
import { findConvergenceTarget } from './treeUtils';

/**
 * ノードの開閉によって「新しく現れる/消えていく」ノードの座標を追跡し、
 * 開くノードは親の位置から、閉じるノードは閉じた親の位置へ吸い込まれる
 * ようにアニメーションさせるためのフック。
 *
 * - exitingNodes: 消えていく途中（フェードアウト中）のノードの座標
 * - enteringNodes: 現れた直後（出発位置から最終位置へ滑る途中）のノードの座標
 */
export function useTreeExpandAnimation(
  layout: TreeLayout | null,
  parentOf: Map<string, string>,
  exitTransitionMs: number,
): {
  exitingNodes: Map<string, NodePosition>;
  enteringNodes: Map<string, NodePosition>;
} {
  const prevVisibleIdsRef = useRef<Set<string>>(new Set());
  const prevPositionsRef = useRef<Map<string, NodePosition>>(new Map());
  const prevExitingNodesRef = useRef<Map<string, NodePosition>>(new Map());
  const [exitingNodes, setExitingNodes] = useState<Map<string, NodePosition>>(
    new Map(),
  );
  const [enteringNodes, setEnteringNodes] = useState<
    Map<string, NodePosition>
  >(new Map());

  // ── 開閉アニメーションが仕掛けるタイマーを、アンマウント時にまとめて解除するための管理。
  // ※ rAFはここでは追跡しない。開発時のStrictModeはマウント時に
  //   「エフェクト実行→クリーンアップ→再実行」を行うが、rafを共有refで
  //   キャンセルしてしまうと、この2段構えのrAFが本来の再実行より先に
  //   打ち切られ、enteringNodesのエントリが永久に残ってしまう不具合があった
  //   （2回目の実行はprevVisibleIdsRef等が既に更新済みのため何もしない）。
  //   代わりにisMountedRefで「本当のアンマウント後だけsetStateを避ける」方式にする。
  const pendingTimersRef = useRef<{ timeouts: Set<number> }>({
    timeouts: new Set(),
  });
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const pendingTimers = pendingTimersRef.current;

    return () => {
      isMountedRef.current = false;
      pendingTimers.timeouts.forEach((id) => window.clearTimeout(id));
      pendingTimers.timeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (!layout) return;

    const currentIds = new Set(layout.positions.keys());
    const previousIds = prevVisibleIdsRef.current;
    const framePositions = prevPositionsRef.current;

    const removedIds = Array.from(previousIds).filter(
      (id) => !currentIds.has(id),
    );
    const addedIds = Array.from(currentIds).filter(
      (id) => !previousIds.has(id),
    );

    // 消えていく途中のノードの収束先を更新する。
    // 閉じた直後の1フレーム目はまだ実測高さが揺れていて親の位置が暫定値のことがあるため、
    // 新規に消えたノードだけでなく、フェード中の既存ノードもレイアウトが変わるたびに
    // 収束先を追従・補正し続ける（最終的に親の落ち着き先へ正しく吸い込まれる）。
    // ※ refの更新はsetStateの更新関数の外（このeffect本体）で行い、更新関数自体は
    //   Reactが期待する「副作用を持たない」ものに保つ。
    if (removedIds.length > 0 || prevExitingNodesRef.current.size > 0) {
      const next = new Map(prevExitingNodesRef.current);

      removedIds.forEach((id) => {
        // 生き残っている祖先（＝閉じたノード自身）の現在位置に向けて吸い込む。
        // 見つからない場合は消える直前の位置に留めてフェードのみ行う。
        const pos =
          findConvergenceTarget(id, parentOf, layout.positions) ??
          framePositions.get(id);
        if (pos) next.set(id, pos);
      });

      next.forEach((_, id) => {
        const pos = findConvergenceTarget(id, parentOf, layout.positions);
        if (pos) next.set(id, pos);
      });

      prevExitingNodesRef.current = next;
      setExitingNodes(next);
    }

    if (removedIds.length > 0) {
      const timeoutId = window.setTimeout(() => {
        pendingTimersRef.current.timeouts.delete(timeoutId);

        if (removedIds.every((id) => !prevExitingNodesRef.current.has(id))) {
          return;
        }

        const next = new Map(prevExitingNodesRef.current);
        removedIds.forEach((id) => next.delete(id));
        prevExitingNodesRef.current = next;
        setExitingNodes(next);
      }, exitTransitionMs);

      pendingTimersRef.current.timeouts.add(timeoutId);
    }

    if (addedIds.length > 0) {
      setEnteringNodes((prev) => {
        const next = new Map(prev);
        addedIds.forEach((id) => {
          const parentId = parentOf.get(id);
          const spawnPos =
            (parentId ? framePositions.get(parentId) : undefined) ??
            layout.positions.get(id) ??
            null;
          if (spawnPos) next.set(id, spawnPos);
        });
        return next;
      });

      // ブラウザが「出発位置」を一度描画してから最終位置へ切り替える
      // （1回のrAFだと描画前に上書きされることがあるため2段構えにする）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!isMountedRef.current) return;

          setEnteringNodes((prev) => {
            if (addedIds.every((id) => !prev.has(id))) return prev;
            const next = new Map(prev);
            addedIds.forEach((id) => next.delete(id));
            return next;
          });
        });
      });
    }

    prevVisibleIdsRef.current = currentIds;
    prevPositionsRef.current = layout.positions;
  }, [layout, parentOf, exitTransitionMs]);

  return { exitingNodes, enteringNodes };
}
