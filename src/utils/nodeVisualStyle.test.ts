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

  it('ガード単体は本体色がガードになる（枠線は自分の属性では変わらない）', () => {
    const style = resolveNodeVisualStyle([attr('guard')]);
    expect(style.bodyColorKind).toBe('guard');
    expect(style.borderColorKind).toBe('default');
    expect(style.borderWidth).toBe('normal');
    expect(style.borderStyle).toBe('solid');
  });

  it('ガード かつ コンボ締めの場合はガードを優先する', () => {
    const style = resolveNodeVisualStyle([attr('comboEnder'), attr('guard')]);
    expect(style.bodyColorKind).toBe('guard');
  });

  it('空振り かつ コンボ締めの場合は空振りを優先する', () => {
    const style = resolveNodeVisualStyle([attr('comboEnder'), attr('whiff')]);
    expect(style.bodyColorKind).toBe('whiff');
  });

  it('空振りは点線枠になり、枠線を太くする（色は自分の属性では変わらない）', () => {
    const style = resolveNodeVisualStyle([attr('whiff')]);
    expect(style.bodyColorKind).toBe('whiff');
    expect(style.borderColorKind).toBe('default');
    expect(style.borderWidth).toBe('thick');
    expect(style.borderStyle).toBe('dashed');
  });

  it('コンボ締め単体は本体色がコンボ締めになる', () => {
    const style = resolveNodeVisualStyle([attr('comboEnder')]);
    expect(style.bodyColorKind).toBe('comboEnder');
  });

  it('カウンター単体は自分の枠線がカウンター色になる', () => {
    const style = resolveNodeVisualStyle([attr('counter')]);
    expect(style.borderColorKind).toBe('counter');
    expect(style.borderWidth).toBe('thick');
  });

  it('カウンター かつ パニッシュカウンターの場合はパニッシュカウンターを優先する', () => {
    const style = resolveNodeVisualStyle([attr('counter'), attr('punishCounter')]);
    expect(style.borderColorKind).toBe('punishCounter');
  });

  it('キャラ限定属性は状況限定マークを立てるが、色には影響しない', () => {
    const style = resolveNodeVisualStyle([{ type: 'characterLimited', note: 'ザンギエフ限定' }]);
    expect(style.isSituational).toBe(true);
    expect(style.bodyColorKind).toBe('default');
    expect(style.borderColorKind).toBe('default');
  });
});
