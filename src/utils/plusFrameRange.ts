// src/utils/plusFrameRange.ts
// MoveHitStats.groundPlusFrame/airPlusFrame（自由記述）を、末端ノードのプラスフレーム欄で
// 選択肢として提示するために整数配列へパースする。単一値・幅のある表記（半角/全角チルダ）
// のみ対応し、それ以外の自由記述（注釈付き等）はnullを返してUI側で生テキスト表示に留める。

export function parsePlusFrameRange(text: string): number[] | null {
  const trimmed = text.trim();

  const single = trimmed.match(/^([+-]?\d+)$/);
  if (single) return [Number(single[1])];

  const range = trimmed.match(/^([+-]?\d+)\s*[~〜]\s*([+-]?\d+)$/);
  if (!range) return null;

  const [start, end] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
