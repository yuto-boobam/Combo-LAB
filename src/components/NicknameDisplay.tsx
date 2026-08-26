import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';

/**
 * NicknameDisplay — ヘッダーに配置するニックネーム表示・編集コンポーネント。
 *
 * 通常時: ニックネーム + ✏️ ペンアイコン
 * 編集時: inputフィールドに切り替わる
 * Enter / blur で保存、Escでキャンセル
 */
interface NicknameDisplayProps {
  showDivider?: boolean;
}

// ヘッダーが狭まった時、スペースを含まない日本語文字列は単語区切りが無く
// 1文字ごとに折り返されてしまう（CSSのnowrap指定だけでは不十分で、そもそも
// 表示する文字数自体を減らす必要がある）。表示用に一定文字数で打ち切り、
// 超えた分は「…」で示す。保存側の上限（20文字）とは別物。
const MAX_DISPLAY_LENGTH = 8;

function truncateForDisplay(value: string): string {
  return value.length > MAX_DISPLAY_LENGTH
    ? `${value.slice(0, MAX_DISPLAY_LENGTH)}…`
    : value;
}

export function NicknameDisplay({ showDivider = true }: NicknameDisplayProps) {
  const nickname = useAppStore((s) => s.nickname);
  const setNickname = useAppStore((s) => s.setNickname);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 編集モード開始時にinputにフォーカス
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 編集開始
  const startEditing = () => {
    setEditValue(nickname);
    setIsEditing(true);
  };

  // 保存処理
  const save = async () => {
    const trimmed = editValue.trim();
    // 変更がなければ保存しない
    if (trimmed === nickname) {
      setIsEditing(false);
      return;
    }
    // 文字数制限（最大20文字）
    if (trimmed.length > 20) {
      alert('ニックネームは20文字以内で入力してください。');
      return;
    }
    setIsSaving(true);
    try {
      await setNickname(trimmed);
      setIsEditing(false);
    } catch {
      alert('ニックネームの保存に失敗しました。もう一度お試しください。');
    } finally {
      setIsSaving(false);
    }
  };

  // キャンセル
  const cancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  // キーボードイベント
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div
      id="nickname-display"
      className="flex items-center gap-2"
      style={{ marginLeft: 8 }}
    >
      {/* 区切り線 */}
      {showDivider && (
        <div
          style={{
            width: 1,
            height: 20,
            background: 'var(--border)',
            marginRight: 4,
          }}
        />
      )}

      {isEditing ? (
        /* ── 編集モード ── */
        <div className="flex items-center gap-1.5 animate-fadeIn">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={save}
            maxLength={20}
            disabled={isSaving}
            placeholder="ニックネームを入力"
            className="input-inline"
            style={{
              fontSize: 13,
              fontWeight: 500,
              width: 140,
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--accent)',
              color: 'var(--text-primary)',
              outline: 'none',
              opacity: isSaving ? 0.6 : 1,
            }}
          />
          {isSaving && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              保存中...
            </span>
          )}
        </div>
      ) : (
        /* ── 表示モード ── */
        <div className="flex items-center gap-1.5">
          <span
            title={nickname && nickname.length > MAX_DISPLAY_LENGTH ? nickname : undefined}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: nickname
                ? 'var(--text-secondary)'
                : 'var(--text-muted)',
              fontStyle: nickname ? 'normal' : 'italic',
              whiteSpace: 'nowrap',
            }}
          >
            {nickname ? truncateForDisplay(nickname) : 'ニックネーム未設定'}
          </span>

          {/* ペンアイコン（編集ボタン） */}
          <button
            id="edit-nickname-btn"
            className="btn-icon"
            onClick={startEditing}
            title="ニックネームを編集"
            style={{
              width: 26,
              height: 26,
              color: 'var(--text-muted)',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
