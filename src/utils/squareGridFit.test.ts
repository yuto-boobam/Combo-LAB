import { describe, expect, it } from 'vitest';
import { computeSquareGridFit } from './squareGridFit';

describe('computeSquareGridFit', () => {
  it('31枠が横1900x縦900のような横長画面でも、はみ出さずに収まる', () => {
    const containerWidth = 1900;
    const containerHeight = 900;
    const count = 31;
    const gap = 8;

    const { columns, cellSize } = computeSquareGridFit(containerWidth, containerHeight, count, gap);
    const rows = Math.ceil(count / columns);

    expect(cellSize).toBeGreaterThan(0);
    expect(columns * cellSize + gap * (columns - 1)).toBeLessThanOrEqual(containerWidth + 0.001);
    expect(rows * cellSize + gap * (rows - 1)).toBeLessThanOrEqual(containerHeight + 0.001);
  });

  it('画面を半分のサイズに縮めても、はみ出さない計算結果になる', () => {
    const count = 31;
    const gap = 8;
    const full = computeSquareGridFit(1900, 900, count, gap);
    const half = computeSquareGridFit(950, 450, count, gap);

    const halfRows = Math.ceil(count / half.columns);

    expect(half.cellSize).toBeGreaterThan(0);
    expect(half.cellSize).toBeLessThan(full.cellSize);
    expect(half.columns * half.cellSize + gap * (half.columns - 1)).toBeLessThanOrEqual(950.001);
    expect(halfRows * half.cellSize + gap * (halfRows - 1)).toBeLessThanOrEqual(450.001);
  });

  it('コンテナが0サイズなら列数1・サイズ0を返す（描画前のガード用）', () => {
    expect(computeSquareGridFit(0, 0, 31, 8)).toEqual({ columns: 1, cellSize: 0 });
  });

  it('カード数0なら列数1・サイズ0を返す', () => {
    expect(computeSquareGridFit(1000, 800, 0, 8)).toEqual({ columns: 1, cellSize: 0 });
  });
});
