// src/data/tutorialCharacter.test.ts
// チュートリアルの木に埋め込んだ「自動計算：〇〇」という説明文が、実際の計算結果と
// 食い違っていないかを検証する（ブラウザで目視確認ができない環境のための代替チェック）。

import { describe, expect, it } from 'vitest';
import { createTutorialCharacter } from './tutorialCharacter';
import { MOVE_STATS_SEED } from './moveStatsSeed';
import { calculateBranchDamage } from '../utils/comboGaugeCalc';
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
});
