// src/lib/tree/connectorPath.ts
// ConnectionsOverlay.tsxが親→子のリンクを描く「角丸のエルボー型コネクタ」の経路計算。
// DOM/SVGに依存しない純粋な計算だけを切り出してあるので、ここだけ単体テストできる
// （connectorPath.test.ts参照）。
//
// 以前は滑らかな3次ベジェ曲線で描いていたが、「線がたるんで見える」という報告が
// 2度あり（2026-08-30、2026-09-30）、制御点の位置を調整する対症療法では
// 再発を繰り返していた（横距離に対して縦距離が大きいリンクほど、曲線の描き方次第で
// 必ずどこかに「垂れ下がって見える」余地が残ってしまう）。2026-09-30ユーザー承認のもと、
// 曲線そのものをやめて「水平→（角丸）→垂直→（角丸）→水平」の折れ線（エルボー型
// コネクタ、フローチャートでよく使われる形）に変更した。縦区間はまっすぐな直線のため、
// 構造的に「たるみ」が発生しえない。
export type Point = { x: number; y: number };

/**
 * 角の丸め半径のデフォルト値(px)。列間隔・縦距離が狭い場合は自動的に縮小される
 * （下記r参照）が、それでも半径8pxは大きすぎた。縦距離(dy)が半径の2倍以下だと、
 * 上下2つの角丸が真ん中で完全に接し、垂直区間の長さがゼロになる
 * （r = min(radius, dy/2) なので、dy <= 2*radius だと afterCorner1.y === beforeCorner2.y）。
 * すると上下2つの丸い角がそのまま1本のなめらかなS字曲線につながって見え、せっかく
 * 直線の垂直区間を持つエルボー型に変えたのに、結局ベジェ曲線と見分かがつかない
 * 「たるみ」に戻って見えてしまっていた（2026-09-30ユーザー再報告：「中央のノードへの
 * 接続線がたるむ」で発覚。兄弟ノードがほぼ同じ高さ＝dyが小さいリンクで特に顕著だった）。
 * 半径を小さくして、dyが多少小さくても垂直区間が消えずに残るようにする
 */
const DEFAULT_CORNER_RADIUS = 4;

export type ElbowWaypoints = {
  start: Point;
  /** 1つ目の角丸に入る直前（水平区間の終点） */
  beforeCorner1: Point;
  /** 1つ目の角の頂点そのもの（丸め用の制御点として使う） */
  corner1: Point;
  /** 1つ目の角丸を抜けた直後（垂直区間の始点） */
  afterCorner1: Point;
  /** 2つ目の角丸に入る直前（垂直区間の終点） */
  beforeCorner2: Point;
  /** 2つ目の角の頂点そのもの（丸め用の制御点として使う） */
  corner2: Point;
  /** 2つ目の角丸を抜けた直後（水平区間の始点） */
  afterCorner2: Point;
  end: Point;
};

/**
 * start→endを「水平→角丸→垂直→角丸→水平」で結ぶ経路の主要な頂点を計算する。
 * 角丸の半径は、水平区間（横距離の半分ずつ）・垂直区間（縦距離の半分ずつ）の
 * どちらよりも大きくならないようクランプする（列間隔が狭い場合や縦距離がごく
 * 小さい場合でも、区間の長さがマイナスにならず経路が破綻しないようにするため）
 */
export function computeElbowWaypoints(
  start: Point,
  end: Point,
  cornerRadius: number = DEFAULT_CORNER_RADIUS,
): ElbowWaypoints {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const midX = start.x + dx / 2;
  const r = Math.max(0, Math.min(cornerRadius, Math.abs(dx) / 2, Math.abs(dy) / 2));
  const verticalDirection = dy >= 0 ? 1 : -1;

  return {
    start,
    beforeCorner1: { x: midX - r, y: start.y },
    corner1: { x: midX, y: start.y },
    afterCorner1: { x: midX, y: start.y + r * verticalDirection },
    beforeCorner2: { x: midX, y: end.y - r * verticalDirection },
    corner2: { x: midX, y: end.y },
    afterCorner2: { x: midX + r, y: end.y },
    end,
  };
}

/**
 * 実際にSVGの<path d>に渡す文字列を組み立てる。startとendの高さがほぼ同じ（同じ行の
 * 隣同士）場合は角を作らずただの水平線にする（角丸を挟む意味が無く、わずかな誤差で
 * 不要な微小カーブが出るのを避けるため）
 */
export function computeConnectorPath(start: Point, end: Point, cornerRadius: number = DEFAULT_CORNER_RADIUS): string {
  if (Math.abs(end.y - start.y) < 0.5 || end.x <= start.x) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  const w = computeElbowWaypoints(start, end, cornerRadius);

  return [
    `M ${w.start.x} ${w.start.y}`,
    `L ${w.beforeCorner1.x} ${w.beforeCorner1.y}`,
    `Q ${w.corner1.x} ${w.corner1.y} ${w.afterCorner1.x} ${w.afterCorner1.y}`,
    `L ${w.beforeCorner2.x} ${w.beforeCorner2.y}`,
    `Q ${w.corner2.x} ${w.corner2.y} ${w.afterCorner2.x} ${w.afterCorner2.y}`,
    `L ${w.end.x} ${w.end.y}`,
  ].join(' ');
}
