/**
 * GROMKO S3 Storage — загрузка обработанных файлов в Yandex Object Storage
 *
 * После FFmpeg обработки файлы (AAC, HLS, обложки, waveforms) заливаются в S3.
 * Фронтенд получает прямые S3 URL для стриминга — сервер не проксирует аудио.
 *
 * Структура в бакете (output):
 *   gromko-cdn/                      ← отдельный бакет для обработанных файлов
 *     audio/{trackId}/low.m4a
 *     audio/{trackId}/medium.m4a
 *     audio/{trackId}/high.m4a
 *     audio/{trackId}/hls/master.m3u8
 *     audio/{trackId}/hls/low_001.ts
 *     covers/{trackId}/thumb.webp
 *     covers/{trackId}/medium.webp
 *     waveforms/{trackId}.json
 */

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import 'dotenv/config';

// ─── S3 Config ───

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net';
const S3_REGION   = process.env.S3_REGION   || 'ru-central1';
const S3_ACCESS   = process.env.S3_ACCESS_KEY || '';
const S3_SECRET   = process.env.S3_SECRET_KEY || '';

/** Бакет для обработанных файлов (CDN) */
export const CDN_BUCKET = process.env.S3_CDN_BUCKET || process.env.S3_BUCKET || 'musicpfvlisten';

/** Префикс для обработанных файлов внутри бакета */
export const CDN_PREFIX = process.env.S3_CDN_PREFIX || 'cdn';

/** Публичный базовый URL для прямого доступа к файлам */
export const CDN_BASE_URL = process.env.S3_CDN_URL
  || `${S3_ENDPOINT}/${CDN_BUCKET}`;

/** Включён ли S3 storage (если ключи заданы) */
export const S3_ENABLED = !!(S3_ACCESS && S3_SECRET);

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    if (!S3_ACCESS || !S3_SECRET) {
      throw new Error('S3 не сконфигурирован: S3_ACCESS_KEY / S3_SECRET_KEY не заданы');
    }
    _s3 = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS,
        secretAccessKey: S3_SECRET,
      },
      forcePathStyle: true,
    });
  }
  return _s3;
}

// ─── MIME helpers ───

function getMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.flac': 'audio/flac',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.json': 'application/json',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

// ─── Core operations ───

/**
 * Загрузить файл в S3.
 * @returns Публичный URL файла.
 */
export async function uploadToS3(
  localPath: string,
  s3Key: string,
  options?: { cacheControl?: string }
): Promise<string> {
  const body = fs.readFileSync(localPath);
  const mime = getMime(localPath);
  const fullKey = CDN_PREFIX ? `${CDN_PREFIX}/${s3Key}` : s3Key;

  await getS3().send(new PutObjectCommand({
    Bucket: CDN_BUCKET,
    Key: fullKey,
    Body: body,
    ContentType: mime,
    CacheControl: options?.cacheControl || 'public, max-age=31536000, immutable',
  }));

  return `${CDN_BASE_URL}/${fullKey}`;
}

/**
 * Загрузить буфер в S3.
 */
export async function uploadBufferToS3(
  buffer: Buffer,
  s3Key: string,
  contentType: string,
  options?: { cacheControl?: string }
): Promise<string> {
  const fullKey = CDN_PREFIX ? `${CDN_PREFIX}/${s3Key}` : s3Key;

  await getS3().send(new PutObjectCommand({
    Bucket: CDN_BUCKET,
    Key: fullKey,
    Body: buffer,
    ContentType: contentType,
    CacheControl: options?.cacheControl || 'public, max-age=31536000, immutable',
  }));

  return `${CDN_BASE_URL}/${fullKey}`;
}

/**
 * Загрузить целую директорию в S3 (рекурсивно).
 * Используется для HLS (master.m3u8 + segments).
 * @returns Массив { localPath, s3Url }.
 */
export async function uploadDirToS3(
  localDir: string,
  s3Prefix: string
): Promise<{ localPath: string; s3Url: string }[]> {
  const results: { localPath: string; s3Url: string }[] = [];

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(localDir, fullPath);
        results.push({ localPath: fullPath, s3Url: '' });
      }
    }
  }

  walkDir(localDir);

  // Upload in parallel (max 8 concurrent)
  const CONCURRENCY = 8;
  let idx = 0;

  async function worker() {
    while (idx < results.length) {
      const i = idx++;
      if (i >= results.length) break;
      const relativePath = path.relative(localDir, results[i].localPath);
      const key = `${s3Prefix}/${relativePath}`;
      results[i].s3Url = await uploadToS3(results[i].localPath, key);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, results.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Получить публичный S3 URL для ключа.
 */
export function getS3Url(s3Key: string): string {
  const fullKey = CDN_PREFIX ? `${CDN_PREFIX}/${s3Key}` : s3Key;
  return `${CDN_BASE_URL}/${fullKey}`;
}

/**
 * Проверить существование объекта.
 */
export async function s3Exists(s3Key: string): Promise<boolean> {
  try {
    const fullKey = CDN_PREFIX ? `${CDN_PREFIX}/${s3Key}` : s3Key;
    await getS3().send(new HeadObjectCommand({ Bucket: CDN_BUCKET, Key: fullKey }));
    return true;
  } catch {
    return false;
  }
}
