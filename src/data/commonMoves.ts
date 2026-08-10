// src/data/commonMoves.ts
// 通常技・空中技・共通システムは全キャラ共通の固定リスト。
// 特殊技・必殺技・SAはキャラ固有のため、ここには含めず Character.moveList で管理する
// （src/components/combo/MoveNamePicker.tsx 参照）。

export const NORMAL_MOVE_NAMES: string[] = [
  '弱P',
  '中P',
  '強P',
  '弱K',
  '中K',
  '強K',
  '2弱P',
  '2中P',
  '2強P',
  '2弱K',
  '2中K',
  '2強K',
];

export const AIR_MOVE_NAMES: string[] = ['J弱P', 'J中P', 'J強P', 'J弱K', 'J中K', 'J強K'];

// 「歩き」は方向・フレーム数を入力する複合項目のため、ここには含めずMoveNamePicker側で個別に組み立てる
export const SYSTEM_MOVE_NAMES: string[] = [
  '投げ',
  '前ステップ',
  'バックステップ',
  '前ジャンプ',
  '垂直ジャンプ',
  'バックジャンプ',
  'インパクト',
  'パリィ',
  '生ラッシュ',
  'キャンセルラッシュ',
];
