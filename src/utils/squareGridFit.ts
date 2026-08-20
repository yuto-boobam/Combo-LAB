// src/utils/squareGridFit.ts
// count個の正方形カードを、gap込みでcontainerWidth×containerHeightにぴったり収める
// 列数・1辺のサイズを求める（全列数候補を試し、1辺が最大になるものを選ぶ）。
// キャラ選択画面のカードグリッドで、ウィンドウサイズが変わっても全枠がスクロールなしで
// 収まるようにするために使う（src/pages/CharacterSelectPage.tsx 参照）。

export function computeSquareGridFit(
  containerWidth: number,
  containerHeight: number,
  count: number,
  gap: number,
): { columns: number; cellSize: number } {
  let best = { columns: 1, cellSize: 0 };
  if (count === 0 || containerWidth <= 0 || containerHeight <= 0) return best;

  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const cellW = (containerWidth - gap * (columns - 1)) / columns;
    const cellH = (containerHeight - gap * (rows - 1)) / rows;
    const cellSize = Math.min(cellW, cellH);
    if (cellSize > best.cellSize) best = { columns, cellSize };
  }
  return best;
}
