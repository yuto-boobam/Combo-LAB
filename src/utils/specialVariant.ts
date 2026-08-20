// src/utils/specialVariant.ts
// 必殺技の「特殊性能」（ストック・同時押し・ホールドLvなど）が、指定した強度に
// 適用されるかどうかの判定。MoveNamePicker.tsx（ノード上での技名選択）と
// MoveStatsPage.tsx（技データの行生成）の両方から同じロジックを使うために独立させている。

import type { MoveDefinition, MoveStrength } from '../types';

/**
 * この強度に特殊性能が適用されるかどうか。specialVariantStrengths未設定（または空）なら
 * 全強度に適用（従来通り）。strengthがnull（まだ強度未選択）ならfalse
 */
export function isSpecialVariantAppliedTo(move: MoveDefinition, strength: MoveStrength | null): boolean {
  if (!strength) return false;
  const strengths = move.specialVariantStrengths;
  return !strengths || strengths.length === 0 || strengths.includes(strength);
}
