import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { uploadPatchNoteImage } from '../../services/patchNotesService';

interface PatchNoteImageUploadFieldProps {
  displayLabel: string;
  uploadLabel: 'before' | 'after';
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  date: string;
  buildNumber: number;
}

export default function PatchNoteImageUploadField({
  displayLabel,
  uploadLabel,
  value,
  onChange,
  date,
  buildNumber,
}: PatchNoteImageUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const url = await uploadPatchNoteImage({ date, buildNumber, label: uploadLabel, file });
      onChange(url);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'アップロードに失敗しました。');
    } finally {
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <label style={styles.label}>
      <span style={styles.labelRow}>
        <span>{displayLabel}（任意）</span>

        <button
          type="button"
          style={{ ...styles.uploadButton, ...(isUploading ? styles.disabledButton : {}) }}
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? 'アップロード中...' : 'PC内から選択'}
        </button>
      </span>

      <input
        style={styles.input}
        value={value ?? ''}
        placeholder="https://..."
        onChange={(event) => onChange(event.target.value)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={styles.hiddenFileInput}
        onChange={(event) => void handleFileSelected(event.target.files?.[0])}
      />

      {uploadError && <p style={styles.errorText}>{uploadError}</p>}

      {value && (
        <img
          src={value}
          alt={`${displayLabel}プレビュー`}
          style={styles.preview}
          onError={(event) => {
            event.currentTarget.style.opacity = '0.35';
          }}
        />
      )}
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  label: {
    display: 'grid',
    gap: 6,
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 10,
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
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
  uploadButton: {
    flex: '0 0 auto',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background: 'rgba(30, 41, 59, 0.7)',
    color: '#e5e7eb',
    borderRadius: 9,
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 850,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  disabledButton: {
    opacity: 0.55,
    cursor: 'wait',
  },
  hiddenFileInput: {
    display: 'none',
  },
  errorText: {
    margin: 0,
    color: '#fecaca',
    fontSize: 11,
    lineHeight: 1.6,
  },
  preview: {
    display: 'block',
    marginTop: 4,
    maxWidth: '100%',
    maxHeight: 120,
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.16)',
    objectFit: 'cover',
  },
};
