// src/utils/branchStatsDefaults.ts
// ComboBranchStatsの初期値。BranchStatsEditor.tsx（未入力表示用）とSideDrawerPanel.tsx
// （finishingSpecialVariantを新規/既存ノードへ直接反映する時のベース値）の両方から使うため、
// コンポーネントファイルではなくここに置く（react-refresh/only-export-componentsを避ける目的もある）

import type { ComboBranchStats } from '../types';

export const DEFAULT_BRANCH_STATS: ComboBranchStats = {
  damage: null,
  dGaugeChange: null,
  opponentDGaugeChip: null,
  saGaugeGain: null,
  damageRating: null,
  dGaugeRating: null,
  saGaugeRating: null,
  carryRating: null,
  overallRating: null,
  plusFrame: null,
  plusFrameHitType: null,
  isThrowRange: false,
  canOkizeme: false,
  isFavorite: false,
  startHitCondition: null,
  isJustParryStart: false,
  isRushStart: false,
  usesCA: false,
  finishingSpecialVariant: null,
  finishingSuperArtName: null,
};
