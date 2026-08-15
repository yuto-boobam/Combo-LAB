import { useState } from 'react';
import { useAppStore } from '../store';
import { supabase } from '../utils/supabaseClient';

export function AuthPage() {
  const enterGuestMode = useAppStore((s) => s.enterGuestMode);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Supabaseを使用した本物の認証処理
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { nickname: nickname.trim() },
          },
        });
        if (error) throw error;
        alert('アカウント登録リクエストを送信しました！確認メールが届いているか受信箱をご確認ください。（※Supabase側でメール確認設定がオフの場合は、そのまま自動でログインされます）');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setErrorMessage(err.message || '認証中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen p-4"
      style={{
        background: 'radial-gradient(circle at top, #1e1b4b 0%, #09090b 100%)',
      }}
    >
      <div
        className="w-full max-w-md p-8 rounded-2xl glass animate-scaleIn"
        style={{
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* ロゴとヘッダー */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)',
            }}
          >
            🥊
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
            Combo-LAB
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            格闘ゲーム コンボ管理ツール
          </p>
        </div>

        {/* タブ切り替え */}
        <div className="flex mb-6 p-1 bg-zinc-900 rounded-lg" style={{ border: '1px solid var(--border)' }}>
          <button
            className="flex-1 py-2 text-sm font-medium rounded-md transition-all duration-150"
            style={{
              background: !isSignUp ? 'var(--bg-elevated)' : 'transparent',
              color: !isSignUp ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
            onClick={() => {
              setIsSignUp(false);
              setErrorMessage(null);
            }}
          >
            ログイン
          </button>
          <button
            className="flex-1 py-2 text-sm font-medium rounded-md transition-all duration-150"
            style={{
              background: isSignUp ? 'var(--bg-elevated)' : 'transparent',
              color: isSignUp ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
            onClick={() => {
              setIsSignUp(true);
              setErrorMessage(null);
            }}
          >
            新規登録
          </button>
        </div>

        {/* エラー表示 */}
        {errorMessage && (
          <div className="p-3 mb-4 text-xs rounded bg-red-955/40 text-red-300 border border-red-900/40 animate-fadeIn flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* フォーム */}
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              メールアドレス
            </label>
            <input
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          {/* ニックネーム欄（新規登録時のみ表示） */}
          {isSignUp && (
            <div className="animate-fadeIn">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                ニックネーム
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="あなたの表示名（最大20文字）"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                disabled={isLoading}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              パスワード
            </label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="w-full btn-primary justify-center py-3 mt-2 text-sm font-semibold"
            disabled={isLoading}
            style={{
              opacity: isLoading ? 0.7 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? '処理中...' : (isSignUp ? 'アカウントを作成' : 'サインイン')}
          </button>
        </form>

        {/* 区切り線 */}
        <div className="flex items-center gap-3 my-5">
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            または
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* ゲストモード（閲覧専用）ボタン */}
        <button
          type="button"
          className="w-full btn-ghost justify-center py-3 text-sm font-semibold"
          onClick={() => {
            setErrorMessage(null);
            enterGuestMode();
          }}
        >
          閲覧専用で見る（ゲストモード）
        </button>
        <div className="mt-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          ※ 登録不要で、作成済みのコンボの木を閲覧専用で見られます（編集はできません）。
        </div>

        <div className="mt-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          ※ アカウント情報はSupabaseにより安全に管理されます。
        </div>
      </div>
    </div>
  );
}
