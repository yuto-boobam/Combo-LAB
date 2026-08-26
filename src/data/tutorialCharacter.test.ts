// src/data/tutorialCharacter.test.ts
// チュートリアルの木に埋め込んだ「自動計算：〇〇」という説明文が、実際の計算結果と
// 食い違っていないかを検証する（ブラウザで目視確認ができない環境のための代替チェック）。

import { describe, expect, it } from 'vitest';
import { createTutorialCharacter } from './tutorialCharacter';
import { MOVE_STATS_SEED } from './moveStatsSeed';
import { calculateBranchDamage, calculateBranchOpponentDGaugeChip } from '../utils/comboGaugeCalc';
import { collectChain, findMatchingChains } from '../utils/chainMatch';
import type { ComboTree } from '../types';

function treeByLabel(trees: ComboTree[], label: string): ComboTree {
  const found = trees.find((tree) => tree.label === label);
  if (!found) throw new Error(`tree not found: ${label}`);
  return found;
}

describe('チュートリアルキャラクターの自動計算', () => {
  const character = createTutorialCharacter();
  const moveStatsDatabase = MOVE_STATS_SEED;

  it('②500ダメージを3回繋げると、コンボ補正で3発目だけ減衰し合計1400になる', () => {
    const tree = treeByLabel(character.comboTrees, '②ダメージは自動計算');
    const leaf = tree.root.children[0].children[0];

    expect(
      calculateBranchDamage(character.id, moveStatsDatabase, character.moveList, tree.root, leaf.id),
    ).toBe(1400);
  });

  it('④木を編集しなくても、選んだだけで追加の要素ぶんの計算結果が合成される', () => {
    const tree = treeByLabel(character.comboTrees, '④木を触らず要素を合成');

    // 反撃の技(200) + とどめの一撃(3000、標準テーブル先頭の100%が2発目まで続くためどちらも満額) = 3200
    expect(
      calculateBranchDamage(
        character.id,
        moveStatsDatabase,
        character.moveList,
        tree.root,
        tree.root.id,
      ),
    ).toBe(3200);

    expect(
      calculateBranchOpponentDGaugeChip(
        character.id,
        moveStatsDatabase,
        character.moveList,
        tree.root,
        tree.root.id,
      ),
    ).toBe(-2000);

    // 実データ（木）自体は「反撃の技」1ノードのままで、SAノードを追加していないことの確認
    expect(tree.root.children).toHaveLength(0);
  });

  it('⑤あえてグループ化していない2箇所の共通区間を、一致検索で見つけられる', () => {
    const treeA = treeByLabel(character.comboTrees, '⑤一致検索(配置A)');
    const treeB = treeByLabel(character.comboTrees, '⑤一致検索(配置B)');

    const anchor = treeA.root.children[0]; // 共通の技イ
    const patternChain = collectChain(anchor, 2);
    expect(patternChain).not.toBeNull();

    const matches = findMatchingChains(character.comboTrees, patternChain!);

    // 配置A自身の起点と、配置Bの同じ並びの起点の、合計2箇所が見つかる
    expect(matches).toContain(anchor.id);
    expect(matches).toContain(treeB.root.children[0].id);
    expect(matches).toHaveLength(2);
  });
});
