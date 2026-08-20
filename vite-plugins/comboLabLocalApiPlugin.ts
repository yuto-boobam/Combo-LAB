import { randomBytes } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Connect, Plugin, ViteDevServer } from 'vite';

// Combo-LABのローカル専用API。ブラウザから開発サーバーへデータを送り、プロジェクト内の
// JSONファイルへ直接書き込む（git commit → pushのイメージ）。File System Access API
// による「上書き保存」だとWindows側ブラウザからWSL内のプロジェクトパスへ辿り着けない
// 場合があり不安定なため、開発サーバー自身がファイルシステムに直接書き込む方式にしている。
// 本番ビルドには含まれない（apply: 'serve'）。
//
// /move-stats     : 技データ（moveStatsDatabase）をsrc/data/moveStatsSources/へ保存
// /combo-showcase : キャラ1人分のコンボデータをsrc/data/comboShowcaseSources/へ保存
//                   （ゲストモードの閲覧用ショーケースデータの更新）

const MOUNT_PATH = '/__combo-lab-api';
const MOVE_STATS_TARGET_RELATIVE_PATH = 'src/data/moveStatsSources/combo-lab-move-stats.json';
const COMBO_SHOWCASE_TARGET_RELATIVE_DIR = 'src/data/comboShowcaseSources';
const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4MB（テキストのみのデータなので十分）
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const SAFE_CHARACTER_ID_PATTERN = /^[a-z0-9-]+$/;

const HIT_STATS_NUMBER_KEYS = [
  'damage',
  'dGaugeGain',
  'saGaugeGain',
  'dGaugeChip',
  'dGaugeChipPunishCounter',
  'minDamageGuaranteePercent',
] as const;

export function comboLabLocalApiPlugin(): Plugin {
  return {
    name: 'combo-lab-local-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(MOUNT_PATH, (req, res) => {
        const path = req.url ?? '';

        if (path === '/move-stats') {
          void handleSaveMoveStats(req, res, server.config.root);
          return;
        }

        if (path === '/combo-showcase') {
          void handleSaveComboShowcase(req, res, server.config.root);
          return;
        }

        respond(res, 404, 'Not Found');
      });
    },
  };
}

async function handleSaveMoveStats(
  req: Connect.IncomingMessage,
  res: import('node:http').ServerResponse,
  rootDir: string,
): Promise<void> {
  const body = await readValidatedBody(req, res, MAX_BODY_BYTES);
  if (body === null) return;

  const validationError = validateMoveStatsDatabasePayload(body.parsed);
  if (validationError) {
    respond(res, 400, validationError);
    return;
  }

  const targetPath = join(rootDir, MOVE_STATS_TARGET_RELATIVE_PATH);
  await writeJsonAtomic(res, targetPath, body.parsed);
}

async function handleSaveComboShowcase(
  req: Connect.IncomingMessage,
  res: import('node:http').ServerResponse,
  rootDir: string,
): Promise<void> {
  const body = await readValidatedBody(req, res, MAX_BODY_BYTES);
  if (body === null) return;

  const characterId = extractCharacterId(body.parsed);
  if (!characterId) {
    respond(res, 400, 'キャラクターデータ（idを含むオブジェクト）である必要があります。');
    return;
  }

  if (!SAFE_CHARACTER_ID_PATTERN.test(characterId)) {
    respond(res, 400, 'idの形式が不正です（英小文字・数字・ハイフンのみ）。');
    return;
  }

  const targetPath = join(rootDir, COMBO_SHOWCASE_TARGET_RELATIVE_DIR, `${characterId}.json`);
  await writeJsonAtomic(res, targetPath, body.parsed);
}

/** リクエストの読み取り・メソッド・ループバック確認・JSON解析までを共通化する */
async function readValidatedBody(
  req: Connect.IncomingMessage,
  res: import('node:http').ServerResponse,
  maxBytes: number,
): Promise<{ parsed: unknown } | null> {
  if (req.method !== 'POST') {
    respond(res, 405, 'POSTメソッドのみ受け付けています。');
    return null;
  }

  if (!isLoopbackRequest(req)) {
    respond(res, 403, 'ローカル環境からのリクエストのみ受け付けています。');
    return null;
  }

  let raw: string;

  try {
    raw = await readBody(req, maxBytes);
  } catch (error) {
    respond(
      res,
      error instanceof Error && error.message === 'TOO_LARGE' ? 413 : 400,
      'リクエストの読み取りに失敗しました。',
    );
    return null;
  }

  try {
    return { parsed: JSON.parse(raw) };
  } catch {
    respond(res, 400, 'JSONの解析に失敗しました。');
    return null;
  }
}

async function writeJsonAtomic(
  res: import('node:http').ServerResponse,
  targetPath: string,
  data: unknown,
): Promise<void> {
  const tmpPath = `${targetPath}.tmp-${randomBytes(4).toString('hex')}`;
  // 読みやすさ・git差分の見やすさのため、保存時にインデント付きで整形し直す
  const formatted = JSON.stringify(data, null, 2);

  try {
    await writeFile(tmpPath, formatted, 'utf-8');
    await rename(tmpPath, targetPath);
  } catch (error) {
    respond(res, 500, error instanceof Error ? error.message : 'ファイルの書き込みに失敗しました。');
    return;
  }

  respond(res, 200, JSON.stringify({ ok: true }), 'application/json');
}

function extractCharacterId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const id = (payload as Record<string, unknown>).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function validateMoveStatsDatabasePayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return '技データベースはオブジェクトである必要があります。';
  }

  for (const [characterId, moves] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof moves !== 'object' || moves === null || Array.isArray(moves)) {
      return `${characterId}の技データはオブジェクトである必要があります。`;
    }

    for (const [moveName, stats] of Object.entries(moves as Record<string, unknown>)) {
      const error = validateMoveStats(moveName, stats);
      if (error) return error;
    }
  }

  return null;
}

function validateMoveStats(moveName: string, stats: unknown): string | null {
  if (typeof stats !== 'object' || stats === null) {
    return `${moveName}の技データはオブジェクトである必要があります。`;
  }

  const record = stats as Record<string, unknown>;

  if (typeof record.isMultiHit !== 'boolean') {
    return `${moveName}のisMultiHitが不正です。`;
  }

  if (!Array.isArray(record.hits) || record.hits.length === 0) {
    return `${moveName}のhitsが不正です（1件以上の配列が必要です）。`;
  }

  for (const hit of record.hits) {
    const error = validateHitStats(moveName, hit);
    if (error) return error;
  }

  return null;
}

function validateHitStats(moveName: string, hit: unknown): string | null {
  if (typeof hit !== 'object' || hit === null) {
    return `${moveName}のヒットデータはオブジェクトである必要があります。`;
  }

  const record = hit as Record<string, unknown>;

  if (typeof record.modifier !== 'string') {
    return `${moveName}のmodifierが不正です。`;
  }

  for (const key of HIT_STATS_NUMBER_KEYS) {
    const value = record[key];
    if (value !== null && typeof value !== 'number') {
      return `${moveName}の${key}が不正です（数値かnullを指定してください）。`;
    }
  }

  return null;
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
