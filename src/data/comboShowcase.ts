// src/data/comboShowcase.ts
// ポートフォリオ閲覧者（ゲストモード）に見せる、閲覧専用のコンボデータ。
// comboShowcase.json は Header の「エクスポート」で書き出したバックアップの
// characters配列をそのまま貼り付けて更新する（コミットして反映する運用）。
// 中身は31キャラの一部（更新したキャラだけ）でよく、該当しないキャラは
// 初期ロースターのまま（コンボの木なし）で表示される。

import { createInitialCharacterRoster } from './characterRoster';
import type { Character } from '../types';
import rawShowcaseCharacters from './comboShowcase.json';

const showcaseById = new Map(
  (rawShowcaseCharacters as Character[]).map((character) => [character.id, character]),
);

export const SHOWCASE_CHARACTERS: Character[] = createInitialCharacterRoster().map(
  (base) => showcaseById.get(base.id) ?? base,
);
