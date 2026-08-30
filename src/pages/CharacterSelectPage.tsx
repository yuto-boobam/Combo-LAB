// src/pages/CharacterSelectPage.tsx
// ログイン後の最初の画面。31枠のキャラクターグリッドを1画面に収め、
// クリックでそのキャラクターのコンボ管理画面へ進む（企画書5ページの「キャラ選択」）。
//
// キャラクター画像はまだ用意されていないため、imageUrl が未設定の間は
// キャラ名をアイコン代わりに表示する。コンボの木が1本も作られていないキャラは
// 可視性のためにグレーアウト（画像はグレースケール、名前表示は控えめな色）にする。
//
// カード数（列数×行数）に対して正方形のカードサイズが最大になる列数を毎回計算し、
// ウィンドウサイズが変わっても（半分程度に縮めても）スクロールなしで全枠が
// 収まるようにする（useSquareGridFit）。

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { useAppStore, useVisibleCharacters } from '../store';
import Header from '../components/Header';
import type { Character } from '../types';
import { computeSquareGridFit } from '../utils/squareGridFit';
import { TUTORIAL_CHARACTER_ID } from '../data/tutorialCharacter';
import { hasGuestSeenTutorial } from '../utils/guestTutorialSession';

const GRID_GAP = 10;
// containerRefを付けた要素自身のpadding。clientWidth/clientHeightにはこのpaddingが
// 含まれてしまう（子要素が実際に使える幅・高さではない）ため、計算時に差し引く
const CONTAINER_PADDING = 24;

/** count個の正方形カードを、gap込みでコンテナぴったりに収める列数・1辺のサイズを求める */
function useSquareGridFit(count: number, gap: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 1, cellSize: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || count === 0) return;

    const recompute = () => {
      const availableWidth = el.clientWidth - CONTAINER_PADDING * 2;
      const availableHeight = el.clientHeight - CONTAINER_PADDING * 2;
      if (availableWidth <= 0 || availableHeight <= 0) return;
      setLayout(computeSquareGridFit(availableWidth, availableHeight, count, gap));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count, gap]);

  return { containerRef, ...layout };
}

export function CharacterSelectPage() {
  const allCharacters = useVisibleCharacters();
  const tutorialCharacter = allCharacters.find((character) => character.id === TUTORIAL_CHARACTER_ID);
  const characters = allCharacters.filter((character) => character.id !== TUTORIAL_CHARACTER_ID);
  const selectCharacter = useAppStore((state) => state.selectCharacter);
  const openMoveStatsEditor = useAppStore((state) => state.openMoveStatsEditor);
  const isGuest = useAppStore((state) => state.isGuest);
  const { containerRef, columns, cellSize } = useSquareGridFit(characters.length, GRID_GAP);
  const rows = Math.ceil(characters.length / columns);

  // ゲストがログインして最初にこの画面へ来た時、使い方ガイドへの誘導を必須にする
  // （2026-08-31ユーザー指定）。判定はComboTreePage側の誘導ガイド既視フラグと同じ
  // sessionStorage(guestTutorialSession.ts)を再利用するため、チュートリアルを最後まで
  // 見た時点でここでも自動的に出なくなる。remount毎（=このページへ戻ってくる毎）に
  // 再評価されるので、毎回beforeの状態を正しく反映する
  const showTutorialSpotlight = isGuest && Boolean(tutorialCharacter) && !hasGuestSeenTutorial();

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Header title="キャラクター選択" />

      <main ref={containerRef} style={styles.main}>
        {cellSize > 0 && (
          <div
            style={{
              ...styles.grid,
              gridTemplateColumns: `repeat(${columns}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
            }}
          >
            {characters.map((character) => (
              <CharacterTile
                key={character.id}
                character={character}
                cellSize={cellSize}
                onClick={() => selectCharacter(character.id)}
                onOpenMoveStats={() => openMoveStatsEditor(character.id)}
              />
            ))}
          </div>
        )}

        {tutorialCharacter && !showTutorialSpotlight && (
          <button
            type="button"
            onClick={() => selectCharacter(tutorialCharacter.id)}
            title="使い方をチュートリアルで見る（自由に編集できます。内容は次に開いた時に元へ戻ります）"
            style={{ ...styles.tutorialCard, ...styles.tutorialCardPositioned }}
          >
            <span style={styles.tutorialCardIcon}>📘</span>
            <span style={styles.tutorialCardLabel}>使い方ガイド</span>
          </button>
        )}
      </main>

      {/* 「注目してほしい箇所以外を暗くする」スポットライト演出。このページの外枠・mainは
          共にoverflow:hiddenで、ボタンをそのまま暗くするとbox-shadowの拡散(9999px)が
          その祖先でクリップされてしまう（サイドドロワーで実際に踏んだのと同じ問題、
          詳細はプロジェクトの記憶参照）。document.bodyへポータルすることでその制約ごと
          回避し、ボタン自体もposition:fixedで複製する（2026-08-31ユーザー指定） */}
      {tutorialCharacter &&
        showTutorialSpotlight &&
        createPortal(
          <div style={styles.spotlightOverlay}>
            <div style={styles.tutorialCardWrapperFixed}>
              <div className="tutorial-guide-bubble" style={styles.tutorialSpotlightBubble}>
                <div style={styles.tutorialSpotlightBubbleTriangle} />
                まずはここから
              </div>
              <button
                type="button"
                onClick={() => selectCharacter(tutorialCharacter.id)}
                title="使い方をチュートリアルで見る（自由に編集できます。内容は次に開いた時に元へ戻ります）"
                style={styles.tutorialCard}
              >
                <span style={styles.tutorialCardIcon}>📘</span>
                <span style={styles.tutorialCardLabel}>使い方ガイド</span>
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function CharacterTile({
  character,
  cellSize,
  onClick,
  onOpenMoveStats,
}: {
  character: Character;
  cellSize: number;
  onClick: () => void;
  onOpenMoveStats: () => void;
}) {
  const hasTree = character.comboTrees.length > 0;
  // アイコンやフォントサイズはカードのサイズに比例させる（極端に小さい/大きいカードでも見合う大きさにする）
  const iconSize = clamp(cellSize * 0.28, 18, 30);
  const nameFontSize = clamp(cellSize * 0.13, 9, 13);

  return (
    <div style={styles.tileWrapper}>
      <button
        type="button"
        onClick={onClick}
        title={character.name}
        style={{
          ...styles.tile,
          borderRadius: clamp(cellSize * 0.14, 6, 14),
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
              fontSize: nameFontSize,
              color: hasTree ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {character.name}
          </span>
        )}
      </button>

      <button
        type="button"
        title={`${character.name}の技データを編集`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenMoveStats();
        }}
        style={{
          ...styles.moveStatsButton,
          width: iconSize,
          height: iconSize,
          fontSize: iconSize * 0.5,
        }}
      >
        📊
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const styles: Record<string, CSSProperties> = {
  main: {
    position: 'relative',
    flex: '1 1 auto',
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: CONTAINER_PADDING,
    overflow: 'hidden',
  },
  // 通常表示（このページ自身に埋め込む）専用の位置指定。ポータル表示（スポットライト時）
  // は代わりにtutorialCardWrapperFixedが位置を持つため、tutorialCard自体は見た目だけにする
  tutorialCardPositioned: {
    position: 'absolute',
    right: 14,
    bottom: 14,
  },
  tutorialCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-teal-border)',
    background: 'var(--accent-teal-bg)',
    color: 'var(--accent-teal-text)',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
  },
  tutorialCardIcon: {
    fontSize: 16,
    lineHeight: 1,
  },
  tutorialCardLabel: {
    whiteSpace: 'nowrap',
  },
  // ゲスト初回誘導のスポットライト演出（document.bodyへポータル。詳細は使用箇所のコメント参照）
  spotlightOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    background: 'rgba(0, 0, 0, 0.72)',
  },
  tutorialCardWrapperFixed: {
    position: 'fixed',
    right: 14,
    bottom: 14,
    zIndex: 201,
  },
  tutorialSpotlightBubble: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    marginBottom: 12,
    width: 140,
    padding: '8px 10px',
    borderRadius: 10,
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.5,
    textAlign: 'center',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
  },
  tutorialSpotlightBubbleTriangle: {
    position: 'absolute',
    bottom: -6,
    right: 16,
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderTop: '6px solid var(--accent)',
  },
  grid: {
    display: 'grid',
    gap: GRID_GAP,
  },
  tileWrapper: {
    position: 'relative',
    minWidth: 0,
    minHeight: 0,
  },
  tile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    border: '2px solid var(--border)',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
    cursor: 'pointer',
    padding: 6,
    transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
  },
  moveStatsButton: {
    position: 'absolute',
    top: 3,
    right: 3,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 10,
  },
  namePlaceholder: {
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.3,
    wordBreak: 'break-word',
  },
};
