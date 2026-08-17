// src/data/characterRoster.ts
// キャラ選択画面に並ぶ31枠の初期データ（ストリートファイター6のキャラクター）。
// imageUrl は未設定（null）で開始し、キャラ選択画面ではその間 name をアイコン代わりに表示する。
// moveList には SA1〜SA3 の枠だけ最初から用意しておく（名前はキャラごとに後から編集する）。
// 特殊技・必殺技はユーザーが手入力で登録していくため、ここでは空から始まる。
// comboTrees も空の状態から始まり、ユーザーの操作でストアに保存されていく。

import type { Character, MoveDefinition } from '../types';

let seedIdCounter = 0;
function nextSeedId(prefix: string): string {
  seedIdCounter += 1;
  return `${prefix}-${seedIdCounter}`;
}

/** SA1〜SA3の初期枠（名前はキャラごとに後から編集する）。
 * 新規キャラの初期化と、既存キャラでSA枠が欠けている場合の補完の両方で使う */
export function createDefaultSuperArtMoves(): MoveDefinition[] {
  return [
    { id: nextSeedId('sa'), name: 'SA1', category: 'superArt' },
    { id: nextSeedId('sa'), name: 'SA2', category: 'superArt' },
    { id: nextSeedId('sa'), name: 'SA3', category: 'superArt' },
  ];
}

function createDefaultMoveList(): MoveDefinition[] {
  return createDefaultSuperArtMoves();
}

const ROSTER_NAMES: { id: string; name: string }[] = [
  { id: 'luke', name: 'ルーク' },
  { id: 'jamie', name: 'ジェイミー' },
  { id: 'manon', name: 'マノン' },
  { id: 'kimberly', name: 'キンバリー' },
  { id: 'marisa', name: 'マリーザ' },
  { id: 'lily', name: 'リリー' },
  { id: 'jp', name: 'JP' },
  { id: 'juri', name: 'ジュリ' },
  { id: 'dee-jay', name: 'DJ' },
  { id: 'cammy', name: 'キャミィ' },
  { id: 'ryu', name: 'リュウ' },
  { id: 'honda', name: '本田' },
  { id: 'blanka', name: 'ブランカ' },
  { id: 'guile', name: 'ガイル' },
  { id: 'ken', name: 'ケン' },
  { id: 'chun-li', name: '春麗' },
  { id: 'zangief', name: 'ザンギエフ' },
  { id: 'dhalsim', name: 'ダルシム' },
  { id: 'rashid', name: 'ラシード' },
  { id: 'aki', name: 'A.K.I' },
  { id: 'ed', name: 'エド' },
  { id: 'akuma', name: '豪鬼' },
  { id: 'bison', name: 'ベガ' },
  { id: 'terry', name: 'テリー' },
  { id: 'mai', name: '舞' },
  { id: 'elena', name: 'エレナ' },
  { id: 'sagat', name: 'サガット' },
  { id: 'viper', name: 'ヴァイパー' },
  { id: 'alex', name: 'アレックス' },
  { id: 'ingrid', name: 'イングリッド' },
  { id: 'yasmin', name: 'ヤスミン' },
];

export function createInitialCharacterRoster(): Character[] {
  const now = new Date().toISOString();

  return ROSTER_NAMES.map(({ id, name }) => ({
    id,
    name,
    imageUrl: null,
    moveList: createDefaultMoveList(),
    comboTrees: [],
    createdBy: '',
    createdAt: now,
    updatedAt: now,
  }));
}
