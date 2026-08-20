// src/pages/MoveStatsPage.tsx
// 技ごとの基礎数値（ダメージ・Dゲージ回収量・SAゲージ回収量・Dゲージ削り値）を入力する画面。
// 将来的な「補正込みでコンボのダメージ・ゲージ回収量を自動計算する」機能の足掛かり。
// この数値は技表を見ながらまとめて入力するもので、頻繁に変える想定がないため、
// メインのコンボ編集画面（ComboTreePage）とは独立させ、キャラ選択画面の各カードの
// 小さなボタンからのみ入る導線にしている。
//
// 一覧に並べる技は、通常技（commonMoves.ts）＋キャラ固有技（Character.moveList）の全部。
// 必殺技は強度（弱/中/強/OD）ごとにダメージ等が変わるため、MoveNamePicker で実際に
// 選べる「弱波動拳」のような強度込みの文字列に展開して1行ずつ表示する
// （Character.moveStats のキーもこの文字列と揃える）。

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore, useVisibleCharacters } from '../store';
import Header from '../components/Header';
import AccordionSection from '../components/AccordionSection';
import type { MoveStats, MoveStrength } from '../types';
import { NORMAL_MOVE_NAMES, SYSTEM_MOVE_NAMES } from '../data/commonMoves';

const SPECIAL_MOVE_STRENGTHS: MoveStrength[] = ['弱', '中', '強', 'OD'];

const EMPTY_STATS: MoveStats = { damage: null, dGaugeGain: null, saGaugeGain: null, dGaugeChip: null };

type SectionKey = 'normal' | 'special' | 'superArt' | 'system';

export function MoveStatsPage() {
  const isGuest = useAppStore((state) => state.isGuest);
  const characterId = useAppStore((state) => state.moveStatsCharacterId);
  const closeMoveStatsEditor = useAppStore((state) => state.closeMoveStatsEditor);
  const characters = useVisibleCharacters();
  const character = characters.find((item) => item.id === characterId);

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    normal: true,
    special: false,
    superArt: false,
    system: false,
  });
  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // characterIdが不正（インポート直後の不整合等）な場合はキャラ選択に戻す
  if (!character) {
    closeMoveStatsEditor();
    return null;
  }

  const uniqueMoves = character.moveList.filter((move) => move.category === 'unique');
  const specialMoves = character.moveList.filter((move) => move.category === 'special');
  const superArtMoves = character.moveList.filter((move) => move.category === 'superArt');

  const normalMoveNames = [...NORMAL_MOVE_NAMES, ...uniqueMoves.map((move) => move.name)];
  const specialMoveNames = specialMoves.flatMap((move) =>
    SPECIAL_MOVE_STRENGTHS.map((strength) => `${strength}${move.name}`),
  );
  const superArtMoveNames = superArtMoves.map((move) => move.name);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Header onLogoClick={closeMoveStatsEditor} title={`${character.name} の技データ`} character={character} />

      <main style={styles.main}>
        <div style={styles.list}>
          <p style={styles.hint}>
            コンボのダメージ・ゲージ回収量を将来自動計算するための、技ごとの基礎数値です。空欄のままでも他の機能には影響しません。
          </p>

          <AccordionSection
            title="通常技・特殊技"
            icon="👊"
            count={normalMoveNames.length}
            isOpen={openSections.normal}
            onToggle={() => toggleSection('normal')}
          >
            <MoveStatsTable
              characterId={character.id}
              moveNames={normalMoveNames}
              moveStats={character.moveStats}
              readOnly={isGuest}
            />
          </AccordionSection>

          <AccordionSection
            title="必殺技"
            icon="🔥"
            count={specialMoveNames.length}
            isOpen={openSections.special}
            onToggle={() => toggleSection('special')}
          >
            {specialMoveNames.length > 0 ? (
              <MoveStatsTable
                characterId={character.id}
                moveNames={specialMoveNames}
                moveStats={character.moveStats}
                readOnly={isGuest}
              />
            ) : (
              <p style={styles.emptyHint}>
                まだ必殺技が登録されていません。コンボ編集画面の技名選択欄から登録してください。
              </p>
            )}
          </AccordionSection>

          <AccordionSection
            title="SA"
            icon="⚡"
            count={superArtMoveNames.length}
            isOpen={openSections.superArt}
            onToggle={() => toggleSection('superArt')}
          >
            <MoveStatsTable
              characterId={character.id}
              moveNames={superArtMoveNames}
              moveStats={character.moveStats}
              readOnly={isGuest}
            />
          </AccordionSection>

          <AccordionSection
            title="共通システム"
            icon="⚙️"
            count={SYSTEM_MOVE_NAMES.length}
            isOpen={openSections.system}
            onToggle={() => toggleSection('system')}
          >
            <MoveStatsTable
              characterId={character.id}
              moveNames={SYSTEM_MOVE_NAMES}
              moveStats={character.moveStats}
              readOnly={isGuest}
            />
          </AccordionSection>
        </div>
      </main>
    </div>
  );
}

function MoveStatsTable({
  characterId,
  moveNames,
  moveStats,
  readOnly,
}: {
  characterId: string;
  moveNames: string[];
  moveStats: Record<string, MoveStats>;
  readOnly: boolean;
}) {
  const setMoveStats = useAppStore((state) => state.setMoveStats);

  const updateField = (moveName: string, field: keyof MoveStats, rawValue: string) => {
    const current = moveStats[moveName] ?? EMPTY_STATS;
    setMoveStats(characterId, moveName, {
      ...current,
      [field]: rawValue === '' ? null : Number(rawValue),
    });
  };

  return (
    <div style={styles.table}>
      <div style={{ ...styles.row, ...styles.headerRow }}>
        <span style={styles.nameCell}>技名</span>
        <span style={styles.numHeaderCell}>ダメージ</span>
        <span style={styles.numHeaderCell}>Dゲージ回収</span>
        <span style={styles.numHeaderCell}>SAゲージ回収</span>
        <span style={styles.numHeaderCell}>Dゲージ削り</span>
      </div>

      {moveNames.map((moveName) => {
        const stats = moveStats[moveName] ?? EMPTY_STATS;
        return (
          <div key={moveName} style={styles.row}>
            <span style={styles.nameCell}>{moveName}</span>
            <input
              type="number"
              className="input-field"
              style={styles.numInput}
              value={stats.damage ?? ''}
              readOnly={readOnly}
              onChange={(event) => updateField(moveName, 'damage', event.target.value)}
            />
            <input
              type="number"
              className="input-field"
              style={styles.numInput}
              value={stats.dGaugeGain ?? ''}
              readOnly={readOnly}
              onChange={(event) => updateField(moveName, 'dGaugeGain', event.target.value)}
            />
            <input
              type="number"
              className="input-field"
              style={styles.numInput}
              value={stats.saGaugeGain ?? ''}
              readOnly={readOnly}
              onChange={(event) => updateField(moveName, 'saGaugeGain', event.target.value)}
            />
            <input
              type="number"
              className="input-field"
              style={styles.numInput}
              value={stats.dGaugeChip ?? ''}
              readOnly={readOnly}
              onChange={(event) => updateField(moveName, 'dGaugeChip', event.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    flex: '1 1 auto',
    minHeight: 0,
    overflow: 'auto',
    padding: 16,
    display: 'flex',
    justifyContent: 'center',
  },
  list: {
    width: '100%',
    maxWidth: 760,
    display: 'grid',
    gap: 10,
    alignContent: 'start',
  },
  hint: {
    fontSize: 12,
    lineHeight: 1.6,
    color: 'var(--text-muted)',
    margin: 0,
  },
  emptyHint: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  table: {
    display: 'grid',
    gap: 4,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr repeat(4, 84px)',
    gap: 6,
    alignItems: 'center',
  },
  headerRow: {
    paddingBottom: 2,
  },
  nameCell: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  numHeaderCell: {
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  numInput: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 12,
    padding: '5px 6px',
    textAlign: 'center',
  },
};
