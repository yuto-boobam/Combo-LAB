// src/components/Header.tsx
// フェーズ0時点の最小限のヘッダー。
// ブランドロゴ・ニックネーム表示・ゲストバッジ・パッチノートを持つ。
// インポート/エクスポート（バックアップ）機能とサイドパネルの開閉は、
// コンボデータのモデルが決まるフェーズ1以降で追加する。

import type { CSSProperties, ReactNode } from 'react';
import { useAppStore } from '../store';
import PatchNotesModal from './patchNotes/PatchNotesModal';
import { NicknameDisplay } from './NicknameDisplay';

export type HeaderBreadcrumbItem =
  | string
  | {
    label: string;
    onClick?: () => void;
  };

interface HeaderProps {
  appName?: string;
  onLogoClick?: () => void;
  breadcrumbsSlot?: ReactNode;
  title?: string;
  subtitle?: string;
  breadcrumbs?: HeaderBreadcrumbItem[];
  rightSlot?: ReactNode;
}

export default function Header({
  appName = 'Combo-LAB',
  onLogoClick,
  breadcrumbsSlot,
  title,
  subtitle,
  breadcrumbs,
  rightSlot,
}: HeaderProps) {
  const isGuest = useAppStore((state) => state.isGuest);

  const isPatchNotesModalOpen = useAppStore((state) => state.isPatchNotesModalOpen);
  const selectedPatchNoteDate = useAppStore((state) => state.selectedPatchNoteDate);
  const openPatchNotesModal = useAppStore((state) => state.openPatchNotesModal);
  const closePatchNotesModal = useAppStore((state) => state.closePatchNotesModal);

  const breadcrumbItems =
    breadcrumbs && breadcrumbs.length > 0 ? breadcrumbs : title ? [title] : [];

  const hasSecondRow =
    Boolean(breadcrumbsSlot) || breadcrumbItems.length > 0 || Boolean(subtitle);

  return (
    <>
      <header style={styles.header}>
        <div style={styles.topRow}>
          <div style={styles.leftArea}>
            {onLogoClick ? (
              <button
                type="button"
                onClick={onLogoClick}
                style={{ ...styles.brand, cursor: 'pointer' }}
                title="ホームへ戻る"
              >
                <span style={styles.brandIcon}>🥊</span>
                <strong style={styles.brandText}>{appName}</strong>
              </button>
            ) : (
              <div style={styles.brand} title={appName}>
                <span style={styles.brandIcon}>🥊</span>
                <strong style={styles.brandText}>{appName}</strong>
              </div>
            )}

            <div style={styles.divider} />

            <NicknameDisplay showDivider={false} />

            {isGuest && <span style={styles.guestBadge}>ゲストモード</span>}
          </div>

          <div style={styles.actions}>
            {rightSlot}

            <button
              type="button"
              style={styles.patchNotesButton}
              onClick={() => openPatchNotesModal()}
              title="パッチノートを開く"
            >
              <span>📜</span>
              <span style={styles.compactButtonText}>パッチノート</span>
            </button>
          </div>
        </div>

        {hasSecondRow && (
          <div style={styles.secondRow}>
            <div style={styles.breadcrumbLabel}>現在位置</div>

            <div style={styles.breadcrumbContent}>
              {breadcrumbsSlot ? (
                breadcrumbsSlot
              ) : (
                <nav style={styles.breadcrumbs} aria-label="現在位置">
                  {breadcrumbItems.map((item, index) => {
                    const label = typeof item === 'string' ? item : item.label;
                    const onClick = typeof item === 'string' ? undefined : item.onClick;

                    return (
                      <span key={`${label}-${index}`} style={styles.breadcrumbItem}>
                        {index > 0 && <span style={styles.breadcrumbSeparator}>›</span>}

                        {onClick ? (
                          <button
                            type="button"
                            style={styles.breadcrumbButton}
                            onClick={onClick}
                          >
                            {label}
                          </button>
                        ) : (
                          <span style={styles.breadcrumbCurrent}>{label}</span>
                        )}
                      </span>
                    );
                  })}

                  {subtitle && <span style={styles.subtitle}>{subtitle}</span>}
                </nav>
              )}
            </div>
          </div>
        )}
      </header>

      <PatchNotesModal
        isOpen={isPatchNotesModalOpen}
        onClose={closePatchNotesModal}
        initialSelectedDate={selectedPatchNoteDate ?? undefined}
      />
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  header: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  },
  topRow: {
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '7px 10px',
    boxSizing: 'border-box',
  },
  leftArea: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    flex: '1 1 auto',
    overflow: 'hidden',
  },
  brand: {
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    height: 34,
    padding: '0 9px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
  },
  brandIcon: {
    fontSize: 18,
    lineHeight: 1,
  },
  brandText: {
    color: 'var(--text-primary)',
    fontSize: 14,
    letterSpacing: '-0.02em',
  },
  divider: {
    flex: '0 0 auto',
    width: 1,
    height: 22,
    background: 'var(--border)',
  },
  guestBadge: {
    flex: '0 0 auto',
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid var(--accent-amber-border)',
    background: 'var(--accent-amber-bg)',
    color: 'var(--accent-amber-text)',
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  actions: {
    flex: '0 1 auto',
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
  },
  patchNotesButton: {
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 11,
    border: '1px solid var(--accent-amber-border)',
    background: 'var(--accent-amber-bg)',
    color: 'var(--accent-amber-text)',
    padding: '0 9px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  compactButtonText: {
    lineHeight: 1,
  },
  secondRow: {
    minHeight: 34,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '5px 12px 8px',
    borderTop: '1px solid var(--border)',
    boxSizing: 'border-box',
  },
  breadcrumbLabel: {
    flex: '0 0 auto',
    color: 'var(--text-muted)',
    fontSize: 11,
    fontWeight: 800,
  },
  breadcrumbContent: {
    minWidth: 0,
    flex: '1 1 auto',
    overflowX: 'auto',
    overflowY: 'hidden',
    whiteSpace: 'nowrap',
    paddingBottom: 1,
  },
  breadcrumbs: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: 'var(--text-secondary)',
    fontSize: 12,
  },
  breadcrumbItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  breadcrumbSeparator: {
    color: 'var(--text-muted)',
  },
  breadcrumbButton: {
    border: 0,
    background: 'transparent',
    color: 'var(--text-secondary)',
    padding: 0,
    cursor: 'pointer',
    fontSize: 12,
  },
  breadcrumbCurrent: {
    color: 'var(--text-primary)',
    fontWeight: 750,
  },
  subtitle: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: 800,
  },
};
