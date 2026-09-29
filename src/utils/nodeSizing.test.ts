// src/utils/nodeSizing.test.ts

import { describe, expect, it } from 'vitest';
import { nodeWidthFor, NODE_WIDTH } from './nodeSizing';
import type { MoveNode } from '../types';

function makeNode(overrides: Partial<MoveNode> = {}): MoveNode {
  return {
    id: 'n',
    moveName: '弱P',
    attributes: [],
    specialNote: '',
    branchStats: null,
    createdBy: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    children: [],
    ...overrides,
  };
}

describe('nodeWidthFor', () => {
  it('短い技名は基本サイズ(NODE_WIDTH)のまま', () => {
    expect(nodeWidthFor(makeNode({ moveName: '弱P' }))).toBe(NODE_WIDTH);
  });

  it('基本サイズに収まらない長い技名は、収まるだけ幅が広がる', () => {
    const width = nodeWidthFor(makeNode({ moveName: 'ODグラン・フェッチ' }));
    expect(width).toBeGreaterThan(NODE_WIDTH);
  });

  it('同じ技名でも短い呼び名(displayName)が設定されていれば、そちらを基準に幅を計算する', () => {
    const withoutDisplayName = nodeWidthFor(makeNode({ moveName: 'ODグラン・フェッチ' }));
    const withDisplayName = nodeWidthFor(
      makeNode({ moveName: 'ODグラン・フェッチ', displayName: '弱P' }),
    );
    expect(withDisplayName).toBe(NODE_WIDTH);
    expect(withDisplayName).toBeLessThan(withoutDisplayName);
  });

  it('「｜」で手動改行した技名は、各行のうち最も幅が必要な行だけを基準にする（全体の長さでは広がらない）', () => {
    // 「あいうえおかきくけこ」を丸ごと1行に収める場合に必要な幅より、
    // 「｜」で2行に分けた場合の方が狭くなるはず
    const oneLine = nodeWidthFor(makeNode({ moveName: 'あいうえおかきくけこ' }));
    const twoLines = nodeWidthFor(makeNode({ moveName: 'あいうえお｜かきくけこ' }));
    expect(twoLines).toBeLessThan(oneLine);
  });

  it('特殊記入(specialNote)があるノードは、可変後の幅にさらに追加幅が乗る', () => {
    const withoutNote = nodeWidthFor(makeNode({ moveName: 'ODグラン・フェッチ' }));
    const withNote = nodeWidthFor(makeNode({ moveName: 'ODグラン・フェッチ', specialNote: 'ディレイ2F' }));
    expect(withNote).toBeGreaterThan(withoutNote);
  });

  it('チュートリアル用ノード(id: "tut-node-"始まり)は追加幅が乗る', () => {
    const normal = nodeWidthFor(makeNode({ id: 'n', moveName: '弱P' }));
    const tutorial = nodeWidthFor(makeNode({ id: 'tut-node-1', moveName: '弱P' }));
    expect(tutorial).toBeGreaterThan(normal);
  });
});
