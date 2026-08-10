import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PatchNote, PatchNoteType } from '../../types/patchNote';
import { useAppStore } from '../../store';
import {
  getPatchNotesByDate,
  removePatchNote,
  saveNotesToLocalFile,
  toPatchNotesJson,
  upsertPatchNote,
} from '../../services/patchNotesService';
import PatchNoteImageUploadField from './PatchNoteImageUploadField';

const GUEST_DENIED_MESSAGE = 'ゲストモードには編集を保存する権限がありません。';

interface PatchNotesEditorProps {
  selectedDate: string;
  notes: PatchNote[];
  onNotesChange: (nextNotes: PatchNote[]) => void;
  onClose?: () => void;
}

type EditorMessage = {
  type: 'success' | 'error' | 'info';
  text: string;
};

export default function PatchNotesEditor({
  selectedDate,
  notes,
  onNotesChange,
  onClose,
}: PatchNotesEditorProps) {
  const sameDayNotes = useMemo(() => getPatchNotesByDate(notes, selectedDate), [notes, selectedDate]);
  const isGuest = useAppStore((state) => state.isGuest);

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<EditorMessage | null>(null);
  const [form, setForm] = useState<PatchNote | null>(() => sameDayNotes[0] ?? null);

  useEffect(() => {
    setForm(sameDayNotes[0] ?? null);
    setMessage(null);
  }, [selectedDate, sameDayNotes]);

  const sanitizeCurrentForm = useCallback((currentForm: PatchNote): PatchNote => {
    return {
      ...currentForm,
      title: currentForm.title.trim() || '無題のパッチノート',
      description:
        currentForm.description.trim() || 'Why / 変更理由:\n変更理由を記入してください。',
      beforeImageUrl: normalizeImageUrl(currentForm.beforeImageUrl),
      afterImageUrl: normalizeImageUrl(currentForm.afterImageUrl),
    };
  }, []);

  const jsonPreview = useMemo(() => {
    if (!form) {
      return toPatchNotesJson(notes);
    }

    return toPatchNotesJson(upsertPatchNote(notes, sanitizeCurrentForm(form)));
  }, [notes, form, sanitizeCurrentForm]);

  const updateField = <K extends keyof PatchNote>(field: K, value: PatchNote[K]) => {
    setForm((previousForm) => (previousForm ? { ...previousForm, [field]: value } : previousForm));
  };

  const saveToWorkingNotes = (): PatchNote[] => {
    if (!form) {
      return notes;
    }

    const sanitizedNote = sanitizeCurrentForm(form);
    const nextNotes = upsertPatchNote(notes, sanitizedNote);

    onNotesChange(nextNotes);
    setForm(sanitizedNote);

    return nextNotes;
  };

  const handleReflectPreview = () => {
    if (isGuest) {
      setMessage({ type: 'error', text: GUEST_DENIED_MESSAGE });
      return;
    }

    saveToWorkingNotes();
  };

  const handleSaveToLocalFile = async () => {
    if (!form) {
      return;
    }

    if (isGuest) {
      setMessage({ type: 'error', text: GUEST_DENIED_MESSAGE });
      return;
    }

    setIsSaving(true);

    try {
      const nextNotes = saveToWorkingNotes();
      await saveNotesToLocalFile(nextNotes);

      setMessage({
        type: 'success',
        text: 'src/data/patchNotes.json に保存しました。',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ファイルへの保存に失敗しました。',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectExistingNote = (selectedNoteId: string) => {
    const selectedNote = sameDayNotes.find((note) => note.id === selectedNoteId);

    if (selectedNote) {
      setForm(selectedNote);
    }
  };

  const handleDeleteNote = () => {
    if (!form) {
      return;
    }

    if (isGuest) {
      setMessage({ type: 'error', text: GUEST_DENIED_MESSAGE });
      return;
    }

    if (typeof window !== 'undefined' && !window.confirm('このパッチノートを削除しますか？')) {
      return;
    }

    const nextNotes = removePatchNote(notes, form.id);
    onNotesChange(nextNotes);

    const remainingSameDayNotes = getPatchNotesByDate(nextNotes, selectedDate);
    setForm(remainingSameDayNotes[0] ?? null);

    setMessage({
      type: 'success',
      text: '編集中データから削除しました。確定するには保存ボタンを押してください。',
    });
  };

  if (!form) {
    return (
      <section style={styles.container}>
        <div style={styles.emptyPanel}>
          <div style={styles.emptyIcon}>📭</div>
          <h3 style={styles.emptyTitle}>この日にはまだパッチノートがありません</h3>
          <p style={styles.emptyText}>「追加」ボタンから新規作成してください。</p>

          {onClose && (
            <button type="button" style={styles.ghostButton} onClick={onClose}>
              閲覧へ戻る
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section style={styles.container}>
      <div style={styles.editorHeader}>
        <div>
          <h3 style={styles.title}>開発者用：パッチノート編集</h3>
          <p style={styles.mutedText}>
            localhost環境ではサイト内から直接 src/data/patchNotes.json を更新できます。
          </p>
        </div>

        <span style={styles.devBadge}>LOCAL only</span>
      </div>

      {message && (
        <div style={{ ...styles.message, ...getMessageStyle(message.type) }}>{message.text}</div>
      )}

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h4 style={styles.sectionTitle}>パッチノート内容</h4>

          {sameDayNotes.length > 1 && (
            <select
              style={styles.select}
              value={form.id}
              onChange={(event) => handleSelectExistingNote(event.target.value)}
            >
              {sameDayNotes.map((note) => (
                <option key={note.id} value={note.id}>
                  第{note.buildNumber}回 - {note.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={styles.formGrid}>
          <label style={styles.label}>
            Date
            <input style={styles.input} value={selectedDate} readOnly />
          </label>

          <label style={styles.label}>
            Build（自動採番）
            <input style={styles.input} value={`第${form.buildNumber}回`} readOnly />
          </label>

          <label style={styles.label}>
            Type
            <select
              style={styles.select}
              value={form.type}
              onChange={(event) => updateField('type', event.target.value as PatchNoteType)}
            >
              <option value="feature">feature / 新機能</option>
              <option value="bugfix">bugfix / バグ修正</option>
              <option value="spec-change">spec-change / 仕様変更</option>
              <option value="other">other / その他</option>
            </select>
          </label>
        </div>

        <label style={styles.label}>
          Title
          <input
            style={styles.input}
            value={form.title}
            placeholder="例: タスクカードのドラッグ並び替えを追加"
            onChange={(event) => updateField('title', event.target.value)}
          />
        </label>

        <label style={styles.label}>
          Description / Why
          <textarea
            style={styles.textarea}
            value={form.description}
            rows={8}
            placeholder="Why / 変更理由を記入"
            onChange={(event) => updateField('description', event.target.value)}
          />
        </label>

        <div style={styles.formGrid}>
          <PatchNoteImageUploadField
            displayLabel="Before Image"
            uploadLabel="before"
            value={form.beforeImageUrl}
            onChange={(value) => updateField('beforeImageUrl', value)}
            date={selectedDate}
            buildNumber={form.buildNumber}
          />

          <PatchNoteImageUploadField
            displayLabel="After Image"
            uploadLabel="after"
            value={form.afterImageUrl}
            onChange={(value) => updateField('afterImageUrl', value)}
            date={selectedDate}
            buildNumber={form.buildNumber}
          />
        </div>

        <div style={styles.buttonRow}>
          <button type="button" style={styles.secondaryButton} onClick={handleReflectPreview}>
            反映（プレビュー）
          </button>

          <button
            type="button"
            style={{
              ...styles.primaryButton,
              ...(isSaving ? styles.disabledButton : {}),
            }}
            disabled={isSaving}
            onClick={() => void handleSaveToLocalFile()}
          >
            {isSaving ? '保存中...' : '保存（ファイルに書き込む）'}
          </button>

          <button type="button" style={styles.dangerButton} onClick={handleDeleteNote}>
            削除
          </button>

          {onClose && (
            <button type="button" style={styles.ghostButton} onClick={onClose}>
              閲覧へ戻る
            </button>
          )}
        </div>
      </section>

      <details style={styles.previewDetails}>
        <summary style={styles.detailsSummary}>生成される patchNotes.json を確認</summary>
        <pre style={styles.preview}>{jsonPreview}</pre>
      </details>
    </section>
  );
}

function normalizeImageUrl(value: string | null | undefined): string | null {
  const trimmedValue = typeof value === 'string' ? value.trim() : '';
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function getMessageStyle(type: EditorMessage['type']): CSSProperties {
  if (type === 'success') {
    return {
      borderColor: 'rgba(34, 197, 94, 0.35)',
      background: 'rgba(22, 163, 74, 0.12)',
      color: '#bbf7d0',
    };
  }

  if (type === 'error') {
    return {
      borderColor: 'rgba(248, 113, 113, 0.35)',
      background: 'rgba(220, 38, 38, 0.12)',
      color: '#fecaca',
    };
  }

  return {
    borderColor: 'rgba(96, 165, 250, 0.35)',
    background: 'rgba(37, 99, 235, 0.12)',
    color: '#bfdbfe',
  };
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'grid',
    gap: 14,
  },
  editorHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    margin: 0,
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: 900,
  },
  mutedText: {
    margin: '6px 0 0',
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 1.6,
  },
  devBadge: {
    flex: '0 0 auto',
    border: '1px solid rgba(250, 204, 21, 0.35)',
    background: 'rgba(250, 204, 21, 0.1)',
    color: '#fde68a',
    borderRadius: 999,
    padding: '5px 9px',
    fontSize: 11,
    fontWeight: 900,
  },
  section: {
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: 18,
    padding: 14,
    background: 'rgba(15, 23, 42, 0.6)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    margin: 0,
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: 900,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 10,
  },
  label: {
    display: 'grid',
    gap: 6,
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 10,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 11,
    border: '1px solid rgba(148, 163, 184, 0.2)',
    background: 'rgba(2, 6, 23, 0.55)',
    color: '#f8fafc',
    padding: '9px 10px',
    outline: 'none',
    fontSize: 13,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.2)',
    background: 'rgba(2, 6, 23, 0.55)',
    color: '#f8fafc',
    padding: '10px 12px',
    outline: 'none',
    fontSize: 13,
    lineHeight: 1.6,
    resize: 'vertical',
  },
  select: {
    borderRadius: 11,
    border: '1px solid rgba(148, 163, 184, 0.2)',
    background: '#020617',
    color: '#f8fafc',
    padding: '9px 10px',
    outline: 'none',
    fontSize: 13,
  },
  buttonRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  primaryButton: {
    border: '1px solid rgba(59, 130, 246, 0.4)',
    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    color: '#fff',
    borderRadius: 11,
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background: 'rgba(30, 41, 59, 0.7)',
    color: '#e5e7eb',
    borderRadius: 11,
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 850,
    cursor: 'pointer',
  },
  dangerButton: {
    border: '1px solid rgba(248, 113, 113, 0.32)',
    background: 'rgba(220, 38, 38, 0.12)',
    color: '#fecaca',
    borderRadius: 11,
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 850,
    cursor: 'pointer',
  },
  ghostButton: {
    border: '1px solid rgba(148, 163, 184, 0.16)',
    background: 'transparent',
    color: '#94a3b8',
    borderRadius: 11,
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.55,
    cursor: 'wait',
  },
  message: {
    border: '1px solid',
    borderRadius: 13,
    padding: '10px 12px',
    fontSize: 12,
    lineHeight: 1.6,
  },
  previewDetails: {
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: 14,
    background: 'rgba(2, 6, 23, 0.45)',
    overflow: 'hidden',
  },
  detailsSummary: {
    padding: '10px 12px',
    color: '#cbd5e1',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 850,
  },
  preview: {
    margin: 0,
    maxHeight: 300,
    overflow: 'auto',
    padding: 12,
    color: '#c4b5fd',
    background: '#020617',
    fontSize: 11,
    lineHeight: 1.6,
  },
  emptyPanel: {
    display: 'grid',
    justifyItems: 'center',
    textAlign: 'center',
    padding: 28,
    border: '1px dashed rgba(148, 163, 184, 0.22)',
    borderRadius: 18,
    background: 'rgba(15, 23, 42, 0.44)',
    gap: 8,
  },
  emptyIcon: {
    fontSize: 38,
  },
  emptyTitle: {
    margin: '4px 0 0',
    color: '#f8fafc',
    fontSize: 17,
  },
  emptyText: {
    maxWidth: 420,
    margin: 0,
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 1.7,
  },
};
