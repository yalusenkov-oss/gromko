#!/usr/bin/env tsx
/**
 * GROMKO Bulk Import — массовый импорт MP3 из папки
 *
 * Использование:
 *   npx tsx src/bulk-import.ts /путь/к/папке/с/музыкой
 *
 * Опции (через переменные окружения):
 *   WORKERS=4        — число параллельных FFmpeg процессов (по умолчанию: CPU ядра - 1, макс 4)
 *   GENRE=Hip-Hop    — принудительно задать жанр всем трекам
 *   DRY_RUN=1        — только сканировать, не импортировать
 *   SKIP_EXISTING=1  — пропускать файлы, которые уже были импортированы (по имени файла)
 *
 * Что делает:
 *   1. Рекурсивно находит все .mp3 файлы в указанной папке
 *   2. Извлекает метаданные из ID3-тегов (title, artist, album, genre, year, обложка)
 *   3. Регистрирует каждый трек в базе данных
 *   4. Параллельно запускает FFmpeg пайплайн (AAC 64k/128k/256k + HLS + waveform)
 *   5. Создаёт записи артистов автоматически
 *   6. Оригиналы НЕ удаляются — файлы остаются на месте
 *
 * Пример:
 *   npx tsx src/bulk-import.ts ~/Music/releases
 *   WORKERS=2 GENRE="Рэп" npx tsx src/bulk-import.ts ~/Music/rap-collection
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuid } from 'uuid';
import { parseFile as parseAudioFile } from 'music-metadata';
import { query, queryOne, execute, initSchema } from './db.js';
import { ensureDirs } from './config.js';
import { processTrack, extractMetadata } from './audio-processor.js';

// ─── Config ───
const MAX_WORKERS = Math.max(1, Math.min(
  Number(process.env.WORKERS) || (os.cpus().length - 1),
  6
));
const DRY_RUN = process.env.DRY_RUN === '1';
const FORCE_GENRE = process.env.GENRE || '';
const SKIP_EXISTING = process.env.SKIP_EXISTING !== '0'; // default: on

// ─── Stats ───
interface ImportStats {
  totalFound: number;
  skipped: number;
  queued: number;
  processed: number;
  errors: number;
  startTime: number;
}

const stats: ImportStats = {
  totalFound: 0,
  skipped: 0,
  queued: 0,
  processed: 0,
  errors: 0,
  startTime: Date.now(),
};

// ─── Helpers ───

function findMp3Files(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return; // skip inaccessible directories
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden directories and node_modules
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.mp3') {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results.sort();
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[ёе]/g, 'e')
    .replace(/[а-яА-Я]/g, (ch) => {
      const map: Record<string, string> = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ж': 'zh',
        'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
        'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh',
        'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
        'я': 'ya',
      };
      return map[ch] || ch;
    })
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}ч ${m % 60}м ${s % 60}с`;
  if (m > 0) return `${m}м ${s % 60}с`;
  return `${s}с`;
}

function printProgress() {
  const done = stats.processed + stats.errors;
  const total = stats.queued;
  const elapsed = Date.now() - stats.startTime;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const avgPerTrack = done > 0 ? elapsed / done : 0;
  const remaining = avgPerTrack * (total - done);

  const bar = total > 0
    ? '█'.repeat(Math.floor(percent / 2.5)) + '░'.repeat(40 - Math.floor(percent / 2.5))
    : '░'.repeat(40);

  process.stdout.write(
    `\r  [${bar}] ${percent}%  ${done}/${total}  ` +
    `✅ ${stats.processed}  ❌ ${stats.errors}  ` +
    `⏱ ${formatTime(elapsed)}  ` +
    (done > 0 && done < total ? `≈ ${formatTime(remaining)} осталось  ` : '') +
    '   ' // trailing spaces to clear old chars
  );
}

// ─── Ensure artist exists ───
async function ensureArtist(artistName: string, genre: string): Promise<string> {
  const slug = slugify(artistName);
  if (!slug) return 'unknown';

  const existing = await queryOne('SELECT id FROM artists WHERE slug = $1', [slug]);
  if (existing) {
    await execute('UPDATE artists SET tracks_count = tracks_count + 1 WHERE slug = $1', [slug]);
    return slug;
  }

  await execute(`
    INSERT INTO artists (id, name, slug, genre, tracks_count, total_plays)
    VALUES ($1, $2, $3, $4, 1, 0)
  `, [uuid(), artistName, slug, genre]);

  return slug;
}

// ─── Process a single file ───
async function importSingleTrack(
  filePath: string,
  existingFiles: Set<string>,
): Promise<void> {
  const filename = path.basename(filePath);

  // Skip if already imported
  if (SKIP_EXISTING && existingFiles.has(filename)) {
    stats.skipped++;
    return;
  }

  try {
    const meta = await extractMetadata(filePath);

    const trackId = uuid();
    const title = meta.title || path.parse(filename).name.replace(/^\d+[\s._-]+/, '');
    const artist = meta.artist || 'Неизвестный артист';
    const genre = FORCE_GENRE || meta.genre || 'Другое';
    const year = meta.year || new Date().getFullYear();
    const slug = await ensureArtist(artist, genre);

    // Insert track into DB
    await execute(`
      INSERT INTO tracks (id, title, artist, artist_slug, genre, year, duration,
                         original_filename, original_format, original_size, original_bitrate,
                         original_sample_rate, original_channels, explicit, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,'pending')
    `, [
      trackId, title, artist, slug, genre, year, meta.duration,
      filename, meta.format, fs.statSync(filePath).size, meta.bitrate,
      meta.sampleRate, meta.channels
    ]);

    existingFiles.add(filename);
    stats.queued++;

    return new Promise<void>((resolve) => {
      // Process track — keepOriginal = true (don't delete source MP3)
      processTrack(trackId, filePath, undefined, true)
        .then(() => {
          stats.processed++;
          printProgress();
          resolve();
        })
        .catch((err) => {
          stats.errors++;
          console.error(`\n  ❌ ${filename}: ${err.message}`);
          printProgress();
          resolve(); // don't reject — continue with next tracks
        });
    });
  } catch (err: any) {
    stats.errors++;
    console.error(`\n  ❌ Метаданные ${filename}: ${err.message}`);
  }
}

// ─── Parallel worker pool ───
async function processPool(
  files: string[],
  existingFiles: Set<string>,
) {
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const idx = cursor++;
      await importSingleTrack(files[idx], existingFiles);
    }
  }

  // Launch N workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < MAX_WORKERS; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
}

// ─── Main ───
async function main() {
  const inputDir = process.argv[2];

  if (!inputDir) {
    console.error(`
  ╔══════════════════════════════════════════════════════╗
  ║         🔊  GROMKO Bulk Import  🔊                  ║
  ╠══════════════════════════════════════════════════════╣
  ║                                                      ║
  ║  Использование:                                      ║
  ║    npx tsx src/bulk-import.ts /путь/к/музыке         ║
  ║                                                      ║
  ║  Опции (env):                                        ║
  ║    WORKERS=4       параллельных потоков               ║
  ║    GENRE="Рэп"     жанр для всех треков              ║
  ║    DRY_RUN=1       только сканировать                ║
  ║    SKIP_EXISTING=0 не пропускать дубли               ║
  ║                                                      ║
  ║  Пример:                                             ║
  ║    npx tsx src/bulk-import.ts ~/Music/releases       ║
  ║    WORKERS=2 npx tsx src/bulk-import.ts ./tracks     ║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  const resolvedDir = path.resolve(inputDir);

  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    console.error(`\n  ❌ Директория не найдена: ${resolvedDir}\n`);
    process.exit(1);
  }

  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║         🔊  GROMKO Bulk Import  🔊                  ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  📂 Папка: ${resolvedDir}`);
  console.log(`  🔧 Параллельных потоков: ${MAX_WORKERS}`);
  if (FORCE_GENRE) console.log(`  🎵 Жанр: ${FORCE_GENRE}`);
  if (DRY_RUN) console.log(`  🔍 Режим: DRY RUN (без импорта)`);
  console.log('');

  // ── Step 1: Scan for MP3 files ──
  console.log('  🔍 Сканирование...');
  const files = findMp3Files(resolvedDir);
  stats.totalFound = files.length;

  if (files.length === 0) {
    console.error('  ❌ MP3 файлы не найдены!\n');
    process.exit(1);
  }

  // Calculate total size
  let totalSize = 0;
  for (const f of files) {
    try { totalSize += fs.statSync(f).size; } catch { /* skip */ }
  }

  console.log(`  📊 Найдено: ${files.length} MP3 файлов (${formatBytes(totalSize)})`);
  console.log('');

  if (DRY_RUN) {
    // Show first 20 files
    console.log('  Первые 20 файлов:');
    for (const f of files.slice(0, 20)) {
      console.log(`    ${path.relative(resolvedDir, f)}`);
    }
    if (files.length > 20) {
      console.log(`    ... и ещё ${files.length - 20} файлов`);
    }
    console.log(`\n  ✅ DRY RUN завершён. Убери DRY_RUN=1 для импорта.\n`);
    process.exit(0);
  }

  // ── Step 2: Initialize DB ──
  ensureDirs();
  await initSchema();

  // Get existing filenames to skip duplicates
  const existingRows = await query('SELECT original_filename FROM tracks');
  const existingFiles = new Set<string>(existingRows.map((r: any) => r.original_filename).filter(Boolean));

  const alreadyImported = files.filter(f => existingFiles.has(path.basename(f))).length;
  if (alreadyImported > 0 && SKIP_EXISTING) {
    console.log(`  ⏭  Пропуск: ${alreadyImported} треков уже импортировано`);
  }

  const toImport = SKIP_EXISTING
    ? files.filter(f => !existingFiles.has(path.basename(f)))
    : files;

  if (toImport.length === 0) {
    console.log('  ✅ Все треки уже импортированы!\n');
    process.exit(0);
  }

  console.log(`  🚀 Импорт: ${toImport.length} треков (${MAX_WORKERS} потоков)\n`);

  stats.startTime = Date.now();

  // ── Step 3: Process in parallel ──
  await processPool(toImport, existingFiles);

  // ── Step 4: Summary ──
  const elapsed = Date.now() - stats.startTime;

  console.log('\n\n');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║              📊  Результат импорта                   ║');
  console.log('  ╠══════════════════════════════════════════════════════╣');
  console.log(`  ║  Найдено MP3:      ${String(stats.totalFound).padStart(6)}                          ║`);
  console.log(`  ║  Пропущено:        ${String(stats.skipped).padStart(6)}                          ║`);
  console.log(`  ║  Обработано:       ${String(stats.processed).padStart(6)}  ✅                     ║`);
  console.log(`  ║  Ошибки:           ${String(stats.errors).padStart(6)}  ${stats.errors > 0 ? '❌' : '✅'}                     ║`);
  console.log(`  ║  Время:        ${formatTime(elapsed).padStart(10)}                          ║`);
  if (stats.processed > 0) {
    console.log(`  ║  Среднее/трек: ${formatTime(elapsed / stats.processed).padStart(10)}                          ║`);
  }
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Update artist total_plays counts
  await execute(`
    UPDATE artists SET tracks_count = (
      SELECT COUNT(*) FROM tracks WHERE tracks.artist_slug = artists.slug AND tracks.status = 'ready'
    )
  `);

  if (stats.errors > 0) {
    console.log('  ⚠️  Треки с ошибками:');
    const errorTracks = await query(`
      SELECT original_filename, processing_error FROM tracks WHERE status = 'error' LIMIT 20
    `);
    for (const t of errorTracks as any[]) {
      console.log(`    ❌ ${t.original_filename}: ${t.processing_error}`);
    }
    console.log('');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n  💥 Критическая ошибка:', err);
  process.exit(1);
});
