// src/components/combo/AttributeEditor.tsx
// ノードの属性を編集するUI。
//
// 本体色グループ（ガード/空振り/コンボ締め）と枠線・接続線色グループ（CH/PC/ラッシュ）は
// それぞれ排他（ラジオボタン相当）。「通常」専用のボタンは置かず、選択中のものをもう一度
// 押すと解除（＝通常に戻る）する。そのほかの属性は複数選択可のトグル。
// 枠線・接続線色は「このノード自身の技がカウンター/パニッシュカウンター/ラッシュだった」場合に、
// このノードの枠線と、直前（親）のノードから続く接続線に反映される
// （例: 2中P→2中Kがカウンターで繋がる場合は、2中K側にカウンターを付ける）。
// キャラ限定・位置限定・その他は自由記述メモを伴う（詳細は src/utils/nodeVisualStyle.ts 参照）。

import type { CSSProperties } from 'react';
import type { NodeAttribute, NodeAttributeType } from '../../types';

type SimpleAttributeType = Exclude<
  NodeAttributeType,
  'characterLimited' | 'positionLimited' | 'other'
>;
type NoteAttributeType = 'characterLimited' | 'positionLimited' | 'other';

const BODY_COLOR_ATTRS: { type: SimpleAttributeType; label: string }[] = [
  { type: 'guard', label: 'ガード' },
  { type: 'whiff', label: '空振り' },
  { type: 'comboEnder', label: 'コンボ締め' },
];

const BORDER_COLOR_ATTRS: { type: SimpleAttributeType; label: string }[] = [
  { type: 'counter', label: 'カウンター(CH)' },
  { type: 'punishCounter', label: 'パニカン(PC)' },
  { type: 'rush', label: 'ラッシュ' },
];

const TOGGLE_ATTRS: { type: SimpleAttributeType; label: string }[] = [
  { type: 'hit', label: 'ヒット' },
  { type: 'airHit', label: '空中' },
  { type: 'delay', label: 'ディレイ' },
  { type: 'okizeme', label: '起き攻め' },
];

const NOTE_ATTRS: { type: NoteAttributeType; label: string; placeholder: string }[] = [
  { type: 'characterLimited', label: 'キャラ限定', placeholder: '対象キャラをメモ...' },
  { type: 'positionLimited', label: '位置限定', placeholder: '条件をメモ...' },
  { type: 'other', label: 'その他', placeholder: '自由記述...' },
];

type Props = {
  value: NodeAttribute[];
  onChange: (next: NodeAttribute[]) => void;
  readOnly?: boolean;
};

export function AttributeEditor({ value, onChange, readOnly = false }: Props) {
  const has = (type: NodeAttributeType) => value.some((attribute) => attribute.type === type);

  const setExclusiveGroup = (
    group: { type: SimpleAttributeType; label: string }[],
    nextType: SimpleAttributeType | null,
  ) => {
    const withoutGroup = value.filter(
      (attribute) => !group.some((groupItem) => groupItem.type === attribute.type),
    );
    onChange(nextType ? [...withoutGroup, { type: nextType }] : withoutGroup);
  };

  // 「通常」ボタンは置かず、選択済みのものをもう一度押すと解除（＝通常に戻る）する
  const toggleExclusive = (
    group: { type: SimpleAttributeType; label: string }[],
    current: SimpleAttributeType | null,
    type: SimpleAttributeType,
  ) => {
    setExclusiveGroup(group, current === type ? null : type);
  };

  const toggleSimple = (type: SimpleAttributeType) => {
    onChange(
      has(type)
        ? value.filter((attribute) => attribute.type !== type)
        : [...value, { type }],
    );
  };

  const setNoteAttribute = (type: NoteAttributeType, note: string | null) => {
    const withoutThis = value.filter((attribute) => attribute.type !== type);
    onChange(note !== null ? [...withoutThis, { type, note }] : withoutThis);
  };

  const currentBodyColor = BODY_COLOR_ATTRS.find((attribute) => has(attribute.type))?.type ?? null;
  const currentBorderColor = BORDER_COLOR_ATTRS.find((attribute) => has(attribute.type))?.type ?? null;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>本体色（押すと選択、もう一度押すと通常に戻る）</legend>
        <div style={styles.buttonRow}>
          {BODY_COLOR_ATTRS.map((attribute) => (
            <AttributePill
              key={attribute.type}
              label={attribute.label}
              active={currentBodyColor === attribute.type}
              onClick={() => toggleExclusive(BODY_COLOR_ATTRS, currentBodyColor, attribute.type)}
              disabled={readOnly}
            />
          ))}
        </div>
      </fieldset>

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>枠線・接続線（直前の線にも反映／押すと選択、もう一度押すと通常に戻る）</legend>
        <div style={styles.buttonRow}>
          {BORDER_COLOR_ATTRS.map((attribute) => (
            <AttributePill
              key={attribute.type}
              label={attribute.label}
              active={currentBorderColor === attribute.type}
              onClick={() => toggleExclusive(BORDER_COLOR_ATTRS, currentBorderColor, attribute.type)}
              disabled={readOnly}
            />
          ))}
        </div>
      </fieldset>

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>その他の属性（複数選択可）</legend>
        <div style={styles.buttonRow}>
          {TOGGLE_ATTRS.map((attribute) => (
            <AttributePill
              key={attribute.type}
              label={attribute.label}
              active={has(attribute.type)}
              onClick={() => toggleSimple(attribute.type)}
              disabled={readOnly}
            />
          ))}
        </div>
      </fieldset>

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>状況限定・メモ</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          {NOTE_ATTRS.map((attribute) => {
            const current = value.find(
              (item): item is { type: NoteAttributeType; note: string } => item.type === attribute.type,
            );

            return (
              <label key={attribute.type} style={{ display: 'grid', gap: 4 }}>
                <span style={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={Boolean(current)}
                    disabled={readOnly}
                    onChange={(event) =>
                      setNoteAttribute(attribute.type, event.target.checked ? '' : null)
                    }
                  />
                  {attribute.label}
                </span>

                {current && (
                  <input
                    type="text"
                    className="input-field"
                    style={styles.noteInput}
                    placeholder={attribute.placeholder}
                    value={current.note}
                    readOnly={readOnly}
                    onChange={(event) => setNoteAttribute(attribute.type, event.target.value)}
                  />
                )}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function AttributePill({
  label,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.pill,
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent)' : 'var(--bg-elevated)',
        color: active ? '#fff' : 'var(--text-secondary)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
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
  buttonRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  noteInput: {
    fontSize: 12,
    padding: '6px 10px',
  },
};
