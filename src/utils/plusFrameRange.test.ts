import { describe, expect, it } from 'vitest';
import { parsePlusFrameRange } from './plusFrameRange';

describe('parsePlusFrameRange', () => {
  it('単一値をパースする', () => {
    expect(parsePlusFrameRange('+3')).toEqual([3]);
    expect(parsePlusFrameRange('-2')).toEqual([-2]);
  });

  it('半角チルダの範囲をパースする', () => {
    expect(parsePlusFrameRange('+2~+4')).toEqual([2, 3, 4]);
  });

  it('全角チルダの範囲をパースする', () => {
    expect(parsePlusFrameRange('+2〜+4')).toEqual([2, 3, 4]);
  });

  it('逆順表記でも昇順に並べてパースする', () => {
    expect(parsePlusFrameRange('+4~+2')).toEqual([2, 3, 4]);
  });

  it('マイナスを跨ぐ範囲もパースする', () => {
    expect(parsePlusFrameRange('-2~+2')).toEqual([-2, -1, 0, 1, 2]);
  });

  it('空文字はnullを返す', () => {
    expect(parsePlusFrameRange('')).toBeNull();
  });

  it('注釈付きなどパースできない自由記述はnullを返す', () => {
    expect(parsePlusFrameRange('+2~+4(CH時+6)')).toBeNull();
    expect(parsePlusFrameRange('約+3')).toBeNull();
  });
});
