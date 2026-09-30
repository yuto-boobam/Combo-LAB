// src/lib/tree/connectorPath.test.ts
// computeElbowWaypoints/computeConnectorPathの幾何的な性質をテストする。
// ベジェ曲線時代に「線がたるんで見える」不具合が2回報告されていた（2026-08-30、
// 2026-09-30）。エルボー型コネクタ（水平→角丸→垂直→角丸→水平）は縦区間が
// まっすぐな直線のため構造的にたるみが発生しえないが、その前提（各区間の長さが
// 負にならない・XがstartからendまでYがstartからendまで単調に進む）を具体的な
// 数値で固定しておく

import { describe, expect, it } from 'vitest';
import { computeConnectorPath, computeElbowWaypoints } from './connectorPath';

describe('computeElbowWaypoints', () => {
  it('X座標は常にstart→endの範囲内で単調に増加する（後戻り・追い越しが無い）', () => {
    for (const dx of [1, 10, 24, 40, 80]) {
      for (const dy of [-300, -30, 0.1, 30, 300]) {
        const w = computeElbowWaypoints({ x: 0, y: 0 }, { x: dx, y: dy });
        const xs = [w.start.x, w.beforeCorner1.x, w.corner1.x, w.afterCorner1.x, w.beforeCorner2.x, w.corner2.x, w.afterCorner2.x, w.end.x];
        for (let i = 1; i < xs.length; i += 1) {
          expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 1e-9);
        }
        expect(xs[0]).toBe(0);
        expect(xs[xs.length - 1]).toBe(dx);
      }
    }
  });

  it('Y座標は常にstart→endの範囲内に収まる（垂直区間はまっすぐな直線なので、たるみが原理的に発生しない）', () => {
    for (const dx of [1, 10, 24, 40, 80]) {
      for (const dy of [-300, -30, 30, 300]) {
        const w = computeElbowWaypoints({ x: 0, y: 0 }, { x: dx, y: dy });
        const [lo, hi] = dy >= 0 ? [0, dy] : [dy, 0];
        for (const p of [w.beforeCorner1, w.corner1, w.afterCorner1, w.beforeCorner2, w.corner2, w.afterCorner2]) {
          expect(p.y).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(p.y).toBeLessThanOrEqual(hi + 1e-9);
        }
        // 垂直区間の始点は必ず終点より「startに近い側」にある
        if (dy >= 0) {
          expect(w.afterCorner1.y).toBeLessThanOrEqual(w.beforeCorner2.y + 1e-9);
        } else {
          expect(w.afterCorner1.y).toBeGreaterThanOrEqual(w.beforeCorner2.y - 1e-9);
        }
      }
    }
  });

  it('列間隔が狭い（dxが小さい）場合でも角丸半径が区間長を超えず、区間が負の長さにならない', () => {
    // ComboTreePage.config.tsのgapX=24pxのような、このアプリで実際に起きる狭いdx
    for (const dx of [1, 4, 10, 24]) {
      const w = computeElbowWaypoints({ x: 0, y: 0 }, { x: dx, y: 200 }, 8);
      expect(w.beforeCorner1.x).toBeGreaterThanOrEqual(0);
      expect(w.afterCorner2.x).toBeLessThanOrEqual(dx);
      expect(w.afterCorner1.y).toBeLessThanOrEqual(w.beforeCorner2.y);
    }
  });

  it('縦距離が角丸半径の2倍以下でも、上下の角丸が完全にくっつかず、わずかでも垂直の直線区間が残る', () => {
    // 2026-09-30ユーザー報告の再現ケース：インパクト→前ステップのように、ほぼ同じ高さ
    // だが完全に同じ高さではない（dy>0.5）兄弟ノードへのリンク。半径が大きすぎると
    // afterCorner1.y === beforeCorner2.y になり、上下の角丸がそのまま1本のなめらかな
    // S字曲線としてつながって見えてしまう（デフォルト半径8pxの時に実際に起きていた：
    // dx=46,dy=15だとr=min(8,23,7.5)=7.5で、2r=15=dyとなり垂直区間の長さがちょうど0になる）
    const w = computeElbowWaypoints({ x: 0, y: 0 }, { x: 46, y: 15 });
    expect(w.beforeCorner2.y - w.afterCorner1.y).toBeGreaterThan(0);
  });

  it('デフォルトの角丸半径は、縦距離がその2倍程度の浅い分岐でも垂直の直線区間を残せるくらい小さい', () => {
    // 半径をどれだけ小さくしたかを具体的な数値で固定し、将来大きく戻されて
    // 上のケースが再発しないようにする
    for (const dy of [10, 16, 20, 30]) {
      const w = computeElbowWaypoints({ x: 0, y: 0 }, { x: 60, y: dy });
      expect(w.beforeCorner2.y - w.afterCorner1.y).toBeGreaterThan(0);
    }
  });
});

describe('computeConnectorPath', () => {
  it('縦距離がほぼ無いリンクは角を作らずただの水平線になる', () => {
    expect(computeConnectorPath({ x: 0, y: 50 }, { x: 100, y: 50 })).toBe('M 0 50 L 100 50');
  });

  it('通常のリンクは M...L...Q...L...Q...L の形（水平→角丸→垂直→角丸→水平）になる', () => {
    const d = computeConnectorPath({ x: 0, y: 0 }, { x: 24, y: 30 });
    expect(d.startsWith('M 0 0 L')).toBe(true);
    expect(d).toContain(' Q ');
    expect(d.endsWith('L 24 30')).toBe(true);
  });
});
