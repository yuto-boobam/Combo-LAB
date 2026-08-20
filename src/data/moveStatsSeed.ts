// src/data/moveStatsSeed.ts
// アプリに同梱する技データの「正本」。ゲスト・ログインユーザーを問わず、このサイトを
// 開いた瞬間から全員が同じ内容を見られるよう、コンボの保存とは違いローカル保存に
// 依存せずビルドに埋め込む（src/data/commonMoves.ts と同じ考え方）。
//
// 運用: キャラ選択画面の「バックアップ」→「技データをエクスポート」で書き出したJSON
// （キャラID→技名→技データ、というmoveStatsDatabaseそのもの）を、そのまま
// src/data/moveStatsSources/ に置いてコミットする。ファイル名は自由。複数ファイルに
// またがっていても、キャラ・技名単位でマージされる（同じキャラの同じ技名が複数ファイルに
// あった場合は、後から読み込まれた方が優先される）。src/data/comboShowcaseSources/ と
// 同じ考え方（BackupPayload形式ではなくmoveStatsDatabase形式である点だけが違う）。
//
// 編集はメンテナが手元で `npm run dev` した時だけ行える（詳細は
// src/utils/localEditAccess.ts の canEditMoveStatsLocally 参照）。

import type { MoveStats, MoveStatsDatabase } from '../types';

const sourceModules = import.meta.glob('./moveStatsSources/*.json', {
  eager: true,
}) as Record<string, { default: MoveStatsDatabase }>;

const merged: MoveStatsDatabase = {};

for (const mod of Object.values(sourceModules)) {
  for (const [characterId, moves] of Object.entries(mod.default)) {
    merged[characterId] = { ...merged[characterId], ...(moves as Record<string, MoveStats>) };
  }
}

export const MOVE_STATS_SEED: MoveStatsDatabase = merged;
