// src/data/tutorialCharacter.ts
// ポートフォリオ閲覧者向けの「使い方ガイド」専用キャラクター。専門的なアプリなので、
// 実キャラのコンボを触ってもらうだけでは「何ができるか」が伝わりにくい。技名そのものを
// 説明文にした木を用意し、触りながら機能を理解してもらうことが目的。
//
// このキャラクターはstore.ts側でstate.charactersに混ぜて保持しつつ、localStorageへの
// 保存対象からは除外し、アプリ読み込みのたびにこの関数で作り直す（＝ゲストで編集しても
// 次に開いた時には元に戻る）。ComboTreePage/SideDrawerPanel側では、このキャラIDの時だけ
// ゲストモードでも編集可能にする例外を入れている（詳細はTUTORIAL_CHARACTER_IDの参照元）。
//
// ノードの技名は「キャンセルラッシュ」「生ラッシュ」のようなシステム側が文字列で判定する
// 名前・OD版データの参照キー（applyOdVariantLookup）・SA名の一致（cancelableSuperArtNames/
// finishingSuperArtName）と、必ず1文字も違わず一致させる必要がある。説明文はmoveNameに
// 詰め込まず specialNote（ノード下の小さな注記）側に書く。

import type { Character, ComboBranchStats, MoveDefinition, MoveNode } from '../types';
import { DEFAULT_BRANCH_STATS } from '../utils/branchStatsDefaults';

export const TUTORIAL_CHARACTER_ID = 'tutorial';

let seedIdCounter = 0;
function nextId(prefix: string): string {
  seedIdCounter += 1;
  return `tut-${prefix}-${seedIdCounter}`;
}

function makeNode(
  moveName: string,
  overrides: Partial<MoveNode> = {},
  children: MoveNode[] = [],
): MoveNode {
  return {
    id: nextId('node'),
    moveName,
    attributes: [],
    specialNote: '',
    branchStats: null,
    createdBy: '',
    createdAt: new Date(0).toISOString(),
    children,
    ...overrides,
  };
}

function branchStats(overrides: Partial<ComboBranchStats>): ComboBranchStats {
  return { ...DEFAULT_BRANCH_STATS, ...overrides };
}

const MOVE_LIST: MoveDefinition[] = [
  { id: nextId('move'), name: 'とどめSA', category: 'superArt' },
  {
    id: nextId('move'),
    name: '溜め技',
    category: 'special',
    hasFlatVariants: true,
    // Lv.0は通常専用・Lv.2はOD専用、Lv.1はどちらでも選べる（実機のビーム系技と同じ仕様）
    specialVariantOptions: ['Lv. 0', 'Lv. 1', 'Lv. 2'],
  },
];

export function createTutorialCharacter(): Character {
  const now = new Date(0).toISOString();

  // ①属性で枠線・本体の色が変わる
  const treeAttributes = makeNode('通常ヒット', {}, [
    makeNode(
      'カウンター',
      {
        attributes: [{ type: 'counter' }],
        specialNote: '枠線が黄色になります',
      },
      [
        makeNode('パニッシュ｜カウンター', {
          attributes: [{ type: 'punishCounter' }],
          specialNote: '枠線がオレンジに（黄色より優先）',
        }),
      ],
    ),
    makeNode('ガード', {
      attributes: [{ type: 'guard' }],
      specialNote: '本体が水色になります',
    }),
    makeNode('空振り', {
      attributes: [{ type: 'whiff' }],
      specialNote: '点線の枠になります',
    }),
  ]);

  // ②ダメージ・SAゲージは自動計算される（同じ技を3回繋げると自然に減衰する）
  const treeDamage = makeNode('500ダメージ', {}, [
    makeNode('500ダメージ', {}, [
      makeNode('500ダメージ', {
        specialNote: '自動計算：500+500+400=1400',
      }),
    ]),
  ]);

  // ③グループ化: 同じgroupIdを持つ連続ノードは1個のピルに折りたためる。
  // 2本の木にまたがって同じ連携があるケースを想定し、グループタブでも横断確認できる
  const groupId = 'tut-group-1';
  const treeGroupA = makeNode('始動A', {}, [
    makeNode('共通1', { groupId, specialNote: 'ここから2ノード分がグループ' }, [
      makeNode('共通2', { groupId }, [makeNode('Aの続き')]),
    ]),
  ]);
  const treeGroupB = makeNode('始動B', {}, [
    makeNode('共通1', { groupId }, [makeNode('共通2', { groupId }, [makeNode('Bの続き')])]),
  ]);

  // ④OD版に切り替えられる技（Lv.1はusesODチェックで通常/OD版を自由に切り替えられる）
  const treeOd = makeNode('溜め技(Lv. 1)', {
    specialNote: 'ODチェックで技データが変わります',
  });

  // ⑤ラッシュ後はダメージが0.85倍になる（始動技自体がラッシュだと発生しないため、
  // 前に1つ技を挟む。生ラッシュという名前は自動計算が判定に使う固定の技名）
  const treeRush = makeNode('通常技', {}, [
    makeNode('生ラッシュ', { specialNote: 'Dゲージを消費します' }, [
      makeNode('追撃', { specialNote: '自動計算のダメージが0.85倍に' }),
    ]),
  ]);

  // ⑥SAで締めくくる: 木にSAのノードを追加しなくても、末端の「コンボの情報」欄から
  // 選ぶだけでダメージ・ゲージの自動計算にそのSAぶんが合成される
  const treeFinishingSa = makeNode('SA前の技', {
    branchStats: branchStats({ finishingSuperArtName: 'とどめSA' }),
    specialNote: '「SAで締める」から選択済み',
  });

  // ⑦ジャストパリィ始動: 常にパニッシュカウンター扱いになり、始動基準値60%のまま
  // コンボ全体が低めに推移する（技固有の補正は満額、自然減衰だけ半分になる）
  const treeJustParry = makeNode('パリィ後①', {}, [
    makeNode('反撃②', {}, [
      makeNode('反撃③', {
        branchStats: branchStats({ isJustParryStart: true }),
        specialNote: '自動計算：60%→40%→35%',
      }),
    ]),
  ]);

  return {
    id: TUTORIAL_CHARACTER_ID,
    name: 'チュートリアル',
    imageUrl: null,
    moveList: MOVE_LIST,
    comboTrees: [
      { id: nextId('tree'), label: '①属性で色が変わる', root: treeAttributes },
      { id: nextId('tree'), label: '②ダメージは自動計算', root: treeDamage },
      { id: nextId('tree'), label: '③グループ化(始動A)', root: treeGroupA },
      { id: nextId('tree'), label: '③グループ化(始動B)', root: treeGroupB },
      { id: nextId('tree'), label: '④OD版に切り替え', root: treeOd },
      { id: nextId('tree'), label: '⑤ラッシュで0.85倍', root: treeRush },
      { id: nextId('tree'), label: '⑥SAで締めくくる', root: treeFinishingSa },
      { id: nextId('tree'), label: '⑦ジャストパリィ始動', root: treeJustParry },
    ],
    namedComboGroups: [{ id: groupId, name: '共通の締め方' }],
    createdBy: '',
    createdAt: now,
    updatedAt: now,
  };
}
