import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PatchNote } from '../../types/patchNote';
import {
  getInitialPatchNotes,
  getPatchNoteDates,
  getPatchNotesByDate,
  getPatchNotesByMonth,
  todayDateKey,
} from '../../services/patchNotesService';
import PatchNotesAddForm from './PatchNotesAddForm';
import PatchNotesCalendar from './PatchNotesCalendar';
import PatchNotesDetail from './PatchNotesDetail';
import PatchNotesEditor from './PatchNotesEditor';
import PatchNotesFullList from './PatchNotesFullList';
import { canEditPatchNotesLocally } from '../../utils/localEditAccess';

interface PatchNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedDate?: string;
}

type ViewMode = 'calendar' | 'list';
type EditorMode = 'closed' | 'edit' | 'add';

const CONTENT_MAX_HEIGHT = 'calc(min(860px, 100vh - 36px) - 74px)';

export default function PatchNotesModal({
  isOpen,
  onClose,
  initialSelectedDate,
}: PatchNotesModalProps) {
  const [notes, setNotes] = useState<PatchNote[]>(() => getInitialPatchNotes());
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const initialNotes = getInitialPatchNotes();
    return initialSelectedDate ?? getPatchNoteDates(initialNotes)[0] ?? todayDateKey();
  });
  const [displayMonth, setDisplayMonth] = useState<Date>(() => {
    const initialNotes = getInitialPatchNotes();
    const initialDate = initialSelectedDate ?? getPatchNoteDates(initialNotes)[0] ?? todayDateKey();
    return monthStartFromDateKey(initialDate);
  });
  const [editorMode, setEditorMode] = useState<EditorMode>('closed');
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');

  const canEdit = canEditPatchNotesLocally();

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setDisplayMonth(monthStartFromDateKey(date));
  };

  const handleNavigateMonth = (nextMonth: Date) => {
    setDisplayMonth(nextMonth);
    setSelectedDate(null);
  };

  const handleDeselectDate = () => {
    setSelectedDate(null);
  };

  useEffect(() => {
    if (isOpen && initialSelectedDate) {
      handleSelectDate(initialSelectedDate);
    }
  }, [initialSelectedDate, isOpen]);

  useEffect(() => {
    if (!selectedDate) {
      setEditorMode('closed');
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!isOpen) {
      setEditorMode('closed');
      setViewMode('calendar');
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const panelNotes = useMemo(() => {
    if (selectedDate) {
      return getPatchNotesByDate(notes, selectedDate);
    }

    return getPatchNotesByMonth(notes, displayMonth.getFullYear(), displayMonth.getMonth());
  }, [notes, selectedDate, displayMonth]);

  const panelHeading = selectedDate
    ? `${formatDateLabelKanji(selectedDate)} のパッチノート`
    : `${displayMonth.getFullYear()}年${displayMonth.getMonth() + 1}月 のパッチノート`;

  const panelEmptyMessage = selectedDate
    ? `${formatDateLabelKanji(selectedDate)} の更新履歴はありません`
    : `${displayMonth.getFullYear()}年${displayMonth.getMonth() + 1}月 の更新履歴はありません`;

  const patchNoteDateCount = useMemo(() => getPatchNoteDates(notes).length, [notes]);

  if (!isOpen) {
    return null;
  }

  return (
    <div style={styles.overlay} onMouseDown={onClose} role="presentation">
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patch-notes-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header style={styles.header}>
          <div>
            <h2 id="patch-notes-title" style={styles.title}>
              📜 パッチノート
            </h2>
            <p style={styles.subtitle}>
              src/data/patchNotes.json で管理中 / {patchNoteDateCount}日分の更新履歴
            </p>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.viewToggle} role="group" aria-label="表示モード切り替え">
              <button
                type="button"
                style={{
                  ...styles.viewToggleButton,
                  ...(viewMode === 'calendar' ? styles.viewToggleButtonActive : {}),
                }}
                aria-pressed={viewMode === 'calendar'}
                onClick={() => setViewMode('calendar')}
              >
                カレンダー
              </button>

              <button
                type="button"
                style={{
                  ...styles.viewToggleButton,
                  ...(viewMode === 'list' ? styles.viewToggleButtonActive : {}),
                }}
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
              >
                一覧
              </button>
            </div>

            <button type="button" style={styles.closeButton} onClick={onClose} aria-label="閉じる">
              ×
            </button>
          </div>
        </header>

        <div
          style={{
            ...styles.content,
            gridTemplateColumns: viewMode === 'calendar' ? styles.content.gridTemplateColumns : '1fr',
          }}
        >
          {viewMode === 'calendar' && (
            <aside style={styles.leftPane}>
              <PatchNotesCalendar
                notes={notes}
                selectedDate={selectedDate}
                displayMonth={displayMonth}
                onSelectDate={handleSelectDate}
                onNavigateMonth={handleNavigateMonth}
                onDeselectDate={handleDeselectDate}
              />

              {canEdit && (
                <div style={styles.editorModeButtons}>
                  <button
                    type="button"
                    style={{
                      ...styles.editorModeButton,
                      ...(editorMode === 'edit' ? styles.editorModeButtonActive : {}),
                      ...(selectedDate ? {} : styles.editorModeButtonDisabled),
                    }}
                    disabled={!selectedDate}
                    title={selectedDate ? undefined : '日付を選択してください'}
                    aria-pressed={editorMode === 'edit'}
                    onClick={() =>
                      setEditorMode((current) => (current === 'edit' ? 'closed' : 'edit'))
                    }
                  >
                    ✎ 編集
                  </button>

                  <button
                    type="button"
                    style={{
                      ...styles.editorModeButton,
                      ...(editorMode === 'add' ? styles.editorModeButtonActive : {}),
                      ...(selectedDate ? {} : styles.editorModeButtonDisabled),
                    }}
                    disabled={!selectedDate}
                    title={selectedDate ? undefined : '日付を選択してください'}
                    aria-pressed={editorMode === 'add'}
                    onClick={() =>
                      setEditorMode((current) => (current === 'add' ? 'closed' : 'add'))
                    }
                  >
                    ＋ 追加
                  </button>
                </div>
              )}
            </aside>
          )}

          <main style={styles.rightPane}>
            {viewMode === 'list' ? (
              <PatchNotesFullList notes={notes} maxHeight={CONTENT_MAX_HEIGHT} />
            ) : canEdit && editorMode === 'edit' && selectedDate ? (
              <PatchNotesEditor
                selectedDate={selectedDate}
                notes={notes}
                onNotesChange={setNotes}
                onClose={() => setEditorMode('closed')}
              />
            ) : canEdit && editorMode === 'add' && selectedDate ? (
              <PatchNotesAddForm
                selectedDate={selectedDate}
                notes={notes}
                onNotesChange={setNotes}
                onClose={() => setEditorMode('closed')}
              />
            ) : (
              <PatchNotesDetail
                heading={panelHeading}
                emptyMessage={panelEmptyMessage}
                notes={panelNotes}
                showDatePerCard={!selectedDate}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function monthStartFromDateKey(dateKey: string): Date {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

  if (!matched) {
    return new Date();
  }

  return new Date(Number(matched[1]), Number(matched[2]) - 1, 1);
}

function formatDateLabelKanji(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');

  if (!year || !month || !day) {
    return dateKey;
  }

  return `${year}年${Number(month)}月${Number(day)}日`;
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
    width: 'min(1080px, 100%)',
    maxHeight: 'min(860px, calc(100vh - 36px))',
    overflow: 'hidden',
    borderRadius: 22,
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background:
      'linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98))',
    boxShadow: '0 24px 90px rgba(0, 0, 0, 0.55)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
  },
  title: {
    margin: 0,
    color: '#f8fafc',
    fontSize: 19,
    fontWeight: 900,
  },
  subtitle: {
    margin: '5px 0 0',
    color: '#94a3b8',
    fontSize: 12,
  },
  headerRight: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  closeButton: {
    flex: '0 0 auto',
    width: 36,
    height: 36,
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.2)',
    background: 'rgba(30, 41, 59, 0.7)',
    color: '#e5e7eb',
    cursor: 'pointer',
    fontSize: 22,
    lineHeight: 1,
  },
  viewToggle: {
    display: 'flex',
    gap: 8,
  },
  viewToggleButton: {
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(30, 41, 59, 0.65)',
    color: '#cbd5e1',
    borderRadius: 999,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  viewToggleButtonActive: {
    borderColor: '#facc15',
    background: 'rgba(250, 204, 21, 0.16)',
    color: '#fde68a',
  },
  content: {
    display: 'grid',
    gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)',
    gap: 16,
    padding: 16,
    overflow: 'auto',
    maxHeight: CONTENT_MAX_HEIGHT,
  },
  leftPane: {
    display: 'grid',
    alignContent: 'start',
    gap: 12,
  },
  rightPane: {
    minWidth: 0,
  },
  editorModeButtons: {
    display: 'flex',
    gap: 8,
  },
  editorModeButton: {
    flex: '1 1 0',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background: 'rgba(30, 41, 59, 0.7)',
    color: '#e5e7eb',
    borderRadius: 14,
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
  },
  editorModeButtonActive: {
    borderColor: '#facc15',
    background: 'rgba(250, 204, 21, 0.16)',
    color: '#fde68a',
  },
  editorModeButtonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
};
