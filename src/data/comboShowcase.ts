// src/data/comboShowcase.ts
// ポートフォリオ閲覧者（ゲストモード）に見せる、閲覧専用のコンボデータ。
//
// 運用: Headerの「エクスポート」で書き出した
// キャラ1人分のJSON（{id, name, moveList, comboTrees, ...} という Character そのもの）を、
// そのまま src/data/comboShowcaseSources/ に置いてコミットする。ファイル名は自由。
// 後方互換として、Headerの「エクスポート」で作ったフルバックアップ形式
// （{characters: Character[]} や Character[]）が置かれていても読める。
// 同じキャラのデータが複数ファイルにまたがっていても、updatedAt が一番新しいものを
// 自動的に採用するので、手動でマージする必要はない。

import { createInitialCharacterRoster } from './characterRoster';
import type { Character } from '../types';

type BackupPayload = { characters?: Character[] } | Character[] | Character;

function isCharacter(value: unknown): value is Character {
  return Boolean(value) && typeof value === 'object' && 'id' in (value as object);
}

const sourceModules = import.meta.glob('./comboShowcaseSources/*.json', {
  eager: true,
}) as Record<string, { default: BackupPayload }>;

function hasContent(character: Character): boolean {
  return character.moveList.length > 0 || character.comboTrees.length > 0;
}

function extractCharacters(payload: BackupPayload): Character[] {
  if (Array.isArray(payload)) return payload;
  if (isCharacter(payload)) return [payload];
  return payload.characters ?? [];
}

const latestById = new Map<string, Character>();

for (const mod of Object.values(sourceModules)) {
  for (const character of extractCharacters(mod.default)) {
    if (!hasContent(character)) continue;

    const existing = latestById.get(character.id);
    if (!existing || new Date(character.updatedAt) > new Date(existing.updatedAt)) {
      latestById.set(character.id, character);
    }
  }
}

export const SHOWCASE_CHARACTERS: Character[] = createInitialCharacterRoster().map(
  (base) => latestById.get(base.id) ?? base,
);
