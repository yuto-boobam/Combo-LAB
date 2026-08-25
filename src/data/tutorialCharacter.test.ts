// src/data/tutorialCharacter.test.ts
// チュートリアルの木に埋め込んだ「自動計算：〇〇」という説明文が、実際の計算結果と
// 食い違っていないかを検証する（ブラウザで目視確認ができない環境のための代替チェック）。

import { describe, expect, it } from 'vitest';
import { createTutorialCharacter } from './tutorialCharacter';
import { MOVE_STATS_SEED } from './moveStatsSeed';
import {
  calculateBranchDamage,
  calculateBranchOpponentDGaugeChip,
} from '../utils/comboGaugeCalc';
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

  it('④OD版に切り替えると、参照する技データが変わる（通常400/OD版600）', () => {
    const tree = treeByLabel(character.comboTrees, '④OD版に切り替え');
    const normalDamage = calculateBranchDamage(
      character.id,
      moveStatsDatabase,
      character.moveList,
      tree.root,
      tree.root.id,
    );

    const odRoot = { ...tree.root, usesOD: true };
    const odDamage = calculateBranchDamage(
      character.id,
      moveStatsDatabase,
      character.moveList,
      odRoot,
      odRoot.id,
    );

    expect(normalDamage).toBe(400);
    expect(odDamage).toBe(600);
  });

  it('⑤ラッシュ後の一撃は0.85倍の補正がかかる（始動技自体はラッシュではないため発生する）', () => {
    const tree = treeByLabel(character.comboTrees, '⑤ラッシュで0.85倍');
    const rushHit = tree.root.children[0]; // 生ラッシュ
    const afterRush = rushHit.children[0]; // 追撃

    expect(rushHit.moveName).toBe('生ラッシュ');
    expect(afterRush.moveName).toBe('追撃');

    // 追撃(800)は起点でないため自然減衰(100%)にラッシュ0.85倍がかかり680になる
    expect(
      calculateBranchDamage(
        character.id,
        moveStatsDatabase,
        character.moveList,
        tree.root,
        afterRush.id,
      ),
    ).toBe(200 + 0 + 680);
  });

  it('⑥SAで締めると、木にSAノードを追加しなくてもそのぶんのダメージが合成される', () => {
    const tree = treeByLabel(character.comboTrees, '⑥SAで締めくくる');

    // SA前の技(200) + とどめSA(3000、標準テーブル先頭の100%が2発目まで続くためどちらも満額) = 3200
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
  });

  it('⑦ジャストパリィ始動は60%スタートのまま自然減衰が半分になり60%→40%→35%で推移する', () => {
    const tree = treeByLabel(character.comboTrees, '⑦ジャストパリィ始動');
    const leaf = tree.root.children[0].children[0];

    // 1発目: 300×60%=180 / 2発目: 300×40%=120(始動補正20%を直接引くだけ) /
    // 3発目: 1200×35%=420(自然減衰が半分の-5だけ) 合計720
    expect(
      calculateBranchDamage(character.id, moveStatsDatabase, character.moveList, tree.root, leaf.id),
    ).toBe(720);
  });
});
