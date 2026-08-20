// src/components/combo/AttributeEditor.tsx
// ノードの属性を編集するUI。
//
// 本体色グループ（ガード/空振り/状況限）と枠線・接続線色グループ（CH/PC/ラッシュ）は
// それぞれ排他（ラジオボタン相当）。選択中のものをもう一度押すと解除（＝通常に戻る）する。
// 枠線・接続線色は「このノード自身の技がカウンター/パニッシュカウンター/ラッシュだった」場合に、
// このノードの枠線と、直前（親）のノードから続く接続線に反映される
// （例: 2中P→2中Kがカウンターで繋がる場合は、2中K側にカウンターを付ける）。
// 状況限（situational）は本体色の一種として扱う（詳細は src/utils/nodeVisualStyle.ts 参照）。
// ディレイは色ではなくノード隅の丸バッジで示す（詳細は src/utils/nodeVisualStyle.ts 参照）。
// 詳細記入（specialNote）はディレイ or 状況限が選択されている時だけ、ディレイチェックボックスの
// 下に表示する（呼び出し元がspecialNoteを渡さない場合は常に非表示。新規ノード追加フォームなど、
// specialNoteの概念自体がない箇所を想定）。

import type { CSSProperties } from 'react';
import type { NodeAttribute, NodeAttributeType } from '../../types';

type SimpleAttributeType = Exclude<
  NodeAttributeType,
  'characterLimited' | 'positionLimited' | 'other'
>;

const BODY_COLOR_ATTRS: { type: SimpleAttributeType; label: string }[] = [
  { type: 'guard', label: 'ガード' },
  { type: 'whiff', label: '空振り' },
  { type: 'situational', label: '状況限' },
];

const BORDER_COLOR_ATTRS: { type: SimpleAttributeType; label: string }[] = [
  { type: 'counter', label: 'カウンター(CH)' },
  { type: 'punishCounter', label: 'パニカン(PC)' },
  { type: 'rush', label: 'ラッシュ' },
];

type Props = {
  value: NodeAttribute[];
  onChange: (next: NodeAttribute[]) => void;
  readOnly?: boolean;
  specialNote?: string;
  onSpecialNoteChange?: (note: string) => void;
};

export function AttributeEditor({
  value,
  onChange,
  readOnly = false,
  specialNote,
  onSpecialNoteChange,
}: Props) {
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

  const toggleDelay = () => {
    onChange(
      has('delay')
        ? value.filter((attribute) => attribute.type !== 'delay')
        : [...value, { type: 'delay' }],
    );
  };

  const currentBodyColor = BODY_COLOR_ATTRS.find((attribute) => has(attribute.type))?.type ?? null;
  const currentBorderColor = BORDER_COLOR_ATTRS.find((attribute) => has(attribute.type))?.type ?? null;
  const showSpecialNote = specialNote !== undefined && (has('delay') || has('situational'));

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>本体色（押すと選択）</legend>
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
        <legend style={styles.legend}>枠線・接続線（直前の線にも反映／押すと選択）</legend>
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

      <label style={styles.checkboxRow}>
        <input type="checkbox" checked={has('delay')} disabled={readOnly} onChange={toggleDelay} />
        ディレイ
      </label>

      {showSpecialNote && (
        <label style={styles.fieldLabel}>
          詳細記入（「ディレイ〜F」など）
          <textarea
            className="input-field"
            style={styles.noteTextarea}
            rows={3}
            placeholder="12F~18Fディレイ など"
            value={specialNote ?? ''}
            readOnly={readOnly}
            onChange={(event) => onSpecialNoteChange?.(event.target.value)}
          />
        </label>
      )}
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
  fieldLabel: {
    display: 'grid',
    gap: 4,
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--text-secondary)',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  noteTextarea: {
    fontSize: 12,
    padding: '8px 10px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
};
