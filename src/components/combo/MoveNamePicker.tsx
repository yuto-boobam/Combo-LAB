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
import AccordionSection from '../AccordionSection';

type SectionKey = 'normal' | 'special' | 'superArt' | 'system';

type Props = {
  characterId: string;
  value: string;
  // displayName は必殺技を選んだ時のみ渡ってくる（呼び名が登録されている場合）。
  // finishingSpecialVariant は「常にコンボの締めで使う」設定のSA(finishesComboOnSelect)の
  // 特殊性能を選んだ時のみ渡ってくる。呼び出し側はこれを選択中/新規追加ノードの
  // branchStats.finishingSpecialVariantへ反映する（SideDrawerPanel参照）
  onChange: (name: string, displayName?: string, finishingSpecialVariant?: string) => void;
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
  // 「歩き」ピルを押した時だけ詳細（方向・フレーム範囲）を開く。現在値が既に歩き系なら
  // 最初から開いておく（2026-08-28ユーザー指定：他の技と同じくピルを押してから詳細を登録する形にする）
  const [isWalkOpen, setIsWalkOpen] = useState(() => value.includes('歩き'));

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
          <MovePill
            label="歩き"
            active={value.includes('歩き')}
            pending={isWalkOpen && !value.includes('歩き')}
            onClick={() => setIsWalkOpen((open) => !open)}
          />
        </div>
        {isWalkOpen && <WalkPicker value={value} onChange={onChange} />}
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
                onClick={() => {
                  const ok = window.confirm(`「${move.name}」を削除しますか？`);
                  if (ok) deleteMoveDefinition(characterId, move.id);
                }}
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
 * strengthModeに応じて、「強度選択」欄に並べる選択肢（表示ラベルと技名に埋め込む接頭辞）を返す。
 * 'level'は強度という概念自体が無いのでnull（代わりにparseFlatSpecialMoveValue/選択肢UIを使う）
 */
function getStrengthOptions(move: MoveDefinition): { label: string; prefix: string }[] | null {
  switch (move.strengthMode) {
    case 'level':
      return null;
    case 'none':
      return [{ label: '選択', prefix: '' }];
    case 'normalOd':
      return [
        { label: '無印', prefix: '' },
        { label: 'OD', prefix: 'OD' },
      ];
    default:
      return SPECIAL_MOVE_STRENGTHS.map((strength) => ({ label: strength, prefix: strength }));
  }
}

/**
 * valueが `${強度接頭辞}${技名}` または `${強度接頭辞}${技名}(特殊性能)` のどちらの形かを、
 * その技のstrengthModeに応じた選択肢（getStrengthOptions参照）から判定する。
 * ストック・同時押しなど、強度だけでは技の状態を表現しきれない技（hasSpecialVariant参照）は
 * 後者の形で選んだ特殊性能を保持する
 */
function parseSpecialMoveValue(
  value: string,
  move: MoveDefinition,
): { strength: string; subLevel: string | null } | null {
  const options = getStrengthOptions(move);
  if (!options) return null;
  for (const { prefix: strengthPrefix } of options) {
    const prefix = `${strengthPrefix}${move.name}`;
    if (value === prefix) return { strength: strengthPrefix, subLevel: null };
    if (value.startsWith(`${prefix}(`) && value.endsWith(')')) {
      return { strength: strengthPrefix, subLevel: value.slice(prefix.length + 1, -1) };
    }
  }
  return null;
}

/**
 * strengthMode==='level'な技（強度ではなくレベルで区別する技）用に、valueが `${技名}` または
 * `${技名}(特殊性能)` のどちらの形かを判定する（SA(superArt)の判定と同じ考え方）
 */
function parseFlatSpecialMoveValue(value: string, moveName: string): { subLevel: string | null } | null {
  if (value === moveName) return { subLevel: null };
  if (value.startsWith(`${moveName}(`) && value.endsWith(')')) {
    return { subLevel: value.slice(moveName.length + 1, -1) };
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
  const setMoveDefinitionSpecialVariantsForStrength = useAppStore(
    (state) => state.setMoveDefinitionSpecialVariantsForStrength,
  );
  const setMoveDefinitionSpecialVariantOptions = useAppStore(
    (state) => state.setMoveDefinitionSpecialVariantOptions,
  );
  const setMoveDefinitionStrengthMode = useAppStore((state) => state.setMoveDefinitionStrengthMode);
  const [draftName, setDraftName] = useState('');
  const [draftShortName, setDraftShortName] = useState('');

  // valueがどの技の何強度（＋選んだ特殊性能）に該当するかをまとめて判定する。
  // strengthMode==='level'な技は強度を持たないため、代わりにparseFlatSpecialMoveValueで判定する
  let parsedValue:
    | { move: MoveDefinition; strength: string | null; subLevel: string | null }
    | null = null;
  for (const move of moves) {
    if (move.strengthMode === 'level') {
      const parsed = parseFlatSpecialMoveValue(value, move.name);
      if (parsed) {
        parsedValue = { move, strength: null, subLevel: parsed.subLevel };
        break;
      }
      continue;
    }
    const parsed = parseSpecialMoveValue(value, move);
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

    // strengthMode==='none'（強度が存在しない技）は選ぶ強度が無いため、他カテゴリと同じく
    // 一覧のピルを押した時点で即確定する（下のパネルは呼び名編集等のためだけに開く）
    if (!wasPicked && move.strengthMode === 'none') {
      onChange(move.name, move.shortName);
      return;
    }

    // 他のカテゴリ（通常技・特殊技・SA）は1クリックで選択が確定するのに対し、必殺技だけ
    // 「技を選ぶ→強度を選ぶ」の2手が必要で「反応しない」ように感じられていた。
    // すでに強度（強度モードによっては空文字＝無印、の場合もある）が決まっている状態で
    // 別の技に切り替える場合は、切り替え先の技でもその強度が選べる時に限り即座に確定する
    // （strengthModeが技ごとに異なるため、切り替え先が対応していない強度は無視する）
    if (!wasPicked && currentStrength !== null) {
      const options = getStrengthOptions(move);
      if (options?.some((option) => option.prefix === currentStrength)) {
        onChange(
          `${currentStrength}${move.name}`,
          move.shortName ? `${currentStrength}${move.shortName}` : undefined,
        );
      }
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
                    const ok = window.confirm(`「${move.name}」を削除しますか？`);
                    if (!ok) return;
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
          {pickingMove.strengthMode !== 'level' && pickingMove.strengthMode !== 'none' && (
            <fieldset style={styles.fieldset}>
              <legend style={styles.legend}>強度選択</legend>
              <div style={styles.buttonRow}>
                {(getStrengthOptions(pickingMove) ?? []).map(({ label, prefix }) => (
                  <MovePill
                    key={prefix}
                    label={label}
                    active={pickingMoveMatch?.strength === prefix}
                    onClick={() =>
                      onChange(
                        `${prefix}${pickingMove.name}`,
                        pickingMove.shortName ? `${prefix}${pickingMove.shortName}` : undefined,
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
          )}

          {pickingMove.strengthMode !== 'level' && (
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
          )}

          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>強度モード</legend>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={styles.checkboxLabel}>
                <input
                  type="radio"
                  name={`strength-mode-${pickingMove.id}`}
                  checked={!pickingMove.strengthMode}
                  onChange={() => setMoveDefinitionStrengthMode(characterId, pickingMove.id, undefined)}
                />
                弱・中・強・OD（通常の4強度）
              </label>
              <label style={styles.checkboxLabel}>
                <input
                  type="radio"
                  name={`strength-mode-${pickingMove.id}`}
                  checked={pickingMove.strengthMode === 'none'}
                  onChange={() => setMoveDefinitionStrengthMode(characterId, pickingMove.id, 'none')}
                />
                強度が存在しない技
              </label>
              <label style={styles.checkboxLabel}>
                <input
                  type="radio"
                  name={`strength-mode-${pickingMove.id}`}
                  checked={pickingMove.strengthMode === 'normalOd'}
                  onChange={() => setMoveDefinitionStrengthMode(characterId, pickingMove.id, 'normalOd')}
                />
                強度が「無印」とODしかない技
              </label>
              <label style={styles.checkboxLabel}>
                <input
                  type="radio"
                  name={`strength-mode-${pickingMove.id}`}
                  checked={pickingMove.strengthMode === 'level'}
                  onChange={() => setMoveDefinitionStrengthMode(characterId, pickingMove.id, 'level')}
                />
                強度ではなく、レベルで区別する技
              </label>
            </div>
          </fieldset>

          {pickingMove.strengthMode === 'level' && (
            <fieldset style={styles.fieldset}>
              <legend style={styles.legend}>選択肢</legend>
              <SpecialVariantRegistration
                options={pickingMove.specialVariantOptions ?? []}
                activeVariant={pickingMoveMatch?.subLevel ?? null}
                onSelectVariant={(variant) => onChange(`${pickingMove.name}(${variant})`, variant)}
                onOptionsChange={(next) =>
                  setMoveDefinitionSpecialVariantOptions(characterId, pickingMove.id, next)
                }
              />
            </fieldset>
          )}

          {!pickingMove.strengthMode && (
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

              {pickingMove.hasSpecialVariant &&
                (() => {
                  const strength = (pickingMoveMatch?.strength ?? null) as MoveStrength | null;
                  if (!strength) {
                    return (
                      <p style={styles.emptyHint}>
                        上の「強度選択」で強度を選ぶと、その強度で使う特殊性能を登録できます（強度ごとに個別に登録します）
                      </p>
                    );
                  }
                  return (
                    <SpecialVariantRegistration
                      options={pickingMove.specialVariantsByStrength?.[strength] ?? []}
                      activeVariant={pickingMoveMatch?.subLevel ?? null}
                      onSelectVariant={(variant) => onChange(`${strength}${pickingMove.name}(${variant})`, variant)}
                      onOptionsChange={(next) =>
                        setMoveDefinitionSpecialVariantsForStrength(characterId, pickingMove.id, strength, next)
                      }
                    />
                  );
                })()}
            </fieldset>
          )}
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
 * （「特殊性能を選択」欄を別立てにせず、登録欄がそのまま選択欄を兼ねることで省スペース化している）。
 * 選択肢一覧の保存先（SAは技全体で1つ、必殺技は強度ごとに個別）は呼び出し元に任せる
 */
function SpecialVariantRegistration({
  options,
  activeVariant,
  onSelectVariant,
  onOptionsChange,
}: {
  options: string[];
  activeVariant: string | null;
  onSelectVariant: (variant: string) => void;
  onOptionsChange: (next: string[]) => void;
}) {
  const [draftVariant, setDraftVariant] = useState('');

  const handleAdd = () => {
    const trimmed = draftVariant.trim();
    if (!trimmed || options.includes(trimmed)) return;

    onOptionsChange([...options, trimmed]);
    setDraftVariant('');
  };

  const handleRemove = (variant: string) => {
    onOptionsChange(options.filter((option) => option !== variant));
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
  onChange: (name: string, displayName?: string, finishingSpecialVariant?: string) => void;
}) {
  const renameMoveDefinition = useAppStore((state) => state.renameMoveDefinition);
  const setMoveDefinitionHasSpecialVariant = useAppStore(
    (state) => state.setMoveDefinitionHasSpecialVariant,
  );
  const setMoveDefinitionSpecialVariantOptions = useAppStore(
    (state) => state.setMoveDefinitionSpecialVariantOptions,
  );
  const setMoveDefinitionFinishesComboOnSelect = useAppStore(
    (state) => state.setMoveDefinitionFinishesComboOnSelect,
  );

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {moves.map((move) => {
        // 特殊性能ありのSAは `${SA名}(${Lv等})` の形で確定する（必殺技のstock/同時押しと同じ考え方）。
        // finishesComboOnSelectの技は技名を焼き込まない（末端ノードのbranchStats側で選ぶ）ため、
        // このピッカーのvalue文字列からは今どのLv.が選ばれているか分からず、ハイライトできない
        const activeVariant =
          !move.finishesComboOnSelect &&
          move.hasSpecialVariant &&
          value.startsWith(`${move.name}(`) &&
          value.endsWith(')')
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
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={move.finishesComboOnSelect ?? false}
                  onChange={(event) =>
                    setMoveDefinitionFinishesComboOnSelect(characterId, move.id, event.target.checked)
                  }
                />
                常にコンボの締めで使う（この後に技を繋げない）
              </label>
            )}

            {move.hasSpecialVariant && (
              <SpecialVariantRegistration
                options={move.specialVariantOptions ?? []}
                activeVariant={activeVariant}
                onSelectVariant={(variant) =>
                  move.finishesComboOnSelect
                    ? // 常にコンボの締めで使う技は、ノード名を素の技名のまま確定し、実際に
                      // 使った特殊性能は末端ノードのbranchStats.finishingSpecialVariantへ
                      // 直接渡す（呼び出し側で反映する。SideDrawerPanel参照）
                      onChange(move.name, undefined, variant)
                    : // それ以外は必殺技の特殊性能選択と同じく、木のノード上にはvariantの
                      // 文字列だけをそのまま表示する（moveNameは技データ照合用のキーとして
                      // `${name}(${variant})`のまま保つが、表示はそれとは独立させることで
                      // 「SA1(SA1|Lv. 1)」のような技名の二重表記を避ける）
                      onChange(`${move.name}(${variant})`, variant)
                }
                onOptionsChange={(next) => setMoveDefinitionSpecialVariantOptions(characterId, move.id, next)}
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
