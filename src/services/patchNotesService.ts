import patchNotesJson from '../data/patchNotes.json';
import type { PatchNote, PatchNoteType, PatchNotesJson } from '../types/patchNote';

export const PATCH_NOTES_FILE_PATH = 'src/data/patchNotes.json';
export const PATCH_NOTES_API_ENDPOINT = '/__rooted-api/patch-notes';
export const PATCH_NOTE_IMAGE_API_ENDPOINT = '/__rooted-api/patch-notes/image';

const importedPatchNotes = (
  Array.isArray(patchNotesJson) ? patchNotesJson : []
) as unknown as PatchNotesJson;

export function getInitialPatchNotes(): PatchNote[] {
  return sortPatchNotes(recalculateBuildNumbers(importedPatchNotes.map((note) => normalizePatchNote(note))));
}

export function getPatchNotesByDate(notes: PatchNote[], date: string): PatchNote[] {
  return notes
    .filter((note) => note.date === date)
    .sort((a, b) => a.buildNumber - b.buildNumber);
}

export function getPatchNoteDates(notes: PatchNote[]): string[] {
  return Array.from(new Set(sortPatchNotes(notes).map((note) => note.date)));
}

// yearMonthIndexは Date.getMonth() と同じ0始まり
export function getPatchNotesByMonth(
  notes: PatchNote[],
  year: number,
  monthIndex: number,
): PatchNote[] {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}-`;

  return notes
    .filter((note) => note.date.startsWith(prefix))
    .sort((a, b) => {
      const dateDiff = dateKeyToLocalTime(a.date) - dateKeyToLocalTime(b.date);

      if (dateDiff !== 0) {
        return dateDiff;
      }

      return a.buildNumber - b.buildNumber;
    });
}

export function createEmptyPatchNote(date = todayDateKey(), notes: PatchNote[] = []): PatchNote {
  const safeDate = isDateKey(date) ? date : todayDateKey();

  return {
    id: generatePatchNoteId(safeDate),
    date: safeDate,
    buildNumber: previewBuildNumberForNewNote(notes, safeDate),
    type: 'other',
    title: '',
    description: '',
    beforeImageUrl: null,
    afterImageUrl: null,
  };
}

export function upsertPatchNote(notes: PatchNote[], patchNote: PatchNote): PatchNote[] {
  const normalizedPatchNote = normalizePatchNote(patchNote);
  const existingIndex = notes.findIndex((note) => note.id === normalizedPatchNote.id);

  const nextNotes =
    existingIndex === -1
      ? [...notes, normalizedPatchNote]
      : notes.map((note, index) => (index === existingIndex ? normalizedPatchNote : note));

  return sortPatchNotes(recalculateBuildNumbers(nextNotes));
}

export function removePatchNote(notes: PatchNote[], patchNoteId: string): PatchNote[] {
  const nextNotes = notes.filter((note) => note.id !== patchNoteId);
  return sortPatchNotes(recalculateBuildNumbers(nextNotes));
}

// buildNumberは「古い順の通し番号」として常に日付順から再計算される派生値。
// 同日内の並び順は、既存ノートは現在のbuildNumberを、新規ノート（buildNumber未確定=0）は
// その日の最後尾になるようにタイブレークする。
export function recalculateBuildNumbers(notes: PatchNote[]): PatchNote[] {
  const chronological = [...notes].sort((a, b) => {
    const dateDiff = dateKeyToLocalTime(a.date) - dateKeyToLocalTime(b.date);

    if (dateDiff !== 0) {
      return dateDiff;
    }

    return sameDayTieBreak(a.buildNumber) - sameDayTieBreak(b.buildNumber);
  });

  const buildNumberById = new Map<string, number>(
    chronological.map((note, index) => [note.id, index + 1]),
  );

  return notes.map((note) => ({
    ...note,
    buildNumber: buildNumberById.get(note.id) ?? note.buildNumber,
  }));
}

export function previewBuildNumberForNewNote(notes: PatchNote[], date: string): number {
  const placeholder: PatchNote = {
    id: '__preview__',
    date,
    buildNumber: 0,
    type: 'other',
    title: '',
    description: '',
    beforeImageUrl: null,
    afterImageUrl: null,
  };

  const recalculated = recalculateBuildNumbers([...notes, placeholder]);
  return recalculated.find((note) => note.id === placeholder.id)?.buildNumber ?? notes.length + 1;
}

function sameDayTieBreak(buildNumber: number): number {
  return buildNumber > 0 ? buildNumber : Number.MAX_SAFE_INTEGER;
}

export function toPatchNotesJson(notes: PatchNote[]): string {
  const normalizedNotes = sortPatchNotes(
    recalculateBuildNumbers(notes.map((note) => normalizePatchNote(note))),
  );
  return `${JSON.stringify(normalizedNotes, null, 2)}\n`;
}

export async function copyPatchNotesJson(notes: PatchNote[]): Promise<void> {
  await copyTextToClipboard(toPatchNotesJson(notes));
}

export function downloadPatchNotesJson(notes: PatchNote[], filename = 'patchNotes.json'): void {
  if (typeof document === 'undefined') {
    throw new Error('この環境ではファイル保存を実行できません。');
  }

  const blob = new Blob([toPatchNotesJson(notes)], {
    type: 'application/json;charset=utf-8',
  });

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(objectUrl);
}

export async function saveNotesToLocalFile(notes: PatchNote[]): Promise<void> {
  const response = await fetch(PATCH_NOTES_API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: toPatchNotesJson(notes),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      errorText || `ローカルファイルへの保存に失敗しました。(status: ${response.status})`,
    );
  }
}

export interface UploadPatchNoteImageParams {
  date: string;
  buildNumber: number;
  label: 'before' | 'after';
  file: File;
}

export async function uploadPatchNoteImage(params: UploadPatchNoteImageParams): Promise<string> {
  const dataBase64 = await fileToBase64(params.file);

  const response = await fetch(PATCH_NOTE_IMAGE_API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: params.date,
      buildNumber: params.buildNumber,
      label: params.label,
      fileName: params.file.name,
      dataBase64,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      errorText || `画像のアップロードに失敗しました。(status: ${response.status})`,
    );
  }

  const result = (await response.json()) as { url: string };
  return result.url;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };

    reader.onerror = () => reject(reader.error ?? new Error('ファイルの読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

export function normalizePatchNote(note: Partial<PatchNote>): PatchNote {
  const rawDate = safeString(note.date);
  const date = isDateKey(rawDate) ? rawDate : todayDateKey();

  return {
    id: safeString(note.id) || generatePatchNoteId(date),
    date,
    buildNumber: normalizeBuildNumber(note.buildNumber),
    type: isPatchNoteType(note.type) ? note.type : 'other',
    title: safeString(note.title) || '無題のパッチノート',
    description: safeString(note.description) || 'Why / 変更理由:\n変更理由を記入してください。',
    beforeImageUrl: optionalUrlToNull(note.beforeImageUrl),
    afterImageUrl: optionalUrlToNull(note.afterImageUrl),
  };
}

export function sortPatchNotes(notes: PatchNote[]): PatchNote[] {
  return [...notes].sort((a, b) => {
    const dateDiff = dateKeyToLocalTime(b.date) - dateKeyToLocalTime(a.date);

    if (dateDiff !== 0) {
      return dateDiff;
    }

    return b.buildNumber - a.buildNumber;
  });
}

export function todayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function generatePatchNoteId(date = todayDateKey()): string {
  const cryptoApi = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoApi && 'randomUUID' in cryptoApi) {
    const randomUUID = (cryptoApi as Crypto & { randomUUID: () => string }).randomUUID();
    return `${date}-${randomUUID.slice(0, 8)}`;
  }

  return `${date}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isPatchNoteType(value: unknown): value is PatchNoteType {
  return (
    value === 'feature' || value === 'bugfix' || value === 'spec-change' || value === 'other'
  );
}

function optionalUrlToNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateKeyToLocalTime(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const time = new Date(year, month - 1, day).getTime();

  return Number.isFinite(time) ? time : 0;
}

function normalizeBuildNumber(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard API を利用できません。');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';

  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('クリップボードへのコピーに失敗しました。');
  }
}
