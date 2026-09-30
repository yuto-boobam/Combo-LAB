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
// 空中パニカン・壁やられ・スタンは色を持たない独立したチェックボックス（2026-09-26ユーザー要望）。
// 壁やられ・スタンはさらに「ガードで発生／ヒットで発生」を選べる（ImpactAttributeRow参照）。
// この3つは共通システム技「インパクト」でしか起こらないため、技名がインパクトのノードでのみ
// 表示する（isImpactMove参照。2026-09-30ユーザー指定）。インパクトでないノードには、代わりに
// 「コンボ終了」チェックボックスを表示する（このノードでダメージ補正計算を区切り、以降を
// 別のコンボとして扱う目印。インパクトのノードでは表示しない＝ユーザー指定）。

import type { CSSProperties } from 'react';
import type { ImpactHitOrGuard, NodeAttribute, NodeAttributeType } from '../../types';

// wallSplat・stunはhitOrGuardを伴う専用の型（NodeAttribute参照）のため、単純な{type}だけの
// オブジェクトでは表現できない。本体色・枠線色グループやdelay等の単純な付け外しの対象からは除く
// （setImpactAttribute参照）
type SimpleAttributeType = Exclude<
  NodeAttributeType,
  'characterLimited' | 'positionLimited' | 'other' | 'wallSplat' | 'stun'
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
  // 「コンボ情報確認」チェックボックスをディレイと同じ行に並べたい呼び出し元だけ渡す
  // （2026-08-28ユーザー要望）。未指定なら従来通りディレイ単独の行のまま
  recordsBranchStats?: boolean;
  onRecordsBranchStatsChange?: (checked: boolean) => void;
  // trueの間、「壁やられ」「スタン」「空中パニカン」（共通システム技「インパクト」でしか
  // 起こらない属性）を選べるようにする。呼び出し側はこのノードの技名が
  // nodeVisualStyle.tsのIMPACT_MOVE_NAMEと一致するかどうかを渡す（2026-09-30ユーザー指定）。
  // falseの間は代わりに「コンボ終了」チェックボックスを表示する
  isImpactMove?: boolean;
};

export function AttributeEditor({
  value,
  onChange,
  readOnly = false,
  specialNote,
  onSpecialNoteChange,
  recordsBranchStats,
  onRecordsBranchStatsChange,
  isImpactMove = false,
}: Props) {
  const has = (type: NodeAttributeType) => value.some((attribute) => attribute.type === type);

  // delayと同じ「押すと付く/もう一度押すと外れる」独立したチェックボックス（色なし）。
  // 複数同時に付けられる（本体色・枠線色のような排他グループではない）
  const toggleIndependent = (type: SimpleAttributeType) => {
    onChange(
      has(type) ? value.filter((attribute) => attribute.type !== type) : [...value, { type }],
    );
  };

  // 壁やられ・スタンは「ガードで発生したか／ヒットで発生したか」で状況が大きく異なるため、
  // チェックのON/OFFだけでなく、ONにした後に発生条件も選べるようにする
  // （2026-09-27ユーザー指摘）。チェックを外すと発生条件の選択も一緒に消える
  const wallSplatAttr = value.find(
    (attribute): attribute is Extract<NodeAttribute, { type: 'wallSplat' }> =>
      attribute.type === 'wallSplat',
  );
  const stunAttr = value.find(
    (attribute): attribute is Extract<NodeAttribute, { type: 'stun' }> => attribute.type === 'stun',
  );

  const setImpactAttribute = (
    type: 'wallSplat' | 'stun',
    enabled: boolean,
    hitOrGuard: ImpactHitOrGuard | null,
  ) => {
    const without = value.filter((attribute) => attribute.type !== type);
    onChange(enabled ? [...without, { type, hitOrGuard }] : without);
  };

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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={has('delay')}
            disabled={readOnly}
            onChange={() => toggleIndependent('delay')}
          />
          ディレイ
        </label>

        {isImpactMove ? (
          <>
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={has('airPunishCounter')}
                disabled={readOnly}
                onChange={() => toggleIndependent('airPunishCounter')}
              />
              空中パニカン
            </label>

            <ImpactAttributeRow
              label="壁やられ"
              attr={wallSplatAttr}
              readOnly={readOnly}
              onToggle={(enabled) => setImpactAttribute('wallSplat', enabled, null)}
              onSelectHitOrGuard={(hitOrGuard) => setImpactAttribute('wallSplat', true, hitOrGuard)}
            />

            <ImpactAttributeRow
              label="スタン"
              attr={stunAttr}
              readOnly={readOnly}
              onToggle={(enabled) => setImpactAttribute('stun', enabled, null)}
              onSelectHitOrGuard={(hitOrGuard) => setImpactAttribute('stun', true, hitOrGuard)}
            />
          </>
        ) : (
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={has('comboEnd')}
              disabled={readOnly}
              onChange={() => toggleIndependent('comboEnd')}
            />
            コンボ終了
          </label>
        )}

        {onRecordsBranchStatsChange && (
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={recordsBranchStats ?? false}
              disabled={readOnly}
              onChange={(event) => onRecordsBranchStatsChange(event.target.checked)}
            />
            コンボ情報確認
          </label>
        )}
      </div>

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

// 壁やられ・スタン共通：チェックのON/OFFに加え、ONの間は「ガード」「ヒット」のどちらで
// 発生したかを選べる（もう一度同じ方を押すと解除。本体色・枠線色と同じ操作感）
function ImpactAttributeRow({
  label,
  attr,
  onToggle,
  onSelectHitOrGuard,
  readOnly,
}: {
  label: string;
  attr: { hitOrGuard: ImpactHitOrGuard | null } | undefined;
  onToggle: (enabled: boolean) => void;
  onSelectHitOrGuard: (hitOrGuard: ImpactHitOrGuard | null) => void;
  readOnly: boolean;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={Boolean(attr)}
          disabled={readOnly}
          onChange={() => onToggle(!attr)}
        />
        {label}
      </label>

      {attr && (
        <div style={styles.buttonRow}>
          <AttributePill
            label="ガード"
            active={attr.hitOrGuard === 'guard'}
            disabled={readOnly}
            onClick={() => onSelectHitOrGuard(attr.hitOrGuard === 'guard' ? null : 'guard')}
          />
          <AttributePill
            label="ヒット"
            active={attr.hitOrGuard === 'hit'}
            disabled={readOnly}
            onClick={() => onSelectHitOrGuard(attr.hitOrGuard === 'hit' ? null : 'hit')}
          />
        </div>
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
    // MoveNamePicker.tsxの同種の見出しと同じ理由で明るくする（2026-09-29ユーザー指摘）
    color: 'var(--text-secondary)',
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
