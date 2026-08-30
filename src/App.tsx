import { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { AuthPage } from './pages/AuthPage';
import { CharacterSelectPage } from './pages/CharacterSelectPage';
import { ComboTreePage } from './pages/ComboTreePage';
import { MoveStatsPage } from './pages/MoveStatsPage';
import { supabase } from './utils/supabaseClient';

/**
 * App.tsx — アプリのエントリポイント。
 * ログイン状態（user）に応じて、未ログインならAuthPage、ログイン済なら
 * キャラ選択→（選択後）コンボ登録画面を切り替える（企画書5ページの画面遷移）。
 * ゲーム選択は企画書の指示により実装しない。
 */
function App() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const goToCharacterSelect = useAppStore((s) => s.goToCharacterSelect);
  const isGuest = useAppStore((s) => s.isGuest);
  const theme = useAppStore((s) => s.theme);
  const selectedCharacterId = useAppStore((s) => s.selectedCharacterId);
  const moveStatsCharacterId = useAppStore((s) => s.moveStatsCharacterId);

  // 配色テーマをHTMLルート要素に反映（CSS変数の切り替えに使う）
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // localStorageからの復元（persist middleware）が完了するまで待つ。
  // 復元が終わる前にsetUser等でstore.set()を呼ぶと、persistミドルウェアが
  // まだ復元されていない初期状態を上書き保存してしまうため。
  const [hasHydrated, setHasHydrated] = useState(() =>
    useAppStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (hasHydrated) return;

    return useAppStore.persist.onFinishHydration(() => setHasHydrated(true));
  }, [hasHydrated]);

  // アプリ起動時およびセッション変更時にSupabaseの認証状態を同期
  // ゲストモード中はSupabaseセッションを持たないため同期をスキップする
  useEffect(() => {
    if (!hasHydrated || isGuest) return;

    // 現在のセッションを一度だけ取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // 認証状態の変化（ログイン・ログアウト等）をリアルタイムに検知して同期。
    // 'SIGNED_IN'（実際にサインインした瞬間）の時だけ画面遷移状態をリセットし、
    // 前回選んでいたキャラクターのコンボ画面や使い方ガイドへ自動で飛んでしまう
    // 不具合を防ぐ（2026-08-31ユーザー指摘）。'TOKEN_REFRESHED'等、操作中に
    // バックグラウンドで発火するイベントまでリセット対象にすると、閲覧中に
    // 突然キャラ選択画面へ戻される規模の大きい不具合になるため、対象は限定する
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') goToCharacterSelect();
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [hasHydrated, isGuest, setUser, goToCharacterSelect]);

  if (!hasHydrated) {
    return null;
  }

  if (!user && !isGuest) {
    return <AuthPage />;
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      {moveStatsCharacterId ? (
        <MoveStatsPage />
      ) : !selectedCharacterId ? (
        <CharacterSelectPage />
      ) : (
        <ComboTreePage />
      )}
    </div>
  );
}

export default App;
