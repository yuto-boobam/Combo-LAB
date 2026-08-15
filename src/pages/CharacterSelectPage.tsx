// src/pages/CharacterSelectPage.tsx
// ログイン後の最初の画面。31枠のキャラクターグリッドを1画面に収め、
// クリックでそのキャラクターのコンボ管理画面へ進む（企画書5ページの「キャラ選択」）。
//
// キャラクター画像はまだ用意されていないため、imageUrl が未設定の間は
// キャラ名をアイコン代わりに表示する。コンボの木が1本も作られていないキャラは
// 可視性のためにグレーアウト（画像はグレースケール、名前表示は控えめな色）にする。

import type { CSSProperties } from 'react';
import { useAppStore, useVisibleCharacters } from '../store';
import Header from '../components/Header';
import type { Character } from '../types';

const GRID_COLUMNS = 8;

export function CharacterSelectPage() {
  const characters = useVisibleCharacters();
  const selectCharacter = useAppStore((state) => state.selectCharacter);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Header title="キャラクター選択" />

      <main style={styles.main}>
        <div style={styles.grid}>
          {characters.map((character) => (
            <CharacterTile
              key={character.id}
              character={character}
              onClick={() => selectCharacter(character.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function CharacterTile({
  character,
  onClick,
}: {
  character: Character;
  onClick: () => void;
}) {
  const hasTree = character.comboTrees.length > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      title={character.name}
      style={{
        ...styles.tile,
        borderColor: hasTree ? 'var(--accent)' : 'var(--border)',
        boxShadow: hasTree ? '0 0 0 1px var(--accent-glow)' : 'none',
      }}
    >
      {character.imageUrl ? (
        <img
          src={character.imageUrl}
          alt={character.name}
          style={{
            ...styles.image,
            filter: hasTree ? 'none' : 'grayscale(1)',
            opacity: hasTree ? 1 : 0.6,
          }}
        />
      ) : (
        <span
          style={{
            ...styles.namePlaceholder,
            color: hasTree ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          {character.name}
        </span>
      )}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    flex: '1 1 auto',
    minHeight: 0,
    display: 'flex',
    padding: 16,
  },
  grid: {
    flex: '1 1 auto',
    display: 'grid',
    gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
    gridAutoRows: '1fr',
    gap: 10,
  },
  tile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: '1 / 1',
    borderRadius: 14,
    border: '2px solid var(--border)',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
    cursor: 'pointer',
    padding: 6,
    transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 10,
  },
  namePlaceholder: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.3,
    wordBreak: 'break-word',
  },
};
