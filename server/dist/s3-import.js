#!/usr/bin/env tsx
/**
 * GROMKO S3 Import — импорт музыки из Yandex Object Storage
 *
 * Структура бакета:
 *   musicpfvlisten/
 *     BOOKER/
 *       (2017) Альбом/
 *         01. Трек.mp3
 *         Cover.jpg
 *       (2018) Альбом 2/
 *         ...
 *     Baby Cute/
 *       #hooligani [E]/
 *         01. hooligang.flac
 *         ...
 *     music/              ← может быть вложенная папка
 *       ...
 *
 * Использование:
 *   npx tsx src/s3-import.ts
 *
 * Опции (через .env или переменные окружения):
 *   S3_ENDPOINT=https://storage.yandexcloud.net
 *   S3_REGION=ru-central1
 *   S3_BUCKET=musicpfvlisten
 *   S3_ACCESS_KEY=...
 *   S3_SECRET_KEY=...
 *   S3_PREFIX=             — подпапка в бакете (пусто = корень)
 *   WORKERS=4              — число параллельных FFmpeg процессов
 *   GENRE=Hip-Hop          — принудительный жанр
 *   DRY_RUN=1              — только сканировать, не импортировать
 *   SKIP_EXISTING=1        — пропускать уже импортированные треки
 *   ARTIST_FILTER=BOOKER   — импортировать только одного артиста
 *   LIMIT=10               — максимум треков для импорта
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { pipeline } from 'stream/promises';
import { v4 as uuid } from 'uuid';
import { S3Client, ListObjectsV2Command, GetObjectCommand, } from '@aws-sdk/client-s3';
import { query, queryOne, execute, initSchema, closeDb } from './db.js';
import { ensureDirs, PATHS } from './config.js';
import { processTrack, extractMetadata } from './audio-processor.js';
import { parseArtistNames } from './parse-artists.js';
import { slugify } from './slugify.js';
// ─── S3 Config ───
const S3_ENDPOINT = (process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net').trim();
const S3_REGION = (process.env.S3_REGION || 'ru-central1').trim();
const S3_BUCKET = (process.env.S3_BUCKET || 'musicpfvlisten').trim();
const S3_PREFIX = (process.env.S3_PREFIX || '').trim();
const S3_ACCESS = process.env.S3_ACCESS_KEY?.trim();
const S3_SECRET = process.env.S3_SECRET_KEY?.trim();
if (!S3_ACCESS || !S3_SECRET) {
    console.error(`
  ❌ Не заданы S3_ACCESS_KEY и S3_SECRET_KEY!

  Добавь в server/.env:
    S3_ENDPOINT=https://storage.yandexcloud.net
    S3_REGION=ru-central1
    S3_BUCKET=musicpfvlisten
    S3_ACCESS_KEY=твой_access_key
    S3_SECRET_KEY=твой_secret_key
  `);
    process.exit(1);
}
const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
        accessKeyId: S3_ACCESS,
        secretAccessKey: S3_SECRET,
    },
    forcePathStyle: true, // Yandex Object Storage requires path-style
});
// ─── Import Config ───
const MAX_WORKERS = Math.max(1, Math.min(Number(process.env.WORKERS) || (os.cpus().length - 1), 6));
const DRY_RUN = process.env.DRY_RUN === '1';
const FORCE_GENRE = process.env.GENRE || '';
const SKIP_EXISTING = process.env.SKIP_EXISTING !== '0'; // default: on
const ARTIST_FILTER = process.env.ARTIST_FILTER || '';
const ALBUM_FILTER = process.env.ALBUM_FILTER || '';
const IMPORT_LIMIT = Number(process.env.LIMIT) || 0;
const SHUFFLE = process.env.SHUFFLE !== '0'; // default: on — shuffle for variety
// ─── Audio extensions ───
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.aiff']);
const COVER_NAMES = new Set(['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'artwork.jpg', 'artwork.png']);
const stats = {
    totalFound: 0,
    skipped: 0,
    queued: 0,
    processed: 0,
    errors: 0,
    downloaded: 0,
    totalBytes: 0,
    startTime: Date.now(),
};
// ─── Helpers ───
function formatBytes(bytes) {
    if (bytes < 1024)
        return bytes + ' B';
    if (bytes < 1024 * 1024)
        return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024)
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0)
        return `${h}ч ${m % 60}м ${s % 60}с`;
    if (m > 0)
        return `${m}м ${s % 60}с`;
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
    process.stdout.write(`\r  [${bar}] ${percent}%  ${done}/${total}  ` +
        `✅ ${stats.processed}  ❌ ${stats.errors}  ` +
        `📥 ${formatBytes(stats.totalBytes)}  ` +
        `⏱ ${formatTime(elapsed)}  ` +
        (done > 0 && done < total ? `≈ ${formatTime(remaining)} осталось  ` : '') +
        '   ');
}
// ─── S3 Operations ───
/**
 * List ALL objects in the bucket (handles pagination automatically).
 */
async function listAllObjects(prefix) {
    const objects = [];
    let continuationToken;
    console.log(`  📡 Сканирование бакета s3://${S3_BUCKET}/${prefix || ''}...`);
    let page = 0;
    do {
        const cmd = new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: prefix || undefined,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
        });
        const res = await s3.send(cmd);
        if (res.Contents) {
            objects.push(...res.Contents);
        }
        continuationToken = res.NextContinuationToken;
        page++;
        if (page % 5 === 0) {
            process.stdout.write(`\r  📡 Просканировано: ${objects.length} объектов...   `);
        }
    } while (continuationToken);
    console.log(`\r  📡 Всего объектов в бакете: ${objects.length}          `);
    return objects;
}
/**
 * Download an S3 object to a local file path.
 */
async function downloadToFile(key, destPath) {
    const cmd = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
    });
    const res = await s3.send(cmd);
    if (!res.Body)
        throw new Error(`Empty body for key: ${key}`);
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });
    const writeStream = fs.createWriteStream(destPath);
    await pipeline(res.Body, writeStream);
}
// ─── Parse S3 structure into tracks ───
/**
 * Парсит структуру бакета:
 *   Артист/Альбом/Трек.mp3
 *   Артист/Альбом/Cover.jpg
 *
 * Также обрабатывает:
 *   Артист/Трек.mp3  (без альбома — синглы)
 *   music/Артист/Альбом/Трек.mp3  (вложенная папка "music")
 */
function parseS3Objects(objects) {
    const tracks = [];
    const coverMap = new Map(); // folder => cover S3 key
    // First pass: find all cover images
    for (const obj of objects) {
        if (!obj.Key || !obj.Size)
            continue;
        const basename = path.basename(obj.Key).toLowerCase();
        if (COVER_NAMES.has(basename)) {
            const folder = path.dirname(obj.Key);
            coverMap.set(folder, obj.Key);
        }
    }
    // Second pass: find all audio files
    for (const obj of objects) {
        if (!obj.Key || !obj.Size)
            continue;
        const ext = path.extname(obj.Key).toLowerCase();
        if (!AUDIO_EXTS.has(ext))
            continue;
        // Skip tiny files (< 100KB — probably not real audio)
        if (obj.Size < 100_000)
            continue;
        const filename = path.basename(obj.Key);
        // Parse folder structure to extract artist/album
        // Remove S3_PREFIX from the beginning
        let relativePath = obj.Key;
        if (S3_PREFIX && relativePath.startsWith(S3_PREFIX)) {
            relativePath = relativePath.slice(S3_PREFIX.length);
            if (relativePath.startsWith('/'))
                relativePath = relativePath.slice(1);
        }
        const parts = relativePath.split('/').filter(Boolean);
        let artist = 'Неизвестный артист';
        let album = '';
        if (parts.length >= 3) {
            // Артист/Альбом/Трек.mp3
            artist = parts[0];
            album = parts[1];
        }
        else if (parts.length === 2) {
            // Артист/Трек.mp3 (сингл без альбома)
            artist = parts[0];
            album = '';
        }
        else if (parts.length === 1) {
            // Трек.mp3 в корне
            artist = 'Неизвестный артист';
        }
        // Skip "music" folder as artist name — go one level deeper
        if (artist.toLowerCase() === 'music' && parts.length >= 3) {
            artist = parts[1];
            album = parts.length >= 4 ? parts[2] : '';
        }
        // Artist filter
        if (ARTIST_FILTER && artist.toLowerCase() !== ARTIST_FILTER.toLowerCase()) {
            continue;
        }
        // Album filter
        if (ALBUM_FILTER && album.toLowerCase() !== ALBUM_FILTER.toLowerCase()) {
            continue;
        }
        // Find cover for this track's album folder
        const trackFolder = path.dirname(obj.Key);
        const coverKey = coverMap.get(trackFolder);
        tracks.push({
            key: obj.Key,
            size: obj.Size,
            artist,
            album,
            filename,
            ext,
            coverKey,
        });
    }
    return { tracks, coverMap };
}
/**
 * Parse album name to extract year.
 * "(2017) Альбом" → { year: 2017, cleanAlbum: "Альбом" }
 * "2018 - Название" → { year: 2018, cleanAlbum: "Название" }
 */
function parseAlbumYear(album) {
    // Pattern: (2017) Album Name
    let match = album.match(/^\((\d{4})\)\s*(.*)$/);
    if (match)
        return { year: parseInt(match[1]), cleanAlbum: match[2].trim() || album };
    // Pattern: 2017 - Album Name
    match = album.match(/^(\d{4})\s*[-–—]\s*(.*)$/);
    if (match)
        return { year: parseInt(match[1]), cleanAlbum: match[2].trim() || album };
    // Pattern: Album Name (2017)
    match = album.match(/^(.*?)\s*\((\d{4})\)\s*$/);
    if (match)
        return { year: parseInt(match[2]), cleanAlbum: match[1].trim() || album };
    return { cleanAlbum: album };
}
/**
 * Clean up track title from filename.
 * "01. Track Name.mp3" → "Track Name"
 * "03 - Track.flac" → "Track"
 */
function cleanTrackTitle(filename) {
    let name = path.parse(filename).name;
    // Remove leading track numbers: "01. ", "01 - ", "1. ", "01_"
    name = name.replace(/^\d{1,3}[\s._-]+/, '');
    // Remove leading "Artist - " if it matches common pattern
    // (we already know artist from folder)
    return name.trim();
}
/**
 * Detect if track is explicit from album/filename markers.
 * [E], (Explicit), [Explicit], etc.
 */
function isExplicit(album, filename) {
    const combined = `${album} ${filename}`.toLowerCase();
    return /\[e\]|\(e\)|\bexplicit\b|\[explicit\]|\(explicit\)/.test(combined);
}
// ─── DB helpers ───
async function ensureArtist(artistName, genre) {
    const slug = slugify(artistName);
    if (!slug)
        return 'unknown';
    const existing = await queryOne('SELECT id FROM artists WHERE slug = $1', [slug]);
    if (existing) {
        return slug;
    }
    await execute(`
    INSERT INTO artists (id, name, slug, genre, tracks_count, total_plays)
    VALUES ($1, $2, $3, $4, 0, 0)
    ON CONFLICT (slug) DO NOTHING
  `, [uuid(), artistName, slug, genre]);
    return slug;
}
/**
 * Split artist string by ", " and ensure each artist exists.
 * Returns array of { slug, name } for all artists + primary slug for artist_slug column.
 */
async function ensureArtists(artistString, genre) {
    // Split by ", " / "feat." / "ft." / "&" etc.
    const names = parseArtistNames(artistString);
    if (names.length === 0)
        return { primarySlug: 'unknown', artists: [] };
    const result = [];
    for (const name of names) {
        const slug = await ensureArtist(name, genre);
        result.push({ slug, name });
    }
    return { primarySlug: result[0].slug, artists: result };
}
/**
 * Link track to all its artists in the junction table.
 */
async function linkTrackArtists(trackId, artists) {
    for (let i = 0; i < artists.length; i++) {
        const artist = await queryOne('SELECT id FROM artists WHERE slug = $1', [artists[i].slug]);
        if (artist) {
            await execute(`
        INSERT INTO track_artists (track_id, artist_id, position)
        VALUES ($1, $2, $3)
        ON CONFLICT (track_id, artist_id) DO NOTHING
      `, [trackId, artist.id, i]);
        }
    }
}
// ─── Import a single track from S3 ───
async function importSingleTrack(track, existingFiles) {
    // Skip if already imported (by S3 key as original_filename)
    const importKey = track.key; // use full S3 key as unique identifier
    if (SKIP_EXISTING && existingFiles.has(importKey)) {
        stats.skipped++;
        return;
    }
    // Also check by filename alone (for tracks imported from local disk earlier)
    if (SKIP_EXISTING && existingFiles.has(track.filename)) {
        stats.skipped++;
        return;
    }
    const tempDir = path.join(PATHS.temp, uuid());
    fs.mkdirSync(tempDir, { recursive: true });
    const tempAudioPath = path.join(tempDir, track.filename);
    let tempCoverPath;
    try {
        // ── Download audio from S3 ──
        await downloadToFile(track.key, tempAudioPath);
        stats.downloaded++;
        stats.totalBytes += track.size;
        // ── Download cover from S3 if available ──
        if (track.coverKey) {
            tempCoverPath = path.join(tempDir, 'cover' + path.extname(track.coverKey));
            try {
                await downloadToFile(track.coverKey, tempCoverPath);
            }
            catch {
                tempCoverPath = undefined; // cover download failed — use embedded
            }
        }
        // ── Extract metadata ──
        const meta = await extractMetadata(tempAudioPath);
        // Build track info (prefer ID3 tags, fallback to folder structure)
        const title = meta.title || cleanTrackTitle(track.filename);
        const artist = meta.artist || track.artist;
        const { year: albumYear, cleanAlbum } = parseAlbumYear(track.album);
        const album = meta.album || cleanAlbum || undefined;
        const genre = FORCE_GENRE || meta.genre || 'Другое';
        const year = meta.year || albumYear || new Date().getFullYear();
        const explicit = isExplicit(track.album, track.filename);
        const trackId = uuid();
        const { primarySlug, artists } = await ensureArtists(artist, genre);
        // ── Insert track into DB ──
        await execute(`
      INSERT INTO tracks (id, title, artist, artist_slug, genre, year, duration,
                         original_filename, original_format, original_size, original_bitrate,
                         original_sample_rate, original_channels, explicit, status,
                         meta_album)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15)
    `, [
            trackId, title, artist, primarySlug, genre, year, meta.duration,
            importKey, // store full S3 key as original_filename for dedup
            meta.format, track.size, meta.bitrate,
            meta.sampleRate, meta.channels,
            explicit,
            album || null,
        ]);
        // ── Link track to all artists ──
        await linkTrackArtists(trackId, artists);
        existingFiles.add(importKey);
        existingFiles.add(track.filename);
        stats.queued++;
        // ── Process through FFmpeg pipeline ──
        await processTrack(trackId, tempAudioPath, tempCoverPath, false /* don't keep — it's temp */);
        stats.processed++;
        printProgress();
    }
    catch (err) {
        stats.errors++;
        console.error(`\n  ❌ ${track.artist} — ${track.filename}: ${err.message}`);
        printProgress();
    }
    finally {
        // Cleanup temp directory
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        catch { /* ignore cleanup errors */ }
    }
}
// ─── Parallel worker pool ───
async function processPool(tracks, existingFiles) {
    let cursor = 0;
    async function worker(workerId) {
        while (cursor < tracks.length) {
            const idx = cursor++;
            if (idx >= tracks.length)
                break;
            await importSingleTrack(tracks[idx], existingFiles);
        }
    }
    const workers = [];
    for (let i = 0; i < MAX_WORKERS; i++) {
        workers.push(worker(i));
    }
    await Promise.all(workers);
}
// ─── Main ───
async function main() {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║       🔊  GROMKO S3 Import  🔊                      ║');
    console.log('  ║       Yandex Object Storage → GROMKO                 ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  🪣  Бакет:     s3://${S3_BUCKET}/${S3_PREFIX || ''}`);
    console.log(`  🌐 Endpoint:  ${S3_ENDPOINT}`);
    console.log(`  🔧 Потоков:   ${MAX_WORKERS}`);
    if (FORCE_GENRE)
        console.log(`  🎵 Жанр:      ${FORCE_GENRE}`);
    if (ARTIST_FILTER)
        console.log(`  🎤 Артист:    ${ARTIST_FILTER}`);
    if (ALBUM_FILTER)
        console.log(`  💿 Альбом:    ${ALBUM_FILTER}`);
    if (IMPORT_LIMIT)
        console.log(`  📊 Лимит:     ${IMPORT_LIMIT} треков`);
    if (SHUFFLE)
        console.log(`  🔀 Порядок:   вразброс`);
    if (DRY_RUN)
        console.log(`  🔍 Режим:     DRY RUN (без импорта)`);
    console.log('');
    // Fail fast: verify DB connectivity before expensive full-bucket scan.
    if (!DRY_RUN) {
        ensureDirs();
        await initSchema();
        await closeDb(); // release connection — S3 scan takes 20s+ and Neon kills idle connections
    }
    // ── Step 1: List all objects in bucket ──
    const allObjects = await listAllObjects(S3_PREFIX);
    // ── Step 2: Parse structure into tracks ──
    const { tracks: allTracks, coverMap } = parseS3Objects(allObjects);
    stats.totalFound = allTracks.length;
    const totalSize = allTracks.reduce((sum, t) => sum + t.size, 0);
    // Unique artists
    const artistSet = new Set(allTracks.map(t => t.artist));
    // Unique albums
    const albumSet = new Set(allTracks.filter(t => t.album).map(t => `${t.artist}/${t.album}`));
    console.log(`  📊 Найдено:`);
    console.log(`     🎵 ${allTracks.length} аудиофайлов (${formatBytes(totalSize)})`);
    console.log(`     🎤 ${artistSet.size} артистов`);
    console.log(`     💿 ${albumSet.size} альбомов`);
    console.log(`     🖼  ${coverMap.size} обложек`);
    console.log('');
    // Format breakdown
    const extCounts = new Map();
    for (const t of allTracks) {
        extCounts.set(t.ext, (extCounts.get(t.ext) || 0) + 1);
    }
    const fmtParts = [...extCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([ext, count]) => `${ext}: ${count}`)
        .join(', ');
    console.log(`  📁 Форматы: ${fmtParts}`);
    console.log('');
    if (DRY_RUN) {
        // Show first N artists with track counts
        console.log('  Артисты:');
        const artistCounts = new Map();
        for (const t of allTracks) {
            artistCounts.set(t.artist, (artistCounts.get(t.artist) || 0) + 1);
        }
        const sorted = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]);
        for (const [artist, count] of sorted.slice(0, 30)) {
            console.log(`    🎤 ${artist}: ${count} треков`);
        }
        if (sorted.length > 30) {
            console.log(`    ... и ещё ${sorted.length - 30} артистов`);
        }
        console.log(`\n  ✅ DRY RUN завершён. Убери DRY_RUN=1 для импорта.\n`);
        process.exit(0);
    }
    // ── Step 3: Get existing filenames/keys to skip duplicates ──
    const existingRows = await query('SELECT original_filename FROM tracks');
    const existingFiles = new Set(existingRows.map((r) => r.original_filename).filter(Boolean));
    // Filter out already imported
    let tracksToImport = SKIP_EXISTING
        ? allTracks.filter(t => !existingFiles.has(t.key) && !existingFiles.has(t.filename))
        : allTracks;
    const alreadyImported = allTracks.length - tracksToImport.length;
    if (alreadyImported > 0) {
        console.log(`  ⏭  Пропуск: ${alreadyImported} треков уже импортировано`);
    }
    // Shuffle for variety — mix tracks from different artists
    if (SHUFFLE && tracksToImport.length > 1) {
        for (let i = tracksToImport.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tracksToImport[i], tracksToImport[j]] = [tracksToImport[j], tracksToImport[i]];
        }
        console.log(`  🔀 Порядок перемешан (${tracksToImport.length} треков)`);
    }
    // Apply limit
    if (IMPORT_LIMIT > 0 && tracksToImport.length > IMPORT_LIMIT) {
        console.log(`  ✂️  Лимит: берём ${IMPORT_LIMIT} из ${tracksToImport.length}`);
        tracksToImport = tracksToImport.slice(0, IMPORT_LIMIT);
    }
    if (tracksToImport.length === 0) {
        console.log('  ✅ Все треки уже импортированы!\n');
        process.exit(0);
    }
    const importSize = tracksToImport.reduce((sum, t) => sum + t.size, 0);
    console.log(`  🚀 Импорт: ${tracksToImport.length} треков (${formatBytes(importSize)}, ${MAX_WORKERS} потоков)\n`);
    stats.queued = 0; // will be incremented as tracks are queued
    stats.startTime = Date.now();
    // ── Step 4: Process in parallel ──
    await processPool(tracksToImport, existingFiles);
    // ── Step 5: Summary ──
    const elapsed = Date.now() - stats.startTime;
    console.log('\n\n');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║              📊  Результат S3 импорта                ║');
    console.log('  ╠══════════════════════════════════════════════════════╣');
    console.log(`  ║  Найдено в S3:     ${String(stats.totalFound).padStart(6)}                          ║`);
    console.log(`  ║  Пропущено:        ${String(stats.skipped).padStart(6)}                          ║`);
    console.log(`  ║  Скачано:          ${String(stats.downloaded).padStart(6)}  (${formatBytes(stats.totalBytes).padStart(10)})     ║`);
    console.log(`  ║  Обработано:       ${String(stats.processed).padStart(6)}  ✅                     ║`);
    console.log(`  ║  Ошибки:           ${String(stats.errors).padStart(6)}  ${stats.errors > 0 ? '❌' : '✅'}                     ║`);
    console.log(`  ║  Время:        ${formatTime(elapsed).padStart(10)}                          ║`);
    if (stats.processed > 0) {
        console.log(`  ║  Среднее/трек: ${formatTime(elapsed / stats.processed).padStart(10)}                          ║`);
        console.log(`  ║  Скорость:     ${formatBytes(stats.totalBytes / (elapsed / 1000)).padStart(10)}/с              ║`);
    }
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');
    // Update artist track counts (via junction table + legacy artist_slug)
    await execute(`
    UPDATE artists SET tracks_count = (
      SELECT COUNT(DISTINCT t.id) FROM tracks t
      LEFT JOIN track_artists ta ON ta.track_id = t.id
      WHERE (ta.artist_id = artists.id OR t.artist_slug = artists.slug)
        AND t.status = 'ready'
    )
  `);
    if (stats.errors > 0) {
        console.log('  ⚠️  Треки с ошибками:');
        const errorTracks = await query(`
      SELECT original_filename, processing_error FROM tracks WHERE status = 'error' ORDER BY created_at DESC LIMIT 20
    `);
        for (const t of errorTracks) {
            const short = t.original_filename?.split('/')?.pop() || t.original_filename;
            console.log(`    ❌ ${short}: ${t.processing_error}`);
        }
        console.log('');
    }
    await closeDb();
    process.exit(0);
}
main().catch(async (err) => {
    console.error('\n  💥 Критическая ошибка:', err);
    await closeDb().catch(() => { });
    process.exit(1);
});
//# sourceMappingURL=s3-import.js.map