import { describe, expect, it } from 'vitest';
import { resolveNodeVisualStyle } from './nodeVisualStyle';
import type { NodeAttribute } from '../types';

const attr = (type: Exclude<NodeAttribute['type'], 'characterLimited' | 'positionLimited' | 'other'>): NodeAttribute => ({
  type,
});

const style = (moveName: string, attributes: NodeAttribute[] = []) =>
  resolveNodeVisualStyle(moveName, attributes);

describe('resolveNodeVisualStyle', () => {
  it('属性なしはすべてデフォルト', () => {
    expect(style('技')).toEqual({
      bodyColorKind: 'default',
      borderColorKind: 'default',
      borderWidth: 'normal',
      borderStyle: 'solid',
      isSituational: false,
    });
  });

  it('ガード単体は本体色がガードになる（枠線は自分の属性では変わらない）', () => {
    const result = style('技', [attr('guard')]);
    expect(result.bodyColorKind).toBe('guard');
    expect(result.borderColorKind).toBe('default');
    expect(result.borderWidth).toBe('normal');
    expect(result.borderStyle).toBe('solid');
  });

  it('空振りは点線枠になり、枠線を太くする（色は自分の属性では変わらない）', () => {
    const result = style('技', [attr('whiff')]);
    expect(result.bodyColorKind).toBe('whiff');
    expect(result.borderColorKind).toBe('default');
    expect(result.borderWidth).toBe('thick');
    expect(result.borderStyle).toBe('dashed');
  });

  it.each(['キャンセルラッシュ', '生ラッシュ'])(
    '技名が「%s」の場合、属性に関わらず本体色が固定で緑（rush）になる',
    (moveName) => {
      expect(style(moveName).bodyColorKind).toBe('rush');
      expect(style(moveName, [attr('guard')]).bodyColorKind).toBe('rush');
      expect(style(moveName, [attr('whiff')]).bodyColorKind).toBe('rush');
    },
  );

  it('技名が「キャンセルラッシュ」の場合のみ、属性に関わらず枠線色（≒接続線色）も固定で緑になる', () => {
    expect(style('キャンセルラッシュ').borderColorKind).toBe('rush');
    // パニッシュカウンターのような優先度の高い属性を持っていても、緑を優先する
    expect(style('キャンセルラッシュ', [attr('punishCounter')]).borderColorKind).toBe('rush');
  });

  it('技名が「生ラッシュ」の場合は、本体色は緑になるが枠線色（≒接続線色）は通常のまま変わらない', () => {
    expect(style('生ラッシュ').borderColorKind).toBe('default');
    expect(style('生ラッシュ', [attr('counter')]).borderColorKind).toBe('counter');
  });

  it('カウンター単体は自分の枠線がカウンター色になる', () => {
    const result = style('技', [attr('counter')]);
    expect(result.borderColorKind).toBe('counter');
    expect(result.borderWidth).toBe('thick');
  });

  it('カウンター かつ パニッシュカウンターの場合はパニッシュカウンターを優先する', () => {
    const result = style('技', [attr('counter'), attr('punishCounter')]);
    expect(result.borderColorKind).toBe('punishCounter');
  });

  it('ラッシュ単体は自分の枠線がラッシュ色になる', () => {
    const result = style('技', [attr('rush')]);
    expect(result.borderColorKind).toBe('rush');
    expect(result.borderWidth).toBe('thick');
  });

  it('ラッシュ かつ カウンターの場合はカウンターを優先する', () => {
    const result = style('技', [attr('rush'), attr('counter')]);
    expect(result.borderColorKind).toBe('counter');
  });

  it('キャラ限定属性は状況限定マークを立てるが、色には影響しない', () => {
    const result = style('技', [{ type: 'characterLimited', note: 'ザンギエフ限定' }]);
    expect(result.isSituational).toBe(true);
    expect(result.bodyColorKind).toBe('default');
    expect(result.borderColorKind).toBe('default');
  });
});
