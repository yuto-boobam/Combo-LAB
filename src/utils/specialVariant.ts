// src/utils/specialVariant.ts
// 必殺技の「特殊性能」（ストック・同時押し・ホールドLvなど）は強度ごとに使える選択肢が異なりうる
// （例: イングリッドのサンフレアは弱＝チャージ専用、中＝Lv.0専用、強・OD＝Lv.1/Lv.2から選べる）。
// この強度別の選択肢一覧を取得するロジックを、MoveNamePicker.tsx（ノード上での技名選択）と
// MoveStatsPage.tsx（技データの行生成）の両方から同じように使うために独立させている。

import type { MoveDefinition, MoveStrength } from '../types';

/** この強度で使える特殊性能の選択肢一覧（登録されていなければ空配列＝プレーンな技として確定） */
export function getSpecialVariantOptions(move: MoveDefinition, strength: MoveStrength): string[] {
  return move.specialVariantsByStrength?.[strength] ?? [];
}
