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

// 必殺技の「派生技の制約」「強度モード」「特殊性能」の登録・設定（MoveDefinition側の
// メタ情報）は、普段コンボを組むだけの利用者には不要な準備作業のため、公開中のWebでは
// 表示しない。既に登録済みの内容（技を選ぶ・強度を選ぶ・登録済みの特殊性能を選ぶ、等）は
// 引き続き全員が使えるようにし、「新しく登録する／設定を変える」操作だけをこの判定で隠す
// （2026-09-28ユーザー要望）
export function canConfigureMoveDefinitionsLocally(): boolean {
  return import.meta.env.DEV && isLoopbackHostname();
}
