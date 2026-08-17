import { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { AuthPage } from './pages/AuthPage';
import { CharacterSelectPage } from './pages/CharacterSelectPage';
import { ComboTreePage } from './pages/ComboTreePage';
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
  const isGuest = useAppStore((s) => s.isGuest);
  const theme = useAppStore((s) => s.theme);
  const selectedCharacterId = useAppStore((s) => s.selectedCharacterId);

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

    // 認証状態の変化（ログイン・ログアウト等）をリアルタイムに検知して同期
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [hasHydrated, isGuest, setUser]);

  if (!hasHydrated) {
    return null;
  }

  if (!user && !isGuest) {
    return <AuthPage />;
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      {!selectedCharacterId ? <CharacterSelectPage /> : <ComboTreePage />}
    </div>
  );
}

export default App;
