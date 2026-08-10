import { describe, expect, it } from 'vitest';
import { resolveNodeVisualStyle } from './nodeVisualStyle';
import type { NodeAttribute } from '../types';

const attr = (type: Exclude<NodeAttribute['type'], 'characterLimited' | 'positionLimited' | 'other'>): NodeAttribute => ({
  type,
});

describe('resolveNodeVisualStyle', () => {
  it('属性なしはすべてデフォルト', () => {
    expect(resolveNodeVisualStyle([])).toEqual({
      bodyColorKind: 'default',
      borderColorKind: 'default',
      borderWidth: 'normal',
      borderStyle: 'solid',
      isSituational: false,
    });
  });

  it('カウンター単体は本体色がカウンターになる', () => {
    const style = resolveNodeVisualStyle([attr('counter')]);
    expect(style.bodyColorKind).toBe('counter');
  });

  it('カウンター かつ コンボ締めの場合はカウンターを優先する', () => {
    const style = resolveNodeVisualStyle([attr('comboEnder'), attr('counter')]);
    expect(style.bodyColorKind).toBe('counter');
  });

  it('パニッシュカウンター かつ カウンターの場合はパニッシュカウンターを優先する', () => {
    const style = resolveNodeVisualStyle([attr('counter'), attr('punishCounter')]);
    expect(style.bodyColorKind).toBe('punishCounter');
  });

  it('ガードは枠線を太くし、色付きにする', () => {
    const style = resolveNodeVisualStyle([attr('guard')]);
    expect(style.borderColorKind).toBe('guard');
    expect(style.borderWidth).toBe('thick');
    expect(style.borderStyle).toBe('solid');
  });

  it('空振りは点線枠になるが色は変えない', () => {
    const style = resolveNodeVisualStyle([attr('whiff')]);
    expect(style.borderColorKind).toBe('whiff');
    expect(style.borderWidth).toBe('thick');
    expect(style.borderStyle).toBe('dashed');
  });

  it('キャラ限定属性は状況限定マークを立てるが、色には影響しない', () => {
    const style = resolveNodeVisualStyle([{ type: 'characterLimited', note: 'ザンギエフ限定' }]);
    expect(style.isSituational).toBe(true);
    expect(style.bodyColorKind).toBe('default');
    expect(style.borderColorKind).toBe('default');
  });
});
