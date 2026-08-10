import { randomBytes } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Connect, Plugin, ViteDevServer } from 'vite';

const MOUNT_PATH = '/__rooted-api';
const NOTES_TARGET_RELATIVE_PATH = 'src/data/patchNotes.json';
const IMAGES_TARGET_RELATIVE_DIR = 'public/images/patch-notes';
const MAX_NOTES_BODY_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_IMAGE_BODY_BYTES = 12 * 1024 * 1024; // base64換算で実画像は約8MBまで
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_TYPES = new Set(['feature', 'bugfix', 'spec-change', 'other']);
const VALID_IMAGE_LABELS = new Set(['before', 'after']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export function patchNotesLocalApiPlugin(): Plugin {
  return {
    name: 'rooted-patch-notes-local-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(MOUNT_PATH, (req, res) => {
        const path = req.url ?? '';

        if (path === '/patch-notes') {
          void handleSaveNotes(req, res, server.config.root);
          return;
        }

        if (path === '/patch-notes/image') {
          void handleUploadImage(req, res, server.config.root);
          return;
        }

        respond(res, 404, 'Not Found');
      });
    },
  };
}

async function handleSaveNotes(
  req: Connect.IncomingMessage,
  res: import('node:http').ServerResponse,
  rootDir: string,
): Promise<void> {
  if (req.method !== 'POST') {
    respond(res, 405, 'POSTメソッドのみ受け付けています。');
    return;
  }

  if (!isLoopbackRequest(req)) {
    respond(res, 403, 'ローカル環境からのリクエストのみ受け付けています。');
    return;
  }

  let body: string;

  try {
    body = await readBody(req, MAX_NOTES_BODY_BYTES);
  } catch (error) {
    respond(res, error instanceof Error && error.message === 'TOO_LARGE' ? 413 : 400, 'リクエストの読み取りに失敗しました。');
    return;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    respond(res, 400, 'JSONの解析に失敗しました。');
    return;
  }

  const validationError = validatePatchNotesPayload(parsed);

  if (validationError) {
    respond(res, 400, validationError);
    return;
  }

  const targetPath = join(rootDir, NOTES_TARGET_RELATIVE_PATH);
  const tmpPath = `${targetPath}.tmp-${randomBytes(4).toString('hex')}`;

  try {
    await writeFile(tmpPath, body, 'utf-8');
    await rename(tmpPath, targetPath);
  } catch (error) {
    respond(res, 500, error instanceof Error ? error.message : 'ファイルの書き込みに失敗しました。');
    return;
  }

  respond(res, 200, JSON.stringify({ ok: true }), 'application/json');
}

async function handleUploadImage(
  req: Connect.IncomingMessage,
  res: import('node:http').ServerResponse,
  rootDir: string,
): Promise<void> {
  if (req.method !== 'POST') {
    respond(res, 405, 'POSTメソッドのみ受け付けています。');
    return;
  }

  if (!isLoopbackRequest(req)) {
    respond(res, 403, 'ローカル環境からのリクエストのみ受け付けています。');
    return;
  }

  let body: string;

  try {
    body = await readBody(req, MAX_IMAGE_BODY_BYTES);
  } catch (error) {
    respond(res, error instanceof Error && error.message === 'TOO_LARGE' ? 413 : 400, 'リクエストの読み取りに失敗しました。');
    return;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    respond(res, 400, 'JSONの解析に失敗しました。');
    return;
  }

  const validated = validateImageUploadPayload(parsed);

  if (typeof validated === 'string') {
    respond(res, 400, validated);
    return;
  }

  const { date, buildNumber, label, extension, dataBase64 } = validated;
  const [year, month] = date.split('-');
  const targetDir = join(rootDir, IMAGES_TARGET_RELATIVE_DIR, year, month);
  const fileName = `${date.replaceAll('-', '')}-build${buildNumber}-${label}${extension}`;
  const targetPath = join(targetDir, fileName);

  let buffer: Buffer;

  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    respond(res, 400, '画像データの読み取りに失敗しました。');
    return;
  }

  if (buffer.length === 0) {
    respond(res, 400, '画像データが空です。');
    return;
  }

  try {
    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, buffer);
  } catch (error) {
    respond(res, 500, error instanceof Error ? error.message : 'ファイルの書き込みに失敗しました。');
    return;
  }

  // 同じ日付・ビルド番号・labelの画像を差し替えた場合もパスは同一になるため、
  // クエリでキャッシュを無効化し、ブラウザ・Reactの双方が新しい画像として再取得するようにする。
  const publicUrl = `/images/patch-notes/${year}/${month}/${fileName}?v=${Date.now()}`;
  respond(res, 200, JSON.stringify({ ok: true, url: publicUrl }), 'application/json');
}

function validatePatchNotesPayload(payload: unknown): string | null {
  if (!Array.isArray(payload)) {
    return 'パッチノートは配列である必要があります。';
  }

  for (const note of payload) {
    if (typeof note !== 'object' || note === null) {
      return '各パッチノートはオブジェクトである必要があります。';
    }

    const record = note as Record<string, unknown>;

    if (typeof record.id !== 'string' || record.id.trim().length === 0) {
      return 'idが不正です。';
    }

    if (typeof record.date !== 'string' || !DATE_KEY_PATTERN.test(record.date)) {
      return 'dateが不正です（YYYY-MM-DD形式で指定してください）。';
    }

    if (!VALID_TYPES.has(record.type as string)) {
      return 'typeが不正です。';
    }

    if (typeof record.title !== 'string') {
      return 'titleが不正です。';
    }

    if (typeof record.description !== 'string') {
      return 'descriptionが不正です。';
    }

    if (
      typeof record.buildNumber !== 'number' ||
      !Number.isInteger(record.buildNumber) ||
      record.buildNumber <= 0
    ) {
      return 'buildNumberが不正です（正の整数を指定してください）。';
    }
  }

  return null;
}

interface ImageUploadPayload {
  date: string;
  buildNumber: number;
  label: 'before' | 'after';
  extension: string;
  dataBase64: string;
}

function validateImageUploadPayload(payload: unknown): ImageUploadPayload | string {
  if (typeof payload !== 'object' || payload === null) {
    return 'リクエスト内容が不正です。';
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.date !== 'string' || !DATE_KEY_PATTERN.test(record.date)) {
    return 'dateが不正です（YYYY-MM-DD形式で指定してください）。';
  }

  if (
    typeof record.buildNumber !== 'number' ||
    !Number.isInteger(record.buildNumber) ||
    record.buildNumber <= 0
  ) {
    return 'buildNumberが不正です（正の整数を指定してください）。';
  }

  if (typeof record.label !== 'string' || !VALID_IMAGE_LABELS.has(record.label)) {
    return 'labelが不正です（before/afterのいずれかを指定してください）。';
  }

  if (typeof record.fileName !== 'string' || record.fileName.trim().length === 0) {
    return 'fileNameが不正です。';
  }

  const extensionMatch = /\.[a-zA-Z0-9]+$/.exec(record.fileName);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : '';

  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    return `対応していない拡張子です（対応: ${Array.from(ALLOWED_IMAGE_EXTENSIONS).join(', ')}）。`;
  }

  if (typeof record.dataBase64 !== 'string' || record.dataBase64.trim().length === 0) {
    return '画像データが不正です。';
  }

  return {
    date: record.date,
    buildNumber: record.buildNumber,
    label: record.label as 'before' | 'after',
    extension,
    dataBase64: record.dataBase64,
  };
}

function isLoopbackRequest(req: Connect.IncomingMessage): boolean {
  return LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '');
}

function readBody(req: Connect.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;

      if (totalBytes > maxBytes) {
        reject(new Error('TOO_LARGE'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', reject);
  });
}

function respond(
  res: import('node:http').ServerResponse,
  statusCode: number,
  message: string,
  contentType = 'text/plain; charset=utf-8',
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', contentType);
  res.end(message);
}
