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
      hasDelay: false,
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

  it('技名が「キャンセルラッシュ」の場合のみ、カウンター/パニッシュカウンター属性が無ければ枠線色（≒接続線色）も緑になる', () => {
    expect(style('キャンセルラッシュ').borderColorKind).toBe('rush');
  });

  it('キャンセルラッシュにカウンター/パニッシュカウンター属性を付けると、緑ではなくその色を優先する（「カウンター時にキャンセルラッシュした」を表現するため）', () => {
    expect(style('キャンセルラッシュ', [attr('counter')]).borderColorKind).toBe('counter');
    expect(style('キャンセルラッシュ', [attr('punishCounter')]).borderColorKind).toBe('punishCounter');
    expect(style('キャンセルラッシュ', [attr('counter'), attr('punishCounter')]).borderColorKind).toBe(
      'punishCounter',
    );
    // 本体色は引き続きラッシュの緑のまま（カウンター等はあくまで枠線・接続線だけに影響する）
    expect(style('キャンセルラッシュ', [attr('counter')]).bodyColorKind).toBe('rush');
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

  it('キャラ限定属性は本体色を状況限定（紫）にする', () => {
    const result = style('技', [{ type: 'characterLimited', note: 'ザンギエフ限定' }]);
    expect(result.bodyColorKind).toBe('situational');
    expect(result.borderColorKind).toBe('default');
  });

  it('位置限定属性は本体色を状況限定（紫）にする', () => {
    const result = style('技', [{ type: 'positionLimited', note: '画面端限定' }]);
    expect(result.bodyColorKind).toBe('situational');
  });

  it('situational属性単体でも本体色が状況限定（紫）になる', () => {
    const result = style('技', [attr('situational')]);
    expect(result.bodyColorKind).toBe('situational');
  });

  it('ガード かつ 状況限定の場合はガードを優先する', () => {
    const result = style('技', [attr('guard'), { type: 'characterLimited', note: 'メモ' }]);
    expect(result.bodyColorKind).toBe('guard');
  });

  it('空振り かつ 状況限定の場合は空振りを優先する', () => {
    const result = style('技', [attr('whiff'), { type: 'positionLimited', note: 'メモ' }]);
    expect(result.bodyColorKind).toBe('whiff');
  });

  it('ディレイ属性はhasDelayを立てるが、色には影響しない', () => {
    const result = style('技', [attr('delay')]);
    expect(result.hasDelay).toBe(true);
    expect(result.bodyColorKind).toBe('default');
  });
});
