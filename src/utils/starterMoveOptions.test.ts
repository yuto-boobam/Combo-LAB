// src/utils/starterMoveOptions.test.ts

import { describe, expect, it } from 'vitest';
import {
  parseStarterMoveOptionsText,
  parseStarterMoveToken,
  serializeStarterMoveOptions,
} from './starterMoveOptions';

describe('parseStarterMoveOptionsText', () => {
  it('改行区切りで複数の候補（各1技）をパースする', () => {
    expect(parseStarterMoveOptionsText('弱P\n弱K\n強P')).toEqual([['弱P'], ['弱K'], ['強P']]);
  });

  it('カンマ・「、」区切りにも対応する', () => {
    expect(parseStarterMoveOptionsText('弱P, 弱K、強P')).toEqual([['弱P'], ['弱K'], ['強P']]);
  });

  it('「→」で繋いだ候補は、2技以上から成る1つの並びとしてパースする（ジャンプ攻撃始動など）', () => {
    expect(parseStarterMoveOptionsText('弱P\nJ強K→強P')).toEqual([['弱P'], ['J強K', '強P']]);
  });

  it('半角矢印「->」にも対応する', () => {
    expect(parseStarterMoveOptionsText('J強K->強P')).toEqual([['J強K', '強P']]);
  });

  it('空行・前後の空白・空の候補は無視する', () => {
    expect(parseStarterMoveOptionsText('\n 弱P \n\n , 弱K ,\n')).toEqual([['弱P'], ['弱K']]);
  });

  it('空文字を渡すと空配列を返す', () => {
    expect(parseStarterMoveOptionsText('')).toEqual([]);
  });

  it('「/」で並べた技は、その段の数だけ独立した候補に展開する（例: J攻撃→強P/4強P/2強P）', () => {
    expect(parseStarterMoveOptionsText('J攻撃→強P/4強P/2強P')).toEqual([
      ['J攻撃', '強P'],
      ['J攻撃', '4強P'],
      ['J攻撃', '2強P'],
    ]);
  });

  it('複数の段それぞれに「/」がある場合は、全ての組み合わせ(直積)に展開する', () => {
    expect(parseStarterMoveOptionsText('J弱K/J強K→強P/4強P')).toEqual([
      ['J弱K', '強P'],
      ['J弱K', '4強P'],
      ['J強K', '強P'],
      ['J強K', '4強P'],
    ]);
  });

  it('「/」展開と改行区切りの複数候補を同時に使える', () => {
    expect(parseStarterMoveOptionsText('弱P\nJ攻撃→強P/4強P')).toEqual([
      ['弱P'],
      ['J攻撃', '強P'],
      ['J攻撃', '4強P'],
    ]);
  });

  it('括弧の中の「/」は候補展開用としては扱わず、1つのトークンとして温存する（条件指定「PC/R」用）', () => {
    expect(parseStarterMoveOptionsText('強昇竜拳（PC/R）')).toEqual([['強昇竜拳（PC/R）']]);
  });

  it('条件付きの技を経由する並び（例:「強K（PC）->強P」）も、括弧を含んだまま2段の並びとしてパースする', () => {
    expect(parseStarterMoveOptionsText('強K（PC）->強P')).toEqual([['強K（PC）', '強P']]);
  });

  it('括弧付きの技名と、別の候補としての「/」展開を同時に使える', () => {
    expect(parseStarterMoveOptionsText('強P（C）/4強P（PC/R）')).toEqual([
      ['強P（C）'],
      ['4強P（PC/R）'],
    ]);
  });
});

describe('parseStarterMoveToken', () => {
  it('括弧が無ければ技名のみ・属性は空', () => {
    expect(parseStarterMoveToken('強昇竜拳')).toEqual({ moveName: '強昇竜拳', attributes: [] });
  });

  it('「技名（C）」はカウンター属性を返す', () => {
    expect(parseStarterMoveToken('強昇竜拳（C）')).toEqual({
      moveName: '強昇竜拳',
      attributes: [{ type: 'counter' }],
    });
  });

  it('「技名（PC/R）」はパニッシュカウンター・ラッシュの両方の属性を返す', () => {
    expect(parseStarterMoveToken('強昇竜拳（PC/R）')).toEqual({
      moveName: '強昇竜拳',
      attributes: [{ type: 'punishCounter' }, { type: 'rush' }],
    });
  });

  it('半角括弧にも対応する', () => {
    expect(parseStarterMoveToken('強昇竜拳(PC)')).toEqual({
      moveName: '強昇竜拳',
      attributes: [{ type: 'punishCounter' }],
    });
  });

  it('技名を伴わず条件コードだけの場合、moveNameは空文字で条件だけを返す（技を問わず条件のみで繋がる）', () => {
    expect(parseStarterMoveToken('PC')).toEqual({ moveName: '', attributes: [{ type: 'punishCounter' }] });
    expect(parseStarterMoveToken('R')).toEqual({ moveName: '', attributes: [{ type: 'rush' }] });
    expect(parseStarterMoveToken('PC/R')).toEqual({
      moveName: '',
      attributes: [{ type: 'punishCounter' }, { type: 'rush' }],
    });
  });

  it('未知のコードは無視する', () => {
    expect(parseStarterMoveToken('強昇竜拳（X）')).toEqual({ moveName: '強昇竜拳', attributes: [] });
  });
});

describe('serializeStarterMoveOptions', () => {
  it('各候補を1行にし、複数技の並びは「→」で繋ぐ（parseStarterMoveOptionsTextの逆変換）', () => {
    const options = [['弱P'], ['弱K'], ['J強K', '強P']];
    const text = serializeStarterMoveOptions(options);
    expect(text).toBe('弱P\n弱K\nJ強K→強P');
    expect(parseStarterMoveOptionsText(text)).toEqual(options);
  });

  it('空配列を渡すと空文字を返す', () => {
    expect(serializeStarterMoveOptions([])).toBe('');
  });
});
