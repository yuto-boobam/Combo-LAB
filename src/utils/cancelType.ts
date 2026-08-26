// src/utils/cancelType.ts
// 技の各段（MoveHitStats.cancelType）から、MoveStats.cancelableSuperArtNamesを自動導出する。
// 末端ノードの「SAで締める」機能はSA3(・CA)のみを対象とする運用のため、個別にSA名を
// 選ばせる手動UIは廃止し、この段階的なキャンセル種類から自動で決める（2026-08-26ユーザー指定）。

import { SA3_CANCELABLE_TYPES } from '../types';
import type { MoveHitStats } from '../types';

/**
 * hits内のいずれかの段が「全般」「SAすべて」「SA2以上」「SA3のみ」のいずれかであれば、
 * SA3へキャンセル可能とみなす（CAはSA3と同じキャンセル可否になるため、実際の展開は
 * findFinishingSuperArtOptions側で行う。ここでは['SA3']か[]のどちらかを返すだけでよい）。
 */
export function deriveCancelableSuperArtNames(hits: MoveHitStats[]): string[] {
  const canCancelToSA3 = hits.some(
    (hit) => hit.cancelType !== null && SA3_CANCELABLE_TYPES.includes(hit.cancelType),
  );
  return canCancelToSA3 ? ['SA3'] : [];
}
