import { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { AuthPage } from './pages/AuthPage';
import Header from './components/Header';
import { supabase } from './utils/supabaseClient';

/**
 * App.tsx — アプリのエントリポイント。
 * ログイン状態（user）に応じて、未ログインならAuthPage、ログイン済ならホーム画面を切り替える。
 *
 * フェーズ0時点ではキャラ選択・コンボの木はまだ実装しておらず、
 * ログイン後はプレースホルダー画面を表示する（フェーズ1以降で本実装）。
 */
function App() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const isGuest = useAppStore((s) => s.isGuest);
  const theme = useAppStore((s) => s.theme);

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
      <div
        className="flex flex-col h-full overflow-hidden"
        style={{ background: 'var(--bg-base)' }}
      >
        <Header />

        <main
          className="flex-1 flex items-center justify-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 12 }}>🥊</div>
            <p>Combo-LABへようこそ。キャラ選択・コンボの木はこれから実装します。</p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
