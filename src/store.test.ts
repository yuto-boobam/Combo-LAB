import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from './store';
import type { Character } from './types';
import { createInitialCharacterRoster } from './data/characterRoster';

function getCharacter(id: string): Character {
  const character = useAppStore.getState().characters.find((c) => c.id === id);
  if (!character) throw new Error(`character not found: ${id}`);
  return character;
}

describe('restoreCharacters', () => {
  beforeEach(() => {
    useAppStore.setState({ characters: createInitialCharacterRoster() });
  });

  it('idが一致するキャラのみ上書きし、名前が保持される', () => {
    const target = useAppStore.getState().characters[0];

    useAppStore.getState().restoreCharacters([
      {
        id: target.id,
        name: target.name,
        imageUrl: 'https://example.com/a.png',
        moveList: [{ id: 'm1', name: '波動拳', category: 'special' }],
        comboTrees: [
          {
            id: 't1',
            label: '小P始動',
            root: {
              id: 'root1',
              moveName: '小P',
              attributes: [],
              specialNote: '',
              branchStats: null,
              createdBy: '',
              createdAt: '2026-01-01T00:00:00.000Z',
              children: [],
            },
          },
        ],
        createdBy: 'someone',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const updated = getCharacter(target.id);
    expect(updated.imageUrl).toBe('https://example.com/a.png');
    expect(updated.moveList).toHaveLength(1);
    expect(updated.comboTrees).toHaveLength(1);
    expect(updated.comboTrees[0].root.moveName).toBe('小P');
  });

  it('一致しないidのキャラは変更されない', () => {
    const before = useAppStore.getState().characters;
    const untouchedId = before[1].id;
    const before1 = getCharacter(untouchedId);

    useAppStore.getState().restoreCharacters([
      {
        id: 'not-a-real-character-id',
        name: 'ゴースト',
        comboTrees: [],
        moveList: [],
      },
    ]);

    const after1 = getCharacter(untouchedId);
    expect(after1).toEqual(before1);
  });

  it('壊れた/欠けたフィールドがあっても落ちずに正規化される', () => {
    const target = useAppStore.getState().characters[2];

    useAppStore.getState().restoreCharacters([
      {
        id: target.id,
        // name欠如 -> fallbackのnameを維持
        moveList: [
          { id: 'x', name: '', category: 'special' }, // 名前が空 -> 除外される
          { id: 'y', name: '龍巻旋風脚', category: 'not-a-real-category' as never },
        ],
        comboTrees: [
          { id: 'bad-tree' } as never, // rootが無い -> 除外される
        ],
      },
    ]);

    const updated = getCharacter(target.id);
    expect(updated.name).toBe(target.name);
    expect(updated.moveList).toHaveLength(1);
    expect(updated.moveList[0].name).toBe('龍巻旋風脚');
    expect(updated.moveList[0].category).toBe('unique'); // 不正なカテゴリはuniqueにフォールバック
    expect(updated.comboTrees).toHaveLength(0);
  });
});
