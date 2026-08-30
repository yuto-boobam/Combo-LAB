// src/utils/textDisplay.ts
// ノード名・グループ名表示で共通して使う、ちょっとしたテキスト整形。

/**
 * 表示テキスト中の「｜」を改行に変換する。自動折り返しが意図しない位置
 * （例:「Lv.」と「1」の間）で発生する問題を避けるため、改行を入れたい位置を
 * ユーザーが「｜」で明示的に指定できるようにするための変換（MoveNodeCircle.tsx・
 * GroupPillNode.tsx共通）。呼び出し側でwhiteSpace: 'pre-line'を指定しないと、
 * ここで挿入した改行文字がCSS側で潰されて効かない点に注意
 */
export function applyManualLineBreaks(text: string): string {
  return text.replace(/｜|\|/g, '\n');
}
