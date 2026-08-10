import type { CSSProperties } from 'react';
import type { PatchNote } from '../../types/patchNote';
import PatchNoteCard from './PatchNoteCard';

interface PatchNotesDetailProps {
  heading: string;
  emptyMessage: string;
  notes: PatchNote[];
  showDatePerCard?: boolean;
}

export default function PatchNotesDetail({
  heading,
  emptyMessage,
  notes,
  showDatePerCard = false,
}: PatchNotesDetailProps) {
  if (notes.length === 0) {
    return (
      <section style={styles.emptyPanel}>
        <div style={styles.emptyIcon}>📭</div>
        <h3 style={styles.emptyTitle}>{emptyMessage}</h3>
        <p style={styles.emptyText}>
          別の日付を選択するか、開発環境では「＋ 追加」から下書きを作成できます。
        </p>
      </section>
    );
  }

  return (
    <section style={styles.panel}>
      <div style={styles.heading}>
        <span style={styles.headingIcon}>📜</span>
        <div>
          <h3 style={styles.title}>{heading}</h3>
          <p style={styles.subtitle}>{notes.length}件の更新</p>
        </div>
      </div>

      <div style={styles.noteList}>
        {notes.map((note) => (
          <PatchNoteCard key={note.id} note={note} showDate={showDatePerCard} />
        ))}
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    minHeight: '100%',
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headingIcon: {
    width: 40,
    height: 40,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 14,
    background: 'rgba(250, 204, 21, 0.13)',
    border: '1px solid rgba(250, 204, 21, 0.24)',
  },
  title: {
    margin: 0,
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 800,
  },
  subtitle: {
    margin: '4px 0 0',
    color: '#94a3b8',
    fontSize: 12,
  },
  noteList: {
    display: 'grid',
    gap: 14,
  },
  emptyPanel: {
    minHeight: 280,
    display: 'grid',
    placeItems: 'center',
    textAlign: 'center',
    padding: 28,
    border: '1px dashed rgba(148, 163, 184, 0.22)',
    borderRadius: 18,
    background: 'rgba(15, 23, 42, 0.44)',
  },
  emptyIcon: {
    fontSize: 38,
  },
  emptyTitle: {
    margin: '12px 0 0',
    color: '#f8fafc',
    fontSize: 17,
  },
  emptyText: {
    maxWidth: 420,
    margin: '10px auto 0',
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 1.7,
  },
};
