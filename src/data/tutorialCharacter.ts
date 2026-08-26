// src/data/tutorialCharacter.ts
// ポートフォリオ閲覧者向けの「使い方ガイド」専用キャラクター。
//
// 格闘ゲーム・ストリートファイター6の前提知識が無い人にも伝わるよう、木構造の作り方・
// 見せ方の工夫・技術的に便利な機能を中心に選んで見せる（カウンター/パニッシュカウンター/
// ドライブゲージ/OD/ラッシュ/ジャストパリィのような格ゲー特有の細かい仕様は、前提知識が
// 無いと刺さらないため対象外にしている。2026-08-25ユーザー方針）。
//
// このキャラクターはstore.ts側でstate.charactersに混ぜて保持しつつ、localStorageへの
// 保存対象からは除外し、アプリ読み込みのたびにこの関数で作り直す（＝ゲストで編集しても
// 次に開いた時には元に戻る）。ComboTreePage/SideDrawerPanel側では、このキャラIDの時だけ
// ゲストモードでも編集可能にする例外を入れている（詳細はTUTORIAL_CHARACTER_IDの参照元）。
//
// ノードの技名は「一致検索」等システム側が文字列で厳密比較する箇所と、必ず1文字も
// 違わず一致させる必要がある。説明文はmoveNameに詰め込まず specialNote（ノード下の
// 小さな注記）側に書く。

import type { Character, MoveDefinition, MoveNode } from '../types';

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

const MOVE_LIST: MoveDefinition[] = [];

export function createTutorialCharacter(): Character {
  const now = new Date(0).toISOString();

  // ①ヒットの結果（属性）で見た目が自動で変わる。カウンターヒットだけ格ゲー用語だが、
  // 「有利な当て方をすると分かりやすく目立つ」という一般的な価値として見せる
  const treeAttributes = makeNode('ヒット', {}, [
    makeNode('カウンターヒット', {
      attributes: [{ type: 'counter' }],
      specialNote: '枠線が自動で黄色になります',
    }),
    makeNode('ガード', {
      attributes: [{ type: 'guard' }],
      specialNote: '本体が水色になります',
    }),
    makeNode('空振り', {
      attributes: [{ type: 'whiff' }],
      specialNote: '点線の枠になります',
    }),
  ]);

  // ②ダメージは自動計算される（同じ技を3回繋げると自然に減衰する）
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

  // ④一致検索: ある枝を選ぶと、木をまたいで同じ並びの枝を自動で見つけて一括修正できる。
  // あえてグループ化はせず（独立した2つの配置に見える）、検索で初めて共通点が分かる
  // 見せ方にする
  const treeMatchA = makeNode('配置A', {}, [
    makeNode('共通の技イ', { specialNote: 'ここから「一致箇所を探す」を試せます' }, [
      makeNode('共通の技ロ', {}, [makeNode('Aだけの続き')]),
    ]),
  ]);
  const treeMatchB = makeNode('配置B', {}, [
    makeNode('共通の技イ', {}, [makeNode('共通の技ロ', {}, [makeNode('Bだけの続き')])]),
  ]);

  return {
    id: TUTORIAL_CHARACTER_ID,
    name: 'チュートリアル',
    imageUrl: null,
    moveList: MOVE_LIST,
    comboTrees: [
      { id: nextId('tree'), label: '①属性で見た目が変わる', root: treeAttributes },
      { id: nextId('tree'), label: '②ダメージは自動計算', root: treeDamage },
      { id: nextId('tree'), label: '③グループ化(始動A)', root: treeGroupA },
      { id: nextId('tree'), label: '③グループ化(始動B)', root: treeGroupB },
      { id: nextId('tree'), label: '④一致検索(配置A)', root: treeMatchA },
      { id: nextId('tree'), label: '④一致検索(配置B)', root: treeMatchB },
    ],
    namedComboGroups: [{ id: groupId, name: '共通の締め方' }],
    createdBy: '',
    createdAt: now,
    updatedAt: now,
  };
}
