import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PatchNote, PatchNoteType } from '../../types/patchNote';

interface PatchNoteCardProps {
  note: PatchNote;
  showDate?: boolean;
}

const TYPE_META: Record<
  PatchNoteType,
  {
    label: string;
    color: string;
    background: string;
    border: string;
  }
> = {
  feature: {
    label: '新機能',
    color: '#bfdbfe',
    background: 'rgba(37, 99, 235, 0.18)',
    border: 'rgba(96, 165, 250, 0.42)',
  },
  bugfix: {
    label: 'バグ修正',
    color: '#fecaca',
    background: 'rgba(220, 38, 38, 0.16)',
    border: 'rgba(248, 113, 113, 0.42)',
  },
  'spec-change': {
    label: '仕様変更',
    color: '#99f6e4',
    background: 'rgba(13, 148, 136, 0.18)',
    border: 'rgba(45, 212, 191, 0.42)',
  },
  other: {
    label: 'その他',
    color: '#ddd6fe',
    background: 'rgba(124, 58, 237, 0.16)',
    border: 'rgba(167, 139, 250, 0.42)',
  },
};

export default function PatchNoteCard({ note, showDate = false }: PatchNoteCardProps) {
  const typeMeta = TYPE_META[note.type];
  const imageCount = (note.beforeImageUrl ? 1 : 0) + (note.afterImageUrl ? 1 : 0);
  const hasImages = imageCount > 0;
  const [isImagesExpanded, setIsImagesExpanded] = useState(false);

  return (
    <article style={styles.noteCard}>
      <div style={styles.noteHeader}>
        <div>
          <div style={styles.versionRow}>
            <span style={styles.version}>第{note.buildNumber}回更新</span>

            {showDate && (
              <span style={styles.dateBadge}>（{formatDateLabelSlash(note.date)}）</span>
            )}

            <span
              style={{
                ...styles.typeBadge,
                color: typeMeta.color,
                background: typeMeta.background,
                borderColor: typeMeta.border,
              }}
            >
              {typeMeta.label}
            </span>
          </div>

          <h4 style={styles.noteTitle}>{note.title}</h4>
        </div>
      </div>

      <p style={styles.description}>{note.description}</p>

      {hasImages && (
        <div style={styles.imagesSection}>
          <button
            type="button"
            style={styles.imagesToggle}
            aria-expanded={isImagesExpanded}
            onClick={() => setIsImagesExpanded((current) => !current)}
          >
            <span>📷 画像（{imageCount}枚）</span>
            <span style={styles.chevron}>{isImagesExpanded ? '︿ 隠す' : '﹀ 表示'}</span>
          </button>

          {isImagesExpanded && (
            <div style={styles.imageGrid}>
              {note.beforeImageUrl && (
                <ImageCard label="Before" src={note.beforeImageUrl} title={note.title} />
              )}

              {note.afterImageUrl && (
                <ImageCard label="After" src={note.afterImageUrl} title={note.title} />
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ImageCard({ label, src, title }: { label: string; src: string; title: string }) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    if (!isLightboxOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLightboxOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen]);

  return (
    <figure style={styles.imageCard}>
      <figcaption style={styles.imageLabel}>{label}</figcaption>
      <img
        src={src}
        alt={`${title} - ${label}`}
        style={styles.image}
        loading="lazy"
        onClick={() => setIsLightboxOpen(true)}
        onError={(event) => {
          event.currentTarget.style.opacity = '0.35';
        }}
      />

      {isLightboxOpen && (
        <div
          style={styles.lightboxOverlay}
          role="presentation"
          onMouseDown={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            style={styles.lightboxCloseButton}
            aria-label="閉じる"
            onClick={() => setIsLightboxOpen(false)}
          >
            ×
          </button>

          <img
            src={src}
            alt={`${title} - ${label}`}
            style={styles.lightboxImage}
            onMouseDown={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </figure>
  );
}

function formatDateLabelSlash(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');

  if (!year || !month || !day) {
    return dateKey;
  }

  return `${year}/${Number(month)}/${Number(day)}`;
}

const styles: Record<string, CSSProperties> = {
  noteCard: {
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: 18,
    padding: 16,
    background: 'rgba(15, 23, 42, 0.66)',
  },
  noteHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
  },
  versionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  version: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.03em',
  },
  dateBadge: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 700,
  },
  typeBadge: {
    border: '1px solid',
    borderRadius: 999,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 800,
  },
  noteTitle: {
    margin: 0,
    color: '#f8fafc',
    fontSize: 16,
    lineHeight: 1.45,
  },
  description: {
    margin: '12px 0 0',
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 1.75,
    whiteSpace: 'pre-wrap',
  },
  imagesSection: {
    marginTop: 14,
  },
  imagesToggle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(2, 6, 23, 0.4)',
    color: '#cbd5e1',
    borderRadius: 12,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  chevron: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: 700,
  },
  imageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
    marginTop: 10,
  },
  imageCard: {
    margin: 0,
    borderRadius: 14,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    background: 'rgba(2, 6, 23, 0.48)',
  },
  imageLabel: {
    padding: '8px 10px',
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 800,
    borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
  },
  image: {
    display: 'block',
    width: '100%',
    maxHeight: 260,
    objectFit: 'cover',
    background: '#020617',
    cursor: 'zoom-in',
  },
  lightboxOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    background: 'rgba(2, 6, 23, 0.88)',
    backdropFilter: 'blur(6px)',
  },
  lightboxImage: {
    display: 'block',
    maxWidth: '90vw',
    maxHeight: '90vh',
    objectFit: 'contain',
    borderRadius: 12,
    boxShadow: '0 24px 90px rgba(0, 0, 0, 0.6)',
  },
  lightboxCloseButton: {
    position: 'fixed',
    top: 24,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    background: 'rgba(30, 41, 59, 0.85)',
    color: '#e5e7eb',
    cursor: 'pointer',
    fontSize: 24,
    lineHeight: 1,
  },
};
