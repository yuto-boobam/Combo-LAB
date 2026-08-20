// src/data/moveStatsSeed.ts
// アプリに同梱する技データの「正本」。ゲスト・ログインユーザーを問わず、このサイトを
// 開いた瞬間から全員が同じ内容を見られるよう、コンボの保存とは違いローカル保存に
// 依存せずビルドに埋め込む（src/data/commonMoves.ts や comboShowcaseSources/ と同じ考え方）。
//
// 編集はメンテナが手元で `npm run dev` した時だけ行える（詳細は
// src/utils/localEditAccess.ts の canEditMoveStatsLocally 参照）。編集後は
// キャラ選択画面の「バックアップ」→「技データをエクスポート」で書き出したJSONの中身を
// このファイルにそのまま貼り付けてコミットする運用にする。

import type { MoveStatsDatabase } from '../types';

export const MOVE_STATS_SEED: MoveStatsDatabase = {};
