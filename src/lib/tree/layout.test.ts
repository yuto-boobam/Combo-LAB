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

  it('実測高さがあればそれを使い、葉ノードを縦に積み上げてルートを子の中心に合わせる。兄弟間で高さが違う場合は低い方が高い方に合わせてスロット内で中央寄せされる', () => {
    const root = node('root', [node('a'), node('b')]);
    const heights = { root: 80, a: 50, b: 60 };

    const layout = computeTreeLayout(root, new Set(), heights, CONFIG);

    // 子は depthX(1) = rootWidth + gapX = 190 の列に縦積みされる。
    // 兄弟同士のスロット高さは高い方(b:60)に揃うため、aは60pxのスロット内で
    // 中央寄せされ、自分の高さ(50)との差(10)の半分だけ下にずれる
    expect(layout.positions.get('a')).toEqual({ x: 190, y: 15, height: 50 });
    expect(layout.positions.get('b')).toEqual({ x: 190, y: 80, height: 60 });

    // ルートは最初と最後の子の中心 (75) から自分の高さの半分を引いた位置
    expect(layout.positions.get('root')).toEqual({
      x: 0,
      y: 35,
      height: 80,
    });

    expect(layout.width).toBe(190 + CONFIG.cardWidth);
    // 両方とも60pxスロット(120) + ドロップゾーン3枠分(30)
    expect(layout.height).toBe(150);

    expect(layout.dropZones).toEqual([
      { key: 'root-0', parentId: 'root', insertIndex: 0, x: 190, y: 0 },
      { key: 'root-1', parentId: 'root', insertIndex: 1, x: 190, y: 70 },
      { key: 'root-2', parentId: 'root', insertIndex: 2, x: 190, y: 140 },
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

  it('widthsで個別ノードの幅を広げると、その列以降のx座標が広げた分だけ後ろにずれる', () => {
    const root = node('root', [node('a', [node('a1')])]);
    const heights = { root: 80, a: 50, a1: 50 };
    // aの列(深さ1)だけ通常のcardWidth(200)より40px広い240にする
    const widths = { a: 240 };

    const layout = computeTreeLayout(root, new Set(), heights, CONFIG, widths);

    const depth1X = CONFIG.rootWidth + CONFIG.gapX; // 190（列0の幅はrootWidthのまま変わらない）
    const depth2X = depth1X + 240 + CONFIG.gapX; // aの実際の幅(240)ぶんだけ後ろにずれる

    expect(layout.positions.get('a')?.x).toBe(depth1X);
    expect(layout.positions.get('a1')?.x).toBe(depth2X);
    expect(layout.width).toBe(depth2X + CONFIG.cardWidth);
  });

  it('同じ列に幅の異なるノードが混在する場合、その列は最大幅に揃う', () => {
    const root = node('root', [node('a'), node('b')]);
    const heights = { root: 80, a: 50, b: 60 };
    // aだけ広げる。bは指定が無いのでcardWidth(200)のまま
    const widths = { a: 300 };

    const layout = computeTreeLayout(root, new Set(), heights, CONFIG, widths);

    // aとbは同じ列(深さ1)なので、列全体がaの幅(300)に揃う
    expect(layout.width).toBe(CONFIG.rootWidth + CONFIG.gapX + 300);
  });

  it('兄弟の中に極端に背の高いノード(グループピル相当)が混ざっても、各兄弟の中心間隔は均等になる', () => {
    // root -> a(低い) / b(グループピルのように背が高い) / c(低い)
    const root = node('root', [node('a'), node('b'), node('c')]);
    const heights = { root: 80, a: 20, b: 100, c: 20 };

    const layout = computeTreeLayout(root, new Set(), heights, CONFIG);

    const centerOf = (id: string) => {
      const pos = layout.positions.get(id)!;
      return pos.y + pos.height / 2;
    };

    const gapAB = centerOf('b') - centerOf('a');
    const gapBC = centerOf('c') - centerOf('b');

    // 正規化前は bの高さ(100)に押し出されてgapABとgapBCが大きく食い違い、
    // 親からcへの接続線だけ縦距離が伸びて「たるんで」見えていた
    // （ユーザー指摘、2026-08-30）。スロット高さを最大の兄弟(b:100)に揃えることで、
    // 中心間隔がスロット高さ+ドロップゾーン分(100+10=110)で均等になる
    expect(gapAB).toBe(110);
    expect(gapBC).toBe(110);
  });

  it('分岐後は二度と交わらないため、片方の枝が幅広でも、もう片方の枝の子孫の位置には影響しない', () => {
    // root -> a(leaf, 幅広400) / b -> b1(子)
    const root = node('root', [node('a'), node('b', [node('b1')])]);
    const heights = { root: 80, a: 50, b: 50, b1: 50 };
    const widths = { a: 400 };

    const layout = computeTreeLayout(root, new Set(), heights, CONFIG, widths);

    const depth1X = CONFIG.rootWidth + CONFIG.gapX; // 190（root自身の幅のみで決まる）
    expect(layout.positions.get('a')?.x).toBe(depth1X);
    expect(layout.positions.get('b')?.x).toBe(depth1X);

    // b1の位置はbの実幅(既定のcardWidth)だけで決まり、aの幅(400)には引きずられない
    const b1X = depth1X + CONFIG.cardWidth + CONFIG.gapX; // 430
    expect(layout.positions.get('b1')?.x).toBe(b1X);

    // 全体の幅はaの右端(190+400=590)とb1の右端(430+200=630)のうち大きい方
    expect(layout.width).toBe(Math.max(depth1X + 400, b1X + CONFIG.cardWidth));
  });

  it('widthsを省略した場合は従来通りcardWidth/rootWidthのみを使う（後方互換）', () => {
    const root = node('root', [node('a')]);
    const heights = { root: 80, a: 50 };

    const layout = computeTreeLayout(root, new Set(), heights, CONFIG);

    expect(layout.positions.get('a')?.x).toBe(CONFIG.rootWidth + CONFIG.gapX);
    expect(layout.width).toBe(CONFIG.rootWidth + CONFIG.gapX + CONFIG.cardWidth);
  });
});
