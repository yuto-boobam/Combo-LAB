// src/components/ConfirmDialog.tsx
// 汎用の「はい/いいえ」確認モーダル。既存のPatchNotesModalと同じ、暗いオーバーレイ+
// 中央カードのダイアログパターン（role="dialog"・Escapeで閉じる・オーバーレイクリックで
// キャンセル扱い・開いている間は背面をスクロールさせない）を踏襲している
// （2026-08-31ユーザー指定：window.confirmではなく既存のモーダルパターンに寄せること）。

import { useEffect } from 'react';
import type { CSSProperties } from 'react';

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'はい',
  cancelLabel = 'いいえ',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onMouseDown={onCancel} role="presentation">
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" style={styles.title}>
          {title}
        </h2>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button type="button" style={styles.cancelButton} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" style={styles.confirmButton} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'grid',
    placeItems: 'center',
    padding: 18,
    background: 'rgba(2, 6, 23, 0.76)',
    backdropFilter: 'blur(10px)',
  },
  modal: {
    width: 'min(340px, 100%)',
    borderRadius: 22,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    boxShadow: '0 24px 90px rgba(0, 0, 0, 0.55)',
    padding: '22px 20px',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 900,
    color: 'var(--text-primary)',
  },
  message: {
    margin: '10px 0 0',
    fontSize: 12.5,
    lineHeight: 1.7,
    color: 'var(--text-secondary)',
  },
  actions: {
    marginTop: 18,
    display: 'flex',
    justifyContent: 'center',
    gap: 10,
  },
  cancelButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
  },
  confirmButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
  },
};
