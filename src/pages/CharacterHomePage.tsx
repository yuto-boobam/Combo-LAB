// src/pages/CharacterHomePage.tsx
// キャラ選択後の画面。そのキャラが持つコンボの木（森）の一覧と、新しい木の作成フォームを表示する。
// 木を選ぶとComboTreePageへ進む。

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore, useVisibleCharacters } from '../store';
import Header from '../components/Header';
import type { ComboTree, MoveNode } from '../types';

function countNodes(node: MoveNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

export function CharacterHomePage() {
  const characters = useVisibleCharacters();
  const isGuest = useAppStore((state) => state.isGuest);
  const selectedCharacterId = useAppStore((state) => state.selectedCharacterId);
  const goToCharacterSelect = useAppStore((state) => state.goToCharacterSelect);
  const selectComboTree = useAppStore((state) => state.selectComboTree);
  const createComboTree = useAppStore((state) => state.createComboTree);
  const deleteComboTree = useAppStore((state) => state.deleteComboTree);

  const character = characters.find((item) => item.id === selectedCharacterId) ?? null;
  const [newTreeLabel, setNewTreeLabel] = useState('');

  if (!character) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
        <Header onLogoClick={goToCharacterSelect} />
      </div>
    );
  }

  const handleCreateTree = () => {
    const label = newTreeLabel.trim();
    if (!label) return;

    const treeId = createComboTree(character.id, label);
    setNewTreeLabel('');
    selectComboTree(treeId);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Header onLogoClick={goToCharacterSelect} title={character.name} character={character} />

      <main className="flex-1 overflow-y-auto px-10 py-8">
        <h1 className="text-sm font-medium mb-5" style={{ color: 'var(--text-muted)' }}>
          {character.name} のコンボ木 — {character.comboTrees.length} 本
        </h1>

        {!isGuest && (
          <div style={styles.createRow}>
            <input
              type="text"
              className="input-field"
              placeholder="木の名前（例: 小P始動）"
              value={newTreeLabel}
              onChange={(event) => setNewTreeLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreateTree();
              }}
              style={styles.createInput}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={!newTreeLabel.trim()}
              onClick={handleCreateTree}
            >
              + 新しい木を作成
            </button>
          </div>
        )}

        {character.comboTrees.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4" style={{ padding: '60px 0' }}>
            <div className="text-6xl">🌳</div>
            <p style={{ color: 'var(--text-secondary)' }}>
              まだコンボの木がありません。始動技の名前を入力して作成しましょう。
            </p>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {character.comboTrees.map((tree) => (
              <ComboTreeCard
                key={tree.id}
                tree={tree}
                onOpen={() => selectComboTree(tree.id)}
                onDelete={
                  isGuest
                    ? undefined
                    : () => {
                        const ok = window.confirm(`「${tree.label}」を削除しますか？`);
                        if (ok) deleteComboTree(character.id, tree.id);
                      }
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ComboTreeCard({
  tree,
  onOpen,
  onDelete,
}: {
  tree: ComboTree;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="card" style={styles.treeCard}>
      <button type="button" onClick={onOpen} style={styles.treeCardMain}>
        <div style={styles.treeCardTitle}>{tree.label}</div>
        <div style={styles.treeCardMeta}>{countNodes(tree.root) - 1} 手のコンボ</div>
      </button>

      {onDelete && (
        <button type="button" className="btn-icon" onClick={onDelete} title="この木を削除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  createRow: {
    display: 'flex',
    gap: 10,
    marginBottom: 24,
  },
  createInput: {
    maxWidth: 280,
  },
  treeCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: 8,
  },
  treeCardMain: {
    flex: '1 1 auto',
    minWidth: 0,
    textAlign: 'left',
    padding: 8,
    cursor: 'pointer',
  },
  treeCardTitle: {
    fontWeight: 800,
    color: 'var(--text-primary)',
    marginBottom: 4,
  },
  treeCardMeta: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
};
