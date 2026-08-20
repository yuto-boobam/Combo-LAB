const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function isLoopbackHostname(hostname: string = window.location.hostname): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

// UI表示の制御にのみ使う判定。実際のアクセス制御は必ずサーバ側（現状はVite dev
// serverのloopbackチェック、将来バックエンドが変わっても同様）で再検証すること。
export function canEditPatchNotesLocally(): boolean {
  return import.meta.env.DEV && isLoopbackHostname();
}

// 技データ（moveStatsSeed.ts）はビルドに同梱してゲスト含む全ユーザーが最初から
// 見られるようにする一方、編集はメンテナが手元でnpm run devした時だけ行える
// ようにする（編集結果をエクスポート→moveStatsSeed.tsに反映してコミットする運用）
export function canEditMoveStatsLocally(): boolean {
  return import.meta.env.DEV && isLoopbackHostname();
}

// ゲストモードのショーケースデータ（comboShowcaseSources/）の更新も、
// メンテナが手元でnpm run devした時だけ行えるようにする
export function canEditComboShowcaseLocally(): boolean {
  return import.meta.env.DEV && isLoopbackHostname();
}
