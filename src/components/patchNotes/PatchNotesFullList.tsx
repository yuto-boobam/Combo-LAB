import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PatchNote } from '../../types/patchNote';
import PatchNoteCard from './PatchNoteCard';

interface PatchNotesFullListProps {
  notes: PatchNote[];
  maxHeight: string;
}

const PAGE_SIZE = 10;

export default function PatchNotesFullList({ notes, maxHeight }: PatchNotesFullListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const hasMore = visibleCount < notes.length;
  const visibleNotes = notes.slice(0, visibleCount);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;

    if (!sentinel || !root || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((current) => Math.min(current + PAGE_SIZE, notes.length));
        }
      },
      { root, rootMargin: '0px 0px 200px 0px' },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, notes.length]);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container || !hasMore) {
      return;
    }

    if (container.scrollHeight <= container.clientHeight) {
      setVisibleCount((current) => Math.min(current + PAGE_SIZE, notes.length));
    }
  }, [visibleCount, hasMore, notes.length]);

  if (notes.length === 0) {
    return (
      <section style={styles.emptyPanel}>
        <div style={styles.emptyIcon}>📭</div>
        <h3 style={styles.emptyTitle}>まだパッチノートがありません</h3>
      </section>
    );
  }

  return (
    <section style={styles.panel}>
      <div style={styles.heading}>
        <span style={styles.headingIcon}>📜</span>
        <div>
          <h3 style={styles.title}>すべての更新履歴</h3>
          <p style={styles.subtitle}>{notes.length}件の更新</p>
        </div>
      </div>

      <div ref={scrollContainerRef} style={{ ...styles.scrollContainer, maxHeight }}>
        <div style={styles.noteList}>
          {visibleNotes.map((note) => (
            <PatchNoteCard key={note.id} note={note} showDate />
          ))}
        </div>

        {hasMore && <div ref={sentinelRef} style={styles.sentinel} />}
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
  scrollContainer: {
    overflow: 'auto',
  },
  noteList: {
    display: 'grid',
    gap: 14,
  },
  sentinel: {
    height: 1,
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
};
