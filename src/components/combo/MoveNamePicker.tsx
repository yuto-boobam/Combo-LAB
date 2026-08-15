// src/components/combo/MoveNamePicker.tsx
// 技名の選択UI。
//
// 通常技・空中技・共通システムは全キャラ共通の固定ボタン（クリックのみで選択完了）。
// 特殊技・必殺技はキャラ固有のため自由入力で登録し、登録したものはボタンとして
// 次回以降も再利用できる（Character.moveList に保存・削除で管理）。
// SAはSA1〜3の固定枠だが、名前はキャラごとに直接編集できる。
// 「歩き」は方向とフレーム数を組み立てる複合ウィジェット。
//
// 技は結局1つしか選ばないため、カテゴリは初期状態ではすべて閉じておき
// （現在値が属するカテゴリだけ自動で開く）、AccordionSectionで開閉させる。

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../../store';
import type { MoveDefinition } from '../../types';
import { AIR_MOVE_NAMES, NORMAL_MOVE_NAMES, SYSTEM_MOVE_NAMES } from '../../data/commonMoves';
import AccordionSection from '../AccordionSection';

type SectionKey = 'normal' | 'air' | 'unique' | 'special' | 'superArt' | 'system';

type Props = {
  characterId: string;
  value: string;
  onChange: (name: string) => void;
};

function computeInitialOpenSections(
  value: string,
  moveList: MoveDefinition[],
): Record<SectionKey, boolean> {
  const initial: Record<SectionKey, boolean> = {
    normal: false,
    air: false,
    unique: false,
    special: false,
    superArt: false,
    system: false,
  };

  if (!value) return initial;

  if (NORMAL_MOVE_NAMES.includes(value)) return { ...initial, normal: true };
  if (AIR_MOVE_NAMES.includes(value)) return { ...initial, air: true };
  if (SYSTEM_MOVE_NAMES.includes(value) || value.includes('歩き')) {
    return { ...initial, system: true };
  }

  const matchedMove = moveList.find((move) => move.name === value);
  if (matchedMove) return { ...initial, [matchedMove.category]: true };

  return initial;
}

export function MoveNamePicker({ characterId, value, onChange }: Props) {
  const moveList = useAppStore(
    (state) => state.characters.find((character) => character.id === characterId)?.moveList ?? [],
  );

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(() =>
    computeInitialOpenSections(value, moveList),
  );

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const uniqueMoves = moveList.filter((move) => move.category === 'unique');
  const specialMoves = moveList.filter((move) => move.category === 'special');
  const superArtMoves = moveList.filter((move) => move.category === 'superArt');

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <AccordionSection
        title="地上技"
        icon="👊"
        count={NORMAL_MOVE_NAMES.length}
        isOpen={openSections.normal}
        onToggle={() => toggleSection('normal')}
      >
        <div style={styles.buttonRow}>
          {NORMAL_MOVE_NAMES.map((name) => (
            <MovePill key={name} label={name} active={value === name} onClick={() => onChange(name)} />
          ))}
        </div>
      </AccordionSection>

      <AccordionSection
        title="空中技"
        icon="🦶"
        count={AIR_MOVE_NAMES.length}
        isOpen={openSections.air}
        onToggle={() => toggleSection('air')}
      >
        <div style={styles.buttonRow}>
          {AIR_MOVE_NAMES.map((name) => (
            <MovePill key={name} label={name} active={value === name} onClick={() => onChange(name)} />
          ))}
        </div>
      </AccordionSection>

      <AccordionSection
        title="特殊技（キャラ固有）"
        icon="⭐"
        count={uniqueMoves.length}
        isOpen={openSections.unique}
        onToggle={() => toggleSection('unique')}
      >
        <CharacterMoveGroupBody
          title="特殊技"
          characterId={characterId}
          moves={uniqueMoves}
          value={value}
          onChange={onChange}
        />
      </AccordionSection>

      <AccordionSection
        title="必殺技（キャラ固有）"
        icon="🔥"
        count={specialMoves.length}
        isOpen={openSections.special}
        onToggle={() => toggleSection('special')}
      >
        <SpecialMoveGroupBody
          characterId={characterId}
          moves={specialMoves}
          value={value}
          onChange={onChange}
        />
      </AccordionSection>

      <AccordionSection
        title="SA（キャラ固有・名前入力可）"
        icon="⚡"
        count={superArtMoves.length}
        isOpen={openSections.superArt}
        onToggle={() => toggleSection('superArt')}
      >
        <SuperArtGroupBody characterId={characterId} moves={superArtMoves} value={value} onChange={onChange} />
      </AccordionSection>

      <AccordionSection
        title="共通システム"
        icon="⚙️"
        count={SYSTEM_MOVE_NAMES.length}
        isOpen={openSections.system}
        onToggle={() => toggleSection('system')}
      >
        <div style={styles.buttonRow}>
          {SYSTEM_MOVE_NAMES.map((name) => (
            <MovePill key={name} label={name} active={value === name} onClick={() => onChange(name)} />
          ))}
        </div>
        <WalkPicker value={value} onChange={onChange} />
      </AccordionSection>
    </div>
  );
}

function CharacterMoveGroupBody({
  title,
  characterId,
  moves,
  value,
  onChange,
}: {
  title: string;
  characterId: string;
  moves: MoveDefinition[];
  value: string;
  onChange: (name: string) => void;
}) {
  const addMoveDefinition = useAppStore((state) => state.addMoveDefinition);
  const deleteMoveDefinition = useAppStore((state) => state.deleteMoveDefinition);
  const [draftName, setDraftName] = useState('');

  const handleAdd = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;

    addMoveDefinition(characterId, 'unique', trimmed);
    onChange(trimmed);
    setDraftName('');
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {moves.length > 0 && (
        <div style={styles.buttonRow}>
          {moves.map((move) => (
            <div key={move.id} style={styles.managedPillWrapper}>
              <MovePill
                label={move.name}
                active={value === move.name}
                onClick={() => onChange(move.name)}
              />
              <button
                type="button"
                title="この技を削除"
                style={styles.removeButton}
                onClick={() => deleteMoveDefinition(characterId, move.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          className="input-field"
          style={styles.addInput}
          placeholder={`新しい${title}を登録...`}
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleAdd();
          }}
        />
        <button
          type="button"
          className="btn-ghost"
          style={styles.addButton}
          onClick={handleAdd}
          disabled={!draftName.trim()}
        >
          登録
        </button>
      </div>
    </div>
  );
}

const SPECIAL_MOVE_STRENGTHS = ['弱', '中', '強', 'OD'] as const;

function SpecialMoveGroupBody({
  characterId,
  moves,
  value,
  onChange,
}: {
  characterId: string;
  moves: MoveDefinition[];
  value: string;
  onChange: (name: string) => void;
}) {
  const addMoveDefinition = useAppStore((state) => state.addMoveDefinition);
  const deleteMoveDefinition = useAppStore((state) => state.deleteMoveDefinition);
  const [draftName, setDraftName] = useState('');

  // 現在の値が「強度+登録済み技名」の形なら、その技の強度選択を開いた状態にしておく
  const selectedMove = moves.find((move) =>
    SPECIAL_MOVE_STRENGTHS.some((strength) => value === `${strength}${move.name}`),
  );
  const [pickingMoveId, setPickingMoveId] = useState<string | null>(selectedMove?.id ?? null);
  const pickingMove = moves.find((move) => move.id === pickingMoveId) ?? null;

  const handleAdd = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;

    const newId = addMoveDefinition(characterId, 'special', trimmed);
    setDraftName('');
    setPickingMoveId(newId);
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>必殺技を選択</legend>
        {moves.length > 0 ? (
          <div style={styles.buttonRow}>
            {moves.map((move) => (
              <div key={move.id} style={styles.managedPillWrapper}>
                <MovePill
                  label={move.name}
                  active={pickingMoveId === move.id}
                  onClick={() =>
                    setPickingMoveId((current) => (current === move.id ? null : move.id))
                  }
                />
                <button
                  type="button"
                  title="この技を削除"
                  style={styles.removeButton}
                  onClick={() => {
                    deleteMoveDefinition(characterId, move.id);
                    if (pickingMoveId === move.id) setPickingMoveId(null);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={styles.emptyHint}>まだ必殺技が登録されていません。下から登録してください。</p>
        )}
      </fieldset>

      {pickingMove && (
        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>強度選択</legend>
          <div style={styles.buttonRow}>
            {SPECIAL_MOVE_STRENGTHS.map((strength) => (
              <MovePill
                key={strength}
                label={strength}
                active={value === `${strength}${pickingMove.name}`}
                onClick={() => onChange(`${strength}${pickingMove.name}`)}
              />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>追加登録</legend>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            className="input-field"
            style={styles.addInput}
            placeholder="新しい必殺技を登録...（強度は付けない技名）"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleAdd();
            }}
          />
          <button
            type="button"
            className="btn-ghost"
            style={styles.addButton}
            onClick={handleAdd}
            disabled={!draftName.trim()}
          >
            登録
          </button>
        </div>
      </fieldset>
    </div>
  );
}

function SuperArtGroupBody({
  characterId,
  moves,
  value,
  onChange,
}: {
  characterId: string;
  moves: MoveDefinition[];
  value: string;
  onChange: (name: string) => void;
}) {
  const renameMoveDefinition = useAppStore((state) => state.renameMoveDefinition);

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {moves.map((move) => (
        <div key={move.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <MovePill label="選択" active={value === move.name} onClick={() => onChange(move.name)} />
          <input
            type="text"
            className="input-field"
            style={{ ...styles.addInput, flex: '1 1 auto' }}
            value={move.name}
            onChange={(event) => renameMoveDefinition(characterId, move.id, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

function WalkPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [direction, setDirection] = useState<'前' | '後'>('前');
  const [fromFrame, setFromFrame] = useState('');
  const [toFrame, setToFrame] = useState('');

  const composedLabel =
    fromFrame && toFrame ? `${direction}歩き(${fromFrame}F~${toFrame}F)` : `${direction}歩き`;

  return (
    <div style={styles.walkBox}>
      <div style={styles.walkTitle}>歩き</div>

      <div style={styles.buttonRow}>
        {(['前', '後'] as const).map((d) => (
          <MovePill key={d} label={`${d}歩き`} active={direction === d} onClick={() => setDirection(d)} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="number"
          className="input-field"
          style={styles.frameInput}
          placeholder="開始F"
          value={fromFrame}
          onChange={(event) => setFromFrame(event.target.value)}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>F 〜</span>
        <input
          type="number"
          className="input-field"
          style={styles.frameInput}
          placeholder="終了F"
          value={toFrame}
          onChange={(event) => setToFrame(event.target.value)}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>F</span>
      </div>

      <MovePill
        label={`この内容で選択（${composedLabel}）`}
        active={value === composedLabel}
        onClick={() => onChange(composedLabel)}
      />
    </div>
  );
}

function MovePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.pill,
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent)' : 'var(--bg-elevated)',
        color: active ? '#fff' : 'var(--text-secondary)',
      }}
    >
      {label}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  buttonRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '6px 8px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  managedPillWrapper: {
    position: 'relative',
    display: 'inline-flex',
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    color: 'var(--text-muted)',
    fontSize: 10,
    lineHeight: 1,
    cursor: 'pointer',
  },
  addInput: {
    fontSize: 12,
    padding: '6px 10px',
  },
  addButton: {
    flex: '0 0 auto',
    padding: '6px 12px',
    fontSize: 12,
  },
  fieldset: {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 10,
  },
  legend: {
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--text-muted)',
    padding: '0 4px',
  },
  emptyHint: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  walkBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px dashed var(--border)',
    display: 'grid',
    gap: 6,
  },
  walkTitle: {
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--text-secondary)',
  },
  frameInput: {
    width: 64,
    fontSize: 12,
    padding: '6px 8px',
  },
};
