// src/utils/resolvePatchNoteImageUrl.ts
// パッチノート画像のURL解決。アップロード機能（vite-plugins/patchNotesLocalApiPlugin.ts）は
// Viteのpublicディレクトリへルート絶対パス（例:「/images/patch-notes/2026/08/xxx.png」）で
// 保存し、そのままsrc/data/patchNotes.jsonへ保存している。GitHub Pages配信時はbase
// （vite.config.tsの'/Combo-LAB/'）配下にサイトが置かれるため、このルート絶対パスを
// そのまま<img src>に使うとbase配下に無いパスとして404になり、画像が表示されなくなる
// （2026-09-18ユーザー報告：パッチノートの写真が閲覧できなくなっている）。
// 外部URL（テキスト欄に直接貼られたhttp(s)://・プロトコル相対//・data:）はそのまま使い、
// アップロード機能が発行したルート絶対パスの場合だけimport.meta.env.BASE_URLを前置する。
export function resolvePatchNoteImageUrl(url: string): string {
  if (/^([a-z]+:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return `${import.meta.env.BASE_URL}${url.slice(1)}`;
  return url;
}
