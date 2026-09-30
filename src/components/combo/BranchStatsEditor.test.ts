// src/components/combo/BranchStatsEditor.test.ts
// formatDamageEntryNote（計算式の内訳で各段の技名の後ろに添える注記の組み立て）を
// DOMを介さず直接テストする。以前は補正が無い段にも`modifier="なし"`と機械的に
// 表示されていたのを、補正名だけを表示し・何も無ければ注記自体を省くように直した
// （2026-09-30ユーザー指摘）ため、その仕様を固定する

import { describe, expect, it } from 'vitest';
import { formatDamageEntryNote } from './BranchStatsEditor';
import type { DamageBreakdownEntry } from '../../utils/comboGaugeCalc';

function buildEntry(overrides: Partial<DamageBreakdownEntry> = {}): DamageBreakdownEntry {
  return {
    position: 1,
    hitLabel: 'テスト技',
    damage: 800,
    modifierText: '',
    isSuperArt: false,
    minDamageGuaranteePercent: null,
    isSystemAction: false,
    isRush: false,
    percent: 100,
    contribution: 800,
    ...overrides,
  };
}

describe('formatDamageEntryNote', () => {
  it('補正が無い（modifierTextが空・ラッシュ後でもない）段は注記を出さない（"modifier=なし"のような機械的な表示をしない）', () => {
    expect(formatDamageEntryNote(buildEntry())).toBe('');
  });

  it('補正がある段は、modifier=の接頭辞を付けず補正名だけを表示する', () => {
    expect(formatDamageEntryNote(buildEntry({ modifierText: '始動補正20%' }))).toBe('始動補正20%');
  });

  it('ラッシュ後の段は、補正名が無くても「ラッシュ後」とだけ表示する', () => {
    expect(formatDamageEntryNote(buildEntry({ isRush: true }))).toBe('ラッシュ後');
  });

  it('補正名とラッシュ後が両方ある段は「／」で繋げる', () => {
    expect(
      formatDamageEntryNote(buildEntry({ modifierText: '即時補正10%', isRush: true })),
    ).toBe('即時補正10%／ラッシュ後');
  });

  it('敵にヒットしない行動は、補正の有無に関わらず専用の注記になる', () => {
    expect(
      formatDamageEntryNote(buildEntry({ isSystemAction: true, modifierText: '始動補正20%' })),
    ).toBe('敵にヒットしない行動のため補正対象外');
  });

  it('SA最低保証が適用された段（自然計算が下回った）は専用の注記になり、補正名は表示されない', () => {
    const entry = buildEntry({
      isSuperArt: true,
      minDamageGuaranteePercent: 80,
      percent: 80,
      modifierText: '始動補正20%',
    });
    expect(formatDamageEntryNote(entry)).toBe('SA最低保証80%が適用（自然計算が下回った）');
  });

  it('SA最低保証に未到達の段は、補正名の後ろに未到達の注記が続く', () => {
    const entry = buildEntry({
      isSuperArt: true,
      minDamageGuaranteePercent: 80,
      percent: 90,
      modifierText: '始動補正20%',
    });
    expect(formatDamageEntryNote(entry)).toBe('始動補正20%（SA最低保証80%は未到達）');
  });

  it('SA最低保証に未到達だが補正名もラッシュも無い段は、未到達の注記だけになる', () => {
    const entry = buildEntry({
      isSuperArt: true,
      minDamageGuaranteePercent: 80,
      percent: 90,
    });
    expect(formatDamageEntryNote(entry)).toBe('（SA最低保証80%は未到達）');
  });
});
