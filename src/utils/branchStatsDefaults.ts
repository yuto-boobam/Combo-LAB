// src/utils/branchStatsDefaults.ts
// ComboBranchStatsの初期値。BranchStatsEditor.tsx（未入力表示用）とSideDrawerPanel.tsx
// （finishingSpecialVariantを新規/既存ノードへ直接反映する時のベース値）の両方から使うため、
// コンポーネントファイルではなくここに置く（react-refresh/only-export-componentsを避ける目的もある）

import type { ComboBranchStats, FinishingMoveOption } from '../types';

/**
 * finishingMoveOptionsに新しく1件追加する時の初期値（技ごとの評価・記録項目を全て未入力で
 * 埋める）。src/components/combo/BranchStatsEditor.tsx（「この技を追加する」確定時）と
 * src/store.ts（migrateComboBranchStats、旧形式データの補完）の両方から使う
 */
export function createDefaultFinishingMoveOption(
  name: string,
  specialVariant: string | null,
): FinishingMoveOption {
  return {
    name,
    specialVariant,
    damageRating: null,
    dGaugeRating: null,
    saGaugeRating: null,
    carryRating: null,
    okizemeRating: null,
    difficultyRating: null,
    overallRating: null,
    isOverallRatingAutoSynced: true,
    plusFrame: null,
    isThrowRange: false,
    canOkizeme: false,
  };
}

export const DEFAULT_BRANCH_STATS: ComboBranchStats = {
  damage: null,
  dGaugeChange: null,
  opponentDGaugeChip: null,
  saGaugeGain: null,
  isDamageAutoSynced: true,
  isOpponentDGaugeChipAutoSynced: true,
  isDGaugeChangeAutoSynced: true,
  isSaGaugeGainAutoSynced: true,
  damageRating: null,
  dGaugeRating: null,
  saGaugeRating: null,
  carryRating: null,
  okizemeRating: null,
  difficultyRating: null,
  overallRating: null,
  isOverallRatingAutoSynced: true,
  plusFrame: null,
  isThrowRange: false,
  canOkizeme: false,
  isFavorite: false,
  startHitCondition: null,
  isJustParryStart: false,
  isRushStart: false,
  usesCA: false,
  finishingSpecialVariant: null,
  finishingMoveOptions: [],
  startingMoveNames: null,
  startingMoveCancelHitIndex: null,
};
