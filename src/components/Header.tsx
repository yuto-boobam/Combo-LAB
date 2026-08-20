// src/components/Header.tsx
// ブランドロゴ・ニックネーム表示・ゲストバッジ・パッチノート・バックアップを持つ共通ヘッダー。
// バックアップの「エクスポート／上書き保存」は、呼び出し元から渡された character
// 1人分のみを対象にする（1キャラ1JSONファイルで管理する運用のため）。
// 「インポート」は character 単体・{characters: [...]}・配列のいずれの形式のJSONも読める。

import type { ChangeEvent, CSSProperties, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useAppStore } from '../store';
import type { Character } from '../types';
import { getStoredFileHandle, setStoredFileHandle } from '../utils/fileHandleStore';
import { downloadJson } from '../utils/downloadJson';
import { canEditMoveStatsLocally } from '../utils/localEditAccess';
import PatchNotesModal from './patchNotes/PatchNotesModal';
import { NicknameDisplay } from './NicknameDisplay';

const isFileSystemAccessSupported =
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

function isCharacter(value: unknown): value is Character {
  return Boolean(value) && typeof value === 'object' && 'id' in (value as object);
}

function extractCharactersFromImportedJson(parsed: unknown): Partial<Character>[] | null {
  if (isCharacter(parsed)) return [parsed];

  const candidate =
    parsed && typeof parsed === 'object' && 'characters' in parsed
      ? (parsed as { characters: unknown }).characters
      : parsed;

  return Array.isArray(candidate) ? (candidate as Partial<Character>[]) : null;
}

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
  // 指定すると「エクスポート」「上書き保存」がこのキャラ1人分だけを対象にする。
  // 未指定（例: キャラ選択画面）の場合はその2項目自体を出さない。
  character?: Character;
}

export default function Header({
  appName = 'Combo-LAB',
  onLogoClick,
  breadcrumbsSlot,
  title,
  subtitle,
  breadcrumbs,
  rightSlot,
  character,
}: HeaderProps) {
  const isGuest = useAppStore((state) => state.isGuest);
  const logout = useAppStore((state) => state.logout);

  const isPatchNotesModalOpen = useAppStore((state) => state.isPatchNotesModalOpen);
  const selectedPatchNoteDate = useAppStore((state) => state.selectedPatchNoteDate);
  const openPatchNotesModal = useAppStore((state) => state.openPatchNotesModal);
  const closePatchNotesModal = useAppStore((state) => state.closePatchNotesModal);

  const restoreCharacters = useAppStore((state) => state.restoreCharacters);
  const moveStatsDatabase = useAppStore((state) => state.moveStatsDatabase);
  const restoreMoveStatsDatabase = useAppStore((state) => state.restoreMoveStatsDatabase);
  const canEditMoveStats = !isGuest && canEditMoveStatsLocally();

  const [isBackupMenuOpen, setIsBackupMenuOpen] = useState(false);
  const [backupMenuPosition, setBackupMenuPosition] = useState({ top: 0, right: 0 });
  const backupButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moveStatsFileInputRef = useRef<HTMLInputElement>(null);
  // キャラごとにファイルハンドルをキャッシュする（単一のrefだと、Headerを
  // 再マウントせずにキャラを切り替えた時に前のキャラのハンドルを使い回してしまう）
  const saveFileHandleCacheRef = useRef<Map<string, FileSystemFileHandle>>(new Map());

  const handleBackupButtonClick = () => {
    const rect = backupButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setBackupMenuPosition({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setIsBackupMenuOpen((open) => !open);
  };

  const handleExport = () => {
    if (!character) return;
    downloadJson(`${character.id}.json`, character);
    setIsBackupMenuOpen(false);
  };

  const handleImportButtonClick = () => {
    setIsBackupMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    let importedCharacters: Partial<Character>[] | null = null;
    try {
      importedCharacters = extractCharactersFromImportedJson(JSON.parse(await file.text()));
    } catch {
      importedCharacters = null;
    }

    if (!importedCharacters) {
      window.alert(
        'インポートに失敗しました。Combo-LABからエクスポートしたバックアップのjsonファイルを選択してください。',
      );
      return;
    }

    const confirmed = window.confirm(
      'バックアップを読み込みます。現在のキャラクターデータは上書きされます。よろしいですか？',
    );
    if (!confirmed) return;

    restoreCharacters(importedCharacters);
  };

  const handleExportMoveStats = () => {
    downloadJson('combo-lab-move-stats.json', moveStatsDatabase);
    setIsBackupMenuOpen(false);
  };

  const handleImportMoveStatsButtonClick = () => {
    setIsBackupMenuOpen(false);
    moveStatsFileInputRef.current?.click();
  };

  const handleImportMoveStatsFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      window.alert('読み込みに失敗しました。技データのJSONファイルを選択してください。');
      return;
    }

    const confirmed = window.confirm(
      '技データ（全キャラぶん）を読み込みます。現在の技データは上書きされます。よろしいですか？',
    );
    if (!confirmed) return;

    restoreMoveStatsDatabase(parsed);
  };

  const handleSaveOverwrite = async () => {
    setIsBackupMenuOpen(false);
    if (!character) return;

    if (!isFileSystemAccessSupported || !window.showSaveFilePicker) {
      handleExport();
      return;
    }

    // キャラごとに別ファイルを覚えておく（固定キーのままだと、別キャラの画面で
    // 上書き保存した時に前のキャラのファイルを誤って上書きしてしまうため）
    const fileHandleKey = `combo-lab-backup-${character.id}`;

    try {
      let handle =
        saveFileHandleCacheRef.current.get(character.id) ??
        (await getStoredFileHandle(fileHandleKey)) ??
        undefined;

      if (!handle) {
        handle = await window.showSaveFilePicker({
          suggestedName: `${character.id}.json`,
          types: [
            { description: 'JSON', accept: { 'application/json': ['.json'] } },
          ],
        });
        await setStoredFileHandle(fileHandleKey, handle);
      }

      saveFileHandleCacheRef.current.set(character.id, handle);

      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        const requested = await handle.requestPermission({ mode: 'readwrite' });
        if (requested !== 'granted') {
          window.alert('ファイルへの書き込み権限が許可されませんでした。');
          return;
        }
      }

      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(character, null, 2));
      await writable.close();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      window.alert('上書き保存に失敗しました。');
    }
  };

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

            {isGuest && <span style={styles.guestBadge}>閲覧専用</span>}
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

            {!isGuest && (
              <div style={styles.backupMenuWrapper}>
                <button
                  ref={backupButtonRef}
                  type="button"
                  style={styles.backupButton}
                  onClick={handleBackupButtonClick}
                  title="バックアップ（エクスポート／インポート）"
                  aria-haspopup="menu"
                  aria-expanded={isBackupMenuOpen}
                >
                  <span>💾</span>
                  <span style={styles.compactButtonText}>バックアップ</span>
                </button>

                {isBackupMenuOpen && (
                  <>
                    <div
                      style={styles.backupMenuOverlay}
                      onClick={() => setIsBackupMenuOpen(false)}
                    />

                    <div
                      style={{
                        ...styles.backupMenu,
                        top: backupMenuPosition.top,
                        right: backupMenuPosition.right,
                      }}
                      role="menu"
                    >
                      {character && (
                        <button
                          type="button"
                          role="menuitem"
                          style={styles.backupMenuItem}
                          onClick={handleExport}
                        >
                          <span>⬇️</span>
                          <span>エクスポート（{character.name}）</span>
                        </button>
                      )}

                      <button
                        type="button"
                        role="menuitem"
                        style={styles.backupMenuItem}
                        onClick={handleImportButtonClick}
                      >
                        <span>⬆️</span>
                        <span>インポート</span>
                      </button>

                      {character && (
                        <button
                          type="button"
                          role="menuitem"
                          style={styles.backupMenuItem}
                          onClick={handleSaveOverwrite}
                          title={
                            isFileSystemAccessSupported
                              ? undefined
                              : 'このブラウザは上書き保存に非対応のため、新規ダウンロードになります'
                          }
                        >
                          <span>💽</span>
                          <span>
                            上書き保存（{character.name}）{isFileSystemAccessSupported ? '' : '（新規DL）'}
                          </span>
                        </button>
                      )}

                      <div style={styles.backupMenuDivider} />

                      <button
                        type="button"
                        role="menuitem"
                        style={styles.backupMenuItem}
                        onClick={handleExportMoveStats}
                      >
                        <span>⬇️</span>
                        <span>技データをエクスポート（全キャラぶん）</span>
                      </button>

                      {canEditMoveStats && (
                        <button
                          type="button"
                          role="menuitem"
                          style={styles.backupMenuItem}
                          onClick={handleImportMoveStatsButtonClick}
                        >
                          <span>⬆️</span>
                          <span>技データを読み込む</span>
                        </button>
                      )}
                    </div>
                  </>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  style={styles.hiddenFileInput}
                  onChange={handleImportFileChange}
                />
                <input
                  ref={moveStatsFileInputRef}
                  type="file"
                  accept="application/json"
                  style={styles.hiddenFileInput}
                  onChange={handleImportMoveStatsFileChange}
                />
              </div>
            )}

            <button
              type="button"
              style={styles.logoutButton}
              onClick={() => {
                void logout();
              }}
              title="ログアウト"
            >
              <span>🚪</span>
              <span style={styles.compactButtonText}>ログアウト</span>
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
  backupMenuWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  backupButton: {
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 11,
    border: '1px solid var(--accent-teal-border)',
    background: 'var(--accent-teal-bg)',
    color: 'var(--accent-teal-text)',
    padding: '0 9px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  logoutButton: {
    height: 32,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 11,
    border: '1px solid var(--accent-rose-border)',
    background: 'var(--accent-rose-bg)',
    color: 'var(--accent-rose-text)',
    padding: '0 9px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  backupMenuOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 59,
  },
  backupMenu: {
    position: 'fixed',
    zIndex: 60,
    minWidth: 176,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 4,
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
  },
  backupMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '7px 9px',
    borderRadius: 8,
    border: 0,
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  backupMenuDivider: {
    height: 1,
    margin: '4px 2px',
    background: 'var(--border)',
  },
  hiddenFileInput: {
    display: 'none',
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
