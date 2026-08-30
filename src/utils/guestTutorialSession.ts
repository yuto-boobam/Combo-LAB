// src/utils/guestTutorialSession.ts
// ゲスト（ログイン無しのお試し閲覧）が使い方ガイドを最後まで見たかどうかを、
// タブ/ブラウザを閉じるまでだけ覚えておくためのフラグ。
//
// ログイン済みアカウントの同種フラグ(store.tsのhasSeenTutorialIntro)はlocalStorageへ
// 永続化するが、ゲストにそのまま使うと同じブラウザで後から本アカウントへログインした
// 時にまで「見た扱い」が残ってしまう。sessionStorageはタブを閉じると自動的に消えるため、
// ゲストの「一度サイトを落とすまでは保持したい」という要望を localStorage と分離しつつ
// 満たせる（2026-08-31ユーザー指定）。

const GUEST_TUTORIAL_SEEN_KEY = 'combo-lab-guest-tutorial-seen';

export function hasGuestSeenTutorial(): boolean {
  try {
    return sessionStorage.getItem(GUEST_TUTORIAL_SEEN_KEY) === '1';
  } catch {
    // プライベートブラウジング等でsessionStorageが使えない環境では、常に未視聴扱いにする
    return false;
  }
}

export function markGuestTutorialSeen(): void {
  try {
    sessionStorage.setItem(GUEST_TUTORIAL_SEEN_KEY, '1');
  } catch {
    // 保存できなくても致命的ではない（次回また誘導ガイドが出るだけ）
  }
}

export function clearGuestTutorialSeen(): void {
  try {
    sessionStorage.removeItem(GUEST_TUTORIAL_SEEN_KEY);
  } catch {
    // noop
  }
}
