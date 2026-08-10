import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PatchNote, PatchNoteType } from '../../types/patchNote';
import { useAppStore } from '../../store';
import {
  getDefaultGitHubConfig,
  getMergedPullRequests,
  type MergedPullRequest,
} from '../../services/githubApi';
import {
  createEmptyPatchNote,
  previewBuildNumberForNewNote,
  saveNotesToLocalFile,
  toPatchNotesJson,
  upsertPatchNote,
} from '../../services/patchNotesService';
import PatchNoteImageUploadField from './PatchNoteImageUploadField';

const GUEST_DENIED_MESSAGE = 'ゲストモードには編集を保存する権限がありません。';

interface PatchNotesAddFormProps {
  selectedDate: string;
  notes: PatchNote[];
  onNotesChange: (nextNotes: PatchNote[]) => void;
  onClose?: () => void;
}

type EditorMessage = {
  type: 'success' | 'error' | 'info';
  text: string;
};

export default function PatchNotesAddForm({
  selectedDate,
  notes,
  onNotesChange,
  onClose,
}: PatchNotesAddFormProps) {
  const githubDefaults = useMemo(() => getDefaultGitHubConfig(), []);
  const autoFetchKeyRef = useRef('');
  const isGuest = useAppStore((state) => state.isGuest);

  const [owner, setOwner] = useState(githubDefaults.owner);
  const [repo, setRepo] = useState(githubDefaults.repo);
  const [token, setToken] = useState(githubDefaults.token ?? '');
  const [dayWindow, setDayWindow] = useState(3);
  const [pullRequests, setPullRequests] = useState<MergedPullRequest[]>([]);
  const [isLoadingPrs, setIsLoadingPrs] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<EditorMessage | null>(null);
  const [form, setForm] = useState<PatchNote>(() => createEmptyPatchNote(selectedDate, notes));

  // 日付が変わった時だけ新しい空ドラフトを用意する（notesの変化では毎回リセットしない）
  useEffect(() => {
    setForm(createEmptyPatchNote(selectedDate, notes));
    setPullRequests([]);
    setMessage(null);
    // notesは意図的に依存から外している（保存直後の再レンダーでドラフトを上書きしないため）
  }, [selectedDate]);

  const fetchAndMaybeApplyPrs = useCallback(
    async (signal?: AbortSignal, applyDraft = true) => {
      const resolvedOwner = owner.trim();
      const resolvedRepo = repo.trim();
      const resolvedToken = token.trim();

      if (!resolvedOwner || !resolvedRepo) {
        setMessage({
          type: 'info',
          text: 'GitHub owner / repo を入力してください。.env.local での設定も可能です。',
        });
        return;
      }

      setIsLoadingPrs(true);
      setMessage({
        type: 'info',
        text: 'GitHub からマージ済みPRを取得しています...',
      });

      try {
        const result = await getMergedPullRequests({
          owner: resolvedOwner,
          repo: resolvedRepo,
          token: resolvedToken || undefined,
          targetDate: selectedDate,
          dayWindow,
          maxPages: 3,
          perPage: 100,
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        setPullRequests(result);

        if (applyDraft && result.length > 0) {
          setForm((previousForm) =>
            previousForm.title.trim()
              ? previousForm
              : buildDraftFromPullRequests(previousForm, result, notes, false),
          );
        }

        setMessage({
          type: result.length > 0 ? 'success' : 'info',
          text:
            result.length > 0
              ? `${result.length}件のマージ済みPRを取得しました。`
              : '対象日付近のマージ済みPRは見つかりませんでした。',
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'GitHub API の取得に失敗しました。',
        });
      } finally {
        if (!signal?.aborted) {
          setIsLoadingPrs(false);
        }
      }
    },
    [dayWindow, notes, owner, repo, selectedDate, token],
  );

  useEffect(() => {
    if (!import.meta.env.DEV || !githubDefaults.owner || !githubDefaults.repo) {
      return;
    }

    const autoFetchKey = `${selectedDate}:${owner}/${repo}`;

    if (autoFetchKeyRef.current === autoFetchKey) {
      return;
    }

    autoFetchKeyRef.current = autoFetchKey;

    const controller = new AbortController();
    void fetchAndMaybeApplyPrs(controller.signal, true);

    return () => controller.abort();
  }, [
    fetchAndMaybeApplyPrs,
    githubDefaults.owner,
    githubDefaults.repo,
    owner,
    repo,
    selectedDate,
  ]);

  const sanitizeCurrentForm = useCallback((): PatchNote => {
    return {
      ...form,
      date: selectedDate,
      title: form.title.trim() || '無題のパッチノート',
      description: form.description.trim() || 'Why / 変更理由:\n変更理由を記入してください。',
      beforeImageUrl: normalizeImageUrl(form.beforeImageUrl),
      afterImageUrl: normalizeImageUrl(form.afterImageUrl),
    };
  }, [form, selectedDate]);

  const isBlankDraft = form.title.trim().length === 0;

  const jsonPreview = useMemo(() => {
    const previewNotes = isBlankDraft ? notes : upsertPatchNote(notes, sanitizeCurrentForm());
    return toPatchNotesJson(previewNotes);
  }, [notes, sanitizeCurrentForm, isBlankDraft]);

  const updateField = <K extends keyof PatchNote>(field: K, value: PatchNote[K]) => {
    setForm((previousForm) => ({
      ...previousForm,
      [field]: value,
    }));
  };

  const applyToWorkingNotes = (): PatchNote[] | null => {
    if (isGuest) {
      setMessage({ type: 'error', text: GUEST_DENIED_MESSAGE });
      return null;
    }

    if (isBlankDraft) {
      setMessage({
        type: 'info',
        text: 'タイトルを入力してから反映してください。',
      });
      return null;
    }

    const sanitizedNote = sanitizeCurrentForm();
    const nextNotes = upsertPatchNote(notes, sanitizedNote);

    onNotesChange(nextNotes);
    setForm(sanitizedNote);

    return nextNotes;
  };

  const handleSaveToLocalFile = async () => {
    const nextNotes = applyToWorkingNotes();

    if (!nextNotes) {
      return;
    }

    setIsSaving(true);

    try {
      await saveNotesToLocalFile(nextNotes);

      setMessage({
        type: 'success',
        text: 'src/data/patchNotes.json に保存しました。続けて追加できます。',
      });
      setForm(createEmptyPatchNote(selectedDate, nextNotes));
      setPullRequests([]);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ファイルへの保存に失敗しました。',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyAllPullRequests = () => {
    if (pullRequests.length === 0) {
      setMessage({
        type: 'info',
        text: '反映できるPRがありません。先にGitHub APIからPRを取得してください。',
      });
      return;
    }

    setForm((previousForm) => buildDraftFromPullRequests(previousForm, pullRequests, notes, true));
    setMessage({
      type: 'success',
      text: '取得したPR内容をフォームへ反映しました。',
    });
  };

  return (
    <section style={styles.container}>
      <div style={styles.editorHeader}>
        <div>
          <h3 style={styles.title}>開発者用：パッチノート追加</h3>
          <p style={styles.mutedText}>
            新しいパッチノートを作成し、localhost環境からsrc/data/patchNotes.jsonへ保存します。
          </p>
        </div>

        <span style={styles.devBadge}>LOCAL only</span>
      </div>

      {message && (
        <div style={{ ...styles.message, ...getMessageStyle(message.type) }}>{message.text}</div>
      )}

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h4 style={styles.sectionTitle}>GitHub PRから下書き作成</h4>
          <button
            type="button"
            style={{
              ...styles.primaryButton,
              ...(isLoadingPrs ? styles.disabledButton : {}),
            }}
            disabled={isLoadingPrs}
            onClick={() => void fetchAndMaybeApplyPrs(undefined, true)}
          >
            {isLoadingPrs ? '取得中...' : 'マージ済みPRを取得'}
          </button>
        </div>

        <div style={styles.githubGrid}>
          <label style={styles.label}>
            Owner
            <input
              style={styles.input}
              value={owner}
              placeholder="your-github-name"
              onChange={(event) => setOwner(event.target.value)}
            />
          </label>

          <label style={styles.label}>
            Repo
            <input
              style={styles.input}
              value={repo}
              placeholder="rooted"
              onChange={(event) => setRepo(event.target.value)}
            />
          </label>

          <label style={styles.label}>
            Token（任意）
            <input
              style={styles.input}
              value={token}
              type="password"
              autoComplete="off"
              placeholder="ghp_... / fine-grained token"
              onChange={(event) => setToken(event.target.value)}
            />
          </label>

          <label style={styles.label}>
            日付範囲 ±日
            <input
              style={styles.input}
              value={dayWindow}
              type="number"
              min={0}
              max={14}
              onChange={(event) => setDayWindow(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
        </div>

        <p style={styles.envHint}>
          .env.local 例：
          <code style={styles.inlineCode}>VITE_GITHUB_OWNER</code> /{' '}
          <code style={styles.inlineCode}>VITE_GITHUB_REPO</code> /{' '}
          <code style={styles.inlineCode}>VITE_GITHUB_TOKEN</code>
        </p>

        {pullRequests.length > 0 && (
          <div style={styles.prList}>
            <div style={styles.prListHeader}>
              <strong>取得したPR</strong>
              <button type="button" style={styles.secondaryButton} onClick={handleApplyAllPullRequests}>
                まとめてフォームへ反映
              </button>
            </div>

            {pullRequests.map((pullRequest) => (
              <article key={pullRequest.id} style={styles.prCard}>
                <div>
                  <div style={styles.prTitle}>
                    #{pullRequest.number} {pullRequest.title}
                  </div>
                  <div style={styles.prMeta}>
                    merged: {formatMergedAt(pullRequest.mergedAt)} / by {pullRequest.authorLogin}
                  </div>
                </div>

                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    style={styles.smallButton}
                    onClick={() => {
                      setForm((previousForm) =>
                        buildDraftFromPullRequests(previousForm, [pullRequest], notes, true),
                      );
                      setMessage({
                        type: 'success',
                        text: `#${pullRequest.number} の内容をフォームへ反映しました。`,
                      });
                    }}
                  >
                    このPRを反映
                  </button>

                  <a
                    href={pullRequest.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.inlineLink}
                  >
                    GitHubで開く
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h4 style={styles.sectionTitle}>新規パッチノート</h4>
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
          <button type="button" style={styles.secondaryButton} onClick={() => applyToWorkingNotes()}>
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

function buildDraftFromPullRequests(
  base: PatchNote,
  pullRequests: MergedPullRequest[],
  allNotes: PatchNote[],
  overwriteText: boolean,
): PatchNote {
  const draftTitle =
    pullRequests.length === 1
      ? pullRequests[0].title
      : `${pullRequests.length}件のPRを反映`;

  const draftDescription = `Why / 変更理由:\n${buildPullRequestDescription(pullRequests)}`;
  const inferredType = inferPatchNoteTypeFromPullRequests(pullRequests);

  return {
    ...base,
    buildNumber: base.buildNumber > 0 ? base.buildNumber : previewBuildNumberForNewNote(allNotes, base.date),
    type: overwriteText || base.type === 'other' ? inferredType : base.type,
    title: overwriteText || !base.title.trim() ? draftTitle : base.title,
    description:
      overwriteText || !base.description.trim() ? draftDescription : base.description,
  };
}

function buildPullRequestDescription(pullRequests: MergedPullRequest[]): string {
  return pullRequests
    .map((pullRequest) => {
      const body = compactText(extractWhySection(pullRequest.body));
      const bodyText =
        body.length > 0
          ? body
              .split('\n')
              .slice(0, 8)
              .map((line) => `  ${line}`)
              .join('\n')
          : '  PR本文にWhy/変更理由がないため、ここを手動で補足してください。';

      return `- #${pullRequest.number} ${pullRequest.title}\n${bodyText}\n  ${pullRequest.htmlUrl}`;
    })
    .join('\n\n');
}

function extractWhySection(body: string): string {
  const cleanedBody = body.replace(/<!--[\s\S]*?-->/g, '').trim();

  if (!cleanedBody) {
    return '';
  }

  const lines = cleanedBody.replace(/\r\n/g, '\n').split('\n');
  const headingIndex = lines.findIndex((line) =>
    /^(#{1,6}\s*)?(why|変更理由|理由|背景|目的|概要|what)/i.test(line.trim()),
  );

  if (headingIndex === -1) {
    return cleanedBody;
  }

  const sectionLines: string[] = [];

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^#{1,6}\s+/.test(line.trim()) && sectionLines.length > 0) {
      break;
    }

    sectionLines.push(line);
  }

  return sectionLines.join('\n').trim() || cleanedBody;
}

function compactText(text: string): string {
  const compacted = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();

  if (compacted.length <= 700) {
    return compacted;
  }

  return `${compacted.slice(0, 700)}...`;
}

function inferPatchNoteTypeFromPullRequests(pullRequests: MergedPullRequest[]): PatchNoteType {
  const text = pullRequests
    .map((pullRequest) => `${pullRequest.title} ${pullRequest.body} ${pullRequest.labels.join(' ')}`)
    .join(' ')
    .toLowerCase();

  if (/(bug|fix|hotfix|不具合|バグ|修正|障害)/i.test(text)) {
    return 'bugfix';
  }

  if (/(feat|feature|add|新機能|追加|実装|改善)/i.test(text)) {
    return 'feature';
  }

  return 'other';
}

function normalizeImageUrl(value: string | null | undefined): string | null {
  const trimmedValue = typeof value === 'string' ? value.trim() : '';
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function formatMergedAt(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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
  githubGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 10,
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
  envHint: {
    margin: '10px 0 0',
    color: '#64748b',
    fontSize: 11,
    lineHeight: 1.6,
  },
  inlineCode: {
    color: '#fde68a',
    background: 'rgba(250, 204, 21, 0.08)',
    border: '1px solid rgba(250, 204, 21, 0.16)',
    borderRadius: 6,
    padding: '1px 5px',
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
  smallButton: {
    border: '1px solid rgba(59, 130, 246, 0.32)',
    background: 'rgba(37, 99, 235, 0.14)',
    color: '#bfdbfe',
    borderRadius: 10,
    padding: '7px 10px',
    fontSize: 11,
    fontWeight: 850,
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
  prList: {
    display: 'grid',
    gap: 9,
    marginTop: 12,
  },
  prListHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    color: '#e5e7eb',
    fontSize: 12,
    flexWrap: 'wrap',
  },
  prCard: {
    display: 'grid',
    gap: 8,
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: 14,
    padding: 11,
    background: 'rgba(2, 6, 23, 0.36)',
  },
  prTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: 850,
    lineHeight: 1.45,
  },
  prMeta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },
  inlineLink: {
    color: '#93c5fd',
    fontSize: 12,
    textDecoration: 'none',
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
};
