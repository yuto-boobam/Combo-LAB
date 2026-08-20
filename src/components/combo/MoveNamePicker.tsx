// src/components/combo/MoveNamePicker.tsx
// 技名の選択UI。
//
// 通常技（地上技・空中技）・共通システムは全キャラ共通の固定ボタン（クリックのみで選択完了）。
// 特殊技はキャラ固有のため自由入力で登録するが、コンパクトにするため独立したカテゴリにはせず
// 「通常技」セクションの中にそのまま内蔵する。必殺技も同様にキャラ固有で自由入力登録。
// 登録したものはボタンとして次回以降も再利用できる（Character.moveList に保存・削除で管理）。
// SAはSA1〜3の固定枠だが、名前はキャラごとに直接編集できる。
// 「歩き」は方向とフレーム数を組み立てる複合ウィジェット。
//
// 必殺技のみ「呼び名」（木のノード上の表示用の短い名前）を任意で登録できる。ドロワーの
// この選択UI自体は常に正式名称で表示し、選んだ瞬間に正式名称・呼び名の両方を onChange へ渡す
// （呼び名が無ければ木のノードは正式名称のまま表示される。詳細はMoveNodeCircle.tsx参照）。
//
// 技は結局1つしか選ばないため、カテゴリは初期状態ではすべて閉じておき
// （現在値が属するカテゴリだけ自動で開く）、AccordionSectionで開閉させる。

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../../store';
import type { MoveDefinition, MoveStrength } from '../../types';
import { NORMAL_MOVE_NAMES, SYSTEM_MOVE_NAMES } from '../../data/commonMoves';
import { isSpecialVariantAppliedTo } from '../../utils/specialVariant';
import AccordionSection from '../AccordionSection';

type SectionKey = 'normal' | 'special' | 'superArt' | 'system';

type Props = {
  characterId: string;
  value: string;
  // displayName は必殺技を選んだ時のみ渡ってくる（呼び名が登録されている場合）
  onChange: (name: string, displayName?: string) => void;
};

function computeInitialOpenSections(
  value: string,
  moveList: MoveDefinition[],
): Record<SectionKey, boolean> {
  const initial: Record<SectionKey, boolean> = {
    normal: false,
    special: false,
    superArt: false,
    system: false,
  };

  if (!value) return initial;

  if (NORMAL_MOVE_NAMES.includes(value)) return { ...initial, normal: true };
  if (SYSTEM_MOVE_NAMES.includes(value) || value.includes('歩き')) {
    return { ...initial, system: true };
  }

  const matchedMove = moveList.find((move) => move.name === value);
  if (matchedMove) {
    // 特殊技(unique)は「通常技」セクションに内蔵しているため、通常技を開く
    if (matchedMove.category === 'unique') return { ...initial, normal: true };
    if (matchedMove.category === 'special') return { ...initial, special: true };
    if (matchedMove.category === 'superArt') return { ...initial, superArt: true };
  }

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
        title="通常技"
        icon="👊"
        count={NORMAL_MOVE_NAMES.length + uniqueMoves.length}
        isOpen={openSections.normal}
        onToggle={() => toggleSection('normal')}
      >
        <div style={styles.buttonRow}>
          {NORMAL_MOVE_NAMES.map((name) => (
            <MovePill key={name} label={name} active={value === name} onClick={() => onChange(name)} />
          ))}
        </div>

        <div style={styles.walkBox}>
          <div style={styles.walkTitle}>特殊技（キャラ固有）</div>
          <CharacterMoveGroupBody
            title="特殊技"
            characterId={characterId}
            moves={uniqueMoves}
            value={value}
            onChange={onChange}
          />
        </div>
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

const SPECIAL_MOVE_STRENGTHS: MoveStrength[] = ['弱', '中', '強', 'OD'];

/**
 * valueが `${強度}${技名}` または `${強度}${技名}(特殊性能)` のどちらの形かを判定する。
 * ストック・同時押しなど、強度だけでは技の状態を表現しきれない技（hasSpecialVariant参照）は
 * 後者の形で選んだ特殊性能を保持する
 */
function parseSpecialMoveValue(
  value: string,
  moveName: string,
): { strength: MoveStrength; subLevel: string | null } | null {
  for (const strength of SPECIAL_MOVE_STRENGTHS) {
    const prefix = `${strength}${moveName}`;
    if (value === prefix) return { strength, subLevel: null };
    if (value.startsWith(`${prefix}(`) && value.endsWith(')')) {
      return { strength, subLevel: value.slice(prefix.length + 1, -1) };
    }
  }
  return null;
}

function SpecialMoveGroupBody({
  characterId,
  moves,
  value,
  onChange,
}: {
  characterId: string;
  moves: MoveDefinition[];
  value: string;
  onChange: (name: string, displayName?: string) => void;
}) {
  const addMoveDefinition = useAppStore((state) => state.addMoveDefinition);
  const deleteMoveDefinition = useAppStore((state) => state.deleteMoveDefinition);
  const setMoveDefinitionShortName = useAppStore((state) => state.setMoveDefinitionShortName);
  const setMoveDefinitionHasSpecialVariant = useAppStore(
    (state) => state.setMoveDefinitionHasSpecialVariant,
  );
  const setMoveDefinitionSpecialVariantStrengths = useAppStore(
    (state) => state.setMoveDefinitionSpecialVariantStrengths,
  );
  const [draftName, setDraftName] = useState('');
  const [draftShortName, setDraftShortName] = useState('');

  // valueがどの技の何強度（＋選んだ特殊性能）に該当するかをまとめて判定する
  let parsedValue: { move: MoveDefinition; strength: MoveStrength; subLevel: string | null } | null = null;
  for (const move of moves) {
    const parsed = parseSpecialMoveValue(value, move.name);
    if (parsed) {
      parsedValue = { move, ...parsed };
      break;
    }
  }
  const currentStrength = parsedValue?.strength ?? null;
  // 「value と完全に一致していて本当に確定している技」かどうか。他カテゴリと違い必殺技は
  // 技→強度の2段階選択なので、pickingMoveId（＝今どの技の強度パネルを開いているか）とは
  // 分けて判定する。こうしないと「通常技のPを押した後も必殺技側が選択されっぱなしに見える」
  // という不具合（＝どのカテゴリでも同時に1つしか選ばれていないように見せたい）が起きる
  const isMoveConfirmed = (move: MoveDefinition) => parsedValue?.move.id === move.id;
  const selectedMove = parsedValue?.move ?? null;
  const [pickingMoveId, setPickingMoveId] = useState<string | null>(selectedMove?.id ?? null);
  const pickingMove = moves.find((move) => move.id === pickingMoveId) ?? null;
  // valueが今開いている技のものであれば、その強度・特殊性能の選択状態を復元する
  const pickingMoveMatch = pickingMove && parsedValue?.move.id === pickingMove.id ? parsedValue : null;

  const handlePickMove = (move: MoveDefinition) => {
    const wasPicked = pickingMoveId === move.id;
    setPickingMoveId(wasPicked ? null : move.id);

    // 他のカテゴリ（通常技・特殊技・SA）は1クリックで選択が確定するのに対し、必殺技だけ
    // 「技を選ぶ→強度を選ぶ」の2手が必要で「反応しない」ように感じられていた。
    // すでに強度が決まっている状態で別の技に切り替える場合は、その強度のまま即座に確定し、
    // 強度を変えたい時だけ下の強度選択で選び直せるようにする
    if (!wasPicked && currentStrength) {
      onChange(
        `${currentStrength}${move.name}`,
        move.shortName ? `${currentStrength}${move.shortName}` : undefined,
      );
    }
  };

  const handleAdd = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;

    const newId = addMoveDefinition(characterId, 'special', trimmed, draftShortName);
    setDraftName('');
    setDraftShortName('');
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
                  active={isMoveConfirmed(move)}
                  pending={pickingMoveId === move.id && !isMoveConfirmed(move)}
                  onClick={() => handlePickMove(move)}
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
        <>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>強度選択</legend>
            <div style={styles.buttonRow}>
              {SPECIAL_MOVE_STRENGTHS.map((strength) => (
                <MovePill
                  key={strength}
                  label={strength}
                  active={pickingMoveMatch?.strength === strength}
                  onClick={() =>
                    onChange(
                      `${strength}${pickingMove.name}`,
                      pickingMove.shortName ? `${strength}${pickingMove.shortName}` : undefined,
                    )
                  }
                />
              ))}
            </div>
          </fieldset>

          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>呼び名（木のノード上の表示用・省略可・「｜」で改行）</legend>
            <input
              type="text"
              className="input-field"
              style={styles.addInput}
              placeholder={`例: ${pickingMove.name}｜Lv.1（改行したい位置に｜）`}
              value={pickingMove.shortName ?? ''}
              onChange={(event) =>
                setMoveDefinitionShortName(characterId, pickingMove.id, event.target.value)
              }
            />
          </fieldset>

          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>特殊性能（省略可）</legend>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={pickingMove.hasSpecialVariant ?? false}
                onChange={(event) =>
                  setMoveDefinitionHasSpecialVariant(characterId, pickingMove.id, event.target.checked)
                }
              />
              特殊性能あり
            </label>

            {pickingMove.hasSpecialVariant && (
              <>
                <div style={{ ...styles.buttonRow, marginTop: 8 }}>
                  {SPECIAL_MOVE_STRENGTHS.map((strength) => {
                    const currentStrengths = pickingMove.specialVariantStrengths;
                    const active =
                      !currentStrengths || currentStrengths.length === 0 || currentStrengths.includes(strength);
                    return (
                      <MovePill
                        key={strength}
                        label={strength}
                        active={active}
                        onClick={() => {
                          const base =
                            currentStrengths && currentStrengths.length > 0
                              ? currentStrengths
                              : SPECIAL_MOVE_STRENGTHS;
                          const next = base.includes(strength)
                            ? base.filter((item) => item !== strength)
                            : [...base, strength];
                          setMoveDefinitionSpecialVariantStrengths(characterId, pickingMove.id, next);
                        }}
                      />
                    );
                  })}
                </div>
                <p style={styles.emptyHint}>
                  チェックした強度だけ特殊性能の選択肢を使う（すべて選択中＝全強度に適用、従来通り）
                </p>

                {isSpecialVariantAppliedTo(pickingMove, pickingMoveMatch?.strength ?? null) && (
                  <SpecialVariantRegistration
                    characterId={characterId}
                    move={pickingMove}
                    activeVariant={pickingMoveMatch?.subLevel ?? null}
                    onSelectVariant={(variant) => {
                      if (!pickingMoveMatch) return;
                      onChange(`${pickingMoveMatch.strength}${pickingMove.name}(${variant})`, variant);
                    }}
                  />
                )}
              </>
            )}
          </fieldset>
        </>
      )}

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>追加登録</legend>
        <div style={{ display: 'grid', gap: 6 }}>
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
          <input
            type="text"
            className="input-field"
            style={styles.addInput}
            placeholder="呼び名（省略可・木のノード上に表示）"
            value={draftShortName}
            onChange={(event) => setDraftShortName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleAdd();
            }}
          />
        </div>
      </fieldset>
    </div>
  );
}

/**
 * 特殊性能（ストック・同時押しなど）の選択肢を、必殺技の登録と同じ感覚で1件ずつ登録・削除する。
 * ピル自体をクリックすると選択（呼び名として採用）でき、×で削除できる
 * （「特殊性能を選択」欄を別立てにせず、登録欄がそのまま選択欄を兼ねることで省スペース化している）
 */
function SpecialVariantRegistration({
  characterId,
  move,
  activeVariant,
  onSelectVariant,
}: {
  characterId: string;
  move: MoveDefinition;
  activeVariant: string | null;
  onSelectVariant: (variant: string) => void;
}) {
  const setMoveDefinitionSpecialVariantOptions = useAppStore(
    (state) => state.setMoveDefinitionSpecialVariantOptions,
  );
  const [draftVariant, setDraftVariant] = useState('');

  const options = move.specialVariantOptions ?? [];

  const handleAdd = () => {
    const trimmed = draftVariant.trim();
    if (!trimmed || options.includes(trimmed)) return;

    setMoveDefinitionSpecialVariantOptions(characterId, move.id, [...options, trimmed]);
    setDraftVariant('');
  };

  const handleRemove = (variant: string) => {
    setMoveDefinitionSpecialVariantOptions(
      characterId,
      move.id,
      options.filter((option) => option !== variant),
    );
  };

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      {options.length > 0 && (
        <div style={styles.buttonRow}>
          {options.map((variant) => (
            <div key={variant} style={styles.managedPillWrapper}>
              <MovePill
                label={variant}
                active={activeVariant === variant}
                onClick={() => onSelectVariant(variant)}
              />
              <button
                type="button"
                title="この選択肢を削除"
                style={styles.removeButton}
                onClick={() => handleRemove(variant)}
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
          placeholder="新しい特殊性能を登録...（例: ビーム｜Lv.2・改行したい位置に｜）"
          value={draftVariant}
          onChange={(event) => setDraftVariant(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleAdd();
          }}
        />
        <button
          type="button"
          className="btn-ghost"
          style={styles.addButton}
          onClick={handleAdd}
          disabled={!draftVariant.trim()}
        >
          登録
        </button>
      </div>
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
  const setMoveDefinitionHasSpecialVariant = useAppStore(
    (state) => state.setMoveDefinitionHasSpecialVariant,
  );

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {moves.map((move) => {
        // 特殊性能ありのSAは `${SA名}(${Lv等})` の形で確定する（必殺技のstock/同時押しと同じ考え方）
        const activeVariant =
          move.hasSpecialVariant && value.startsWith(`${move.name}(`) && value.endsWith(')')
            ? value.slice(move.name.length + 1, -1)
            : null;

        return (
          <div key={move.id} style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <MovePill label="選択" active={value === move.name} onClick={() => onChange(move.name)} />
              <input
                type="text"
                className="input-field"
                style={styles.superArtNameInput}
                value={move.name}
                onChange={(event) => renameMoveDefinition(characterId, move.id, event.target.value)}
              />
            </div>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={move.hasSpecialVariant ?? false}
                onChange={(event) =>
                  setMoveDefinitionHasSpecialVariant(characterId, move.id, event.target.checked)
                }
              />
              特殊性能あり（ホールドでLv.が変わる等）
            </label>

            {move.hasSpecialVariant && (
              <SpecialVariantRegistration
                characterId={characterId}
                move={move}
                activeVariant={activeVariant}
                onSelectVariant={(variant) => onChange(`${move.name}(${variant})`)}
              />
            )}
          </div>
        );
      })}
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
  pending = false,
  onClick,
}: {
  label: string;
  active: boolean;
  // 「今まさに選択中（value と一致）」ではなく「強度・呼び名を選んでいる最中でまだ確定していない」
  // 状態を示す弱めの見た目。activeと同時にtrueにはならない想定
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.pill,
        borderColor: active ? 'var(--accent)' : pending ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent)' : 'var(--bg-elevated)',
        color: active ? '#fff' : pending ? 'var(--accent)' : 'var(--text-secondary)',
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
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
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
  superArtNameInput: {
    width: 120,
    minWidth: 0,
    flex: '0 0 auto',
    fontSize: 12,
    padding: '6px 10px',
  },
};
