import { describe, expect, it } from 'vitest';
import { computeTreeLayout } from './layout';
import type { TreeLayoutConfig, TreeNodeLike } from './types';

type Node = TreeNodeLike & { id: string; children: Node[] };

const node = (id: string, children: Node[] = []): Node => ({ id, children });

const CONFIG: TreeLayoutConfig = {
  cardWidth: 200,
  rootWidth: 150,
  gapX: 40,
  dropZoneHeight: 10,
  defaultNodeHeight: 50,
  defaultRootHeight: 80,
};

describe('computeTreeLayout', () => {
  it('ルート単体（子なし）は原点に配置され、既定の高さ・幅を使う', () => {
    const root = node('root');

    const layout = computeTreeLayout(root, new Set(), {}, CONFIG);

    expect(layout.positions.get('root')).toEqual({
      x: 0,
      y: 0,
      height: CONFIG.defaultRootHeight,
    });
    expect(layout.width).toBe(CONFIG.rootWidth);
    expect(layout.height).toBe(CONFIG.defaultRootHeight);
    expect(layout.dropZones).toEqual([]);
  });

  it('実測高さがあればそれを使い、葉ノードを縦に積み上げてルートを子の中心に合わせる', () => {
    const root = node('root', [node('a'), node('b')]);
    const heights = { root: 80, a: 50, b: 60 };

    const layout = computeTreeLayout(root, new Set(), heights, CONFIG);

    // 子は depthX(1) = rootWidth + gapX = 190 の列に縦積みされる
    expect(layout.positions.get('a')).toEqual({ x: 190, y: 10, height: 50 });
    expect(layout.positions.get('b')).toEqual({ x: 190, y: 70, height: 60 });

    // ルートは最初と最後の子の中心 (67.5) から自分の高さの半分を引いた位置
    expect(layout.positions.get('root')).toEqual({
      x: 0,
      y: 27.5,
      height: 80,
    });

    expect(layout.width).toBe(190 + CONFIG.cardWidth);
    expect(layout.height).toBe(140); // 子の合計(110) + ドロップゾーン3枠分(30)

    expect(layout.dropZones).toEqual([
      { key: 'root-0', parentId: 'root', insertIndex: 0, x: 190, y: 0 },
      { key: 'root-1', parentId: 'root', insertIndex: 1, x: 190, y: 60 },
      { key: 'root-2', parentId: 'root', insertIndex: 2, x: 190, y: 130 },
    ]);
  });

  it('閉じているノードの子孫はレイアウト計算から除外される', () => {
    const root = node('root', [node('p', [node('c1'), node('c2')])]);
    const heights = { root: 80, p: 50, c1: 30, c2: 30 };

    const layout = computeTreeLayout(root, new Set(['p']), heights, CONFIG);

    expect(layout.positions.has('c1')).toBe(false);
    expect(layout.positions.has('c2')).toBe(false);
    expect(layout.positions.get('p')).toEqual({ x: 190, y: 15, height: 50 });

    // pの子は無視されるため、rootの直接の子(=p)1個分のドロップゾーンしか作られない
    expect(layout.dropZones).toHaveLength(2);
  });

  it('実測高さが無いノードは既定値(葉:defaultNodeHeight / ルート:defaultRootHeight)にフォールバックする', () => {
    const root = node('root', [node('a')]);

    const layout = computeTreeLayout(root, new Set(), {}, CONFIG);

    expect(layout.positions.get('root')?.height).toBe(
      CONFIG.defaultRootHeight,
    );
    expect(layout.positions.get('a')?.height).toBe(CONFIG.defaultNodeHeight);
  });

  it('3階層以上のツリーでも深さに応じてx座標が積み上がる', () => {
    const root = node('root', [node('a', [node('a1')])]);
    const heights = { root: 80, a: 50, a1: 50 };

    const layout = computeTreeLayout(root, new Set(), heights, CONFIG);

    const depth1X = CONFIG.rootWidth + CONFIG.gapX; // 190
    const depth2X = depth1X + CONFIG.cardWidth + CONFIG.gapX; // 430

    expect(layout.positions.get('a')?.x).toBe(depth1X);
    expect(layout.positions.get('a1')?.x).toBe(depth2X);
    expect(layout.width).toBe(depth2X + CONFIG.cardWidth);
  });
});
