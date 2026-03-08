import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import { PATHS } from './config.js';
import { execute, queryOne } from './db.js';
import { enqueueTrack, extractMetadata } from './audio-processor.js';
import { slugify } from './slugify.js';
import { parseArtistNames } from './parse-artists.js';
import { findExistingTrackByArtistAndTitle } from './track-dedupe.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_EXTS = new Set(['.flac', '.m4a', '.mp3', '.aac', '.ogg', '.wav']);
const jobs = new Map();
const artistGenreCache = new Map();
function getYmdDir() {
    const candidates = [
        path.resolve(process.cwd(), 'yandex-music-downloader-main'),
        path.resolve(process.cwd(), '..', 'yandex-music-downloader-main'),
        path.resolve(__dirname, '..', '..', 'yandex-music-downloader-main'),
    ];
    for (const dir of candidates) {
        if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'pyproject.toml'))) {
            return dir;
        }
    }
    return candidates[0];
}
function yandexToken() {
    return (process.env.YANDEX_MUSIC_TOKEN || '').trim();
}
function runCommand(cmd, args, cwd, envExtra, timeoutMs = 60_000) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd,
            env: {
                ...process.env,
                ...envExtra,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const output = [];
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error(`${cmd} ${args.join(' ')} timeout`));
        }, timeoutMs);
        child.stdout.on('data', (d) => {
            output.push(d.toString());
        });
        child.stderr.on('data', (d) => {
            output.push(d.toString());
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0)
                return resolve();
            reject(new Error(output.join('').trim() || `${cmd} exited with code ${code}`));
        });
    });
}
async function ensureYmdEnv(ymdDir) {
    const venvPython = path.join(ymdDir, '.venv', 'bin', 'python');
    const depsMarker = path.join(ymdDir, '.venv', '.deps-ready');
    if (!fs.existsSync(venvPython)) {
        await runCommand('python3', ['-m', 'venv', '.venv'], ymdDir, undefined, 120_000);
    }
    if (!fs.existsSync(depsMarker)) {
        await runCommand(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], ymdDir, undefined, 120_000);
        await runCommand(venvPython, [
            '-m', 'pip', 'install',
            'mutagen>=1.47.0',
            'StrEnum',
            'pycryptodome',
            'yandex-music @ https://github.com/llistochek/yandex-music-api/archive/9623fbca7704f47766614efe51d66c9fd496714c.zip',
        ], ymdDir, undefined, 240_000);
        fs.writeFileSync(depsMarker, `${new Date().toISOString()}\n`);
    }
    return venvPython;
}
function collectAudioFiles(dir) {
    const result = [];
    if (!fs.existsSync(dir))
        return result;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...collectAudioFiles(full));
            continue;
        }
        if (!entry.isFile())
            continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTS.has(ext))
            result.push(full);
    }
    return result;
}
function findCoverNearAudio(audioPath) {
    const dir = path.dirname(audioPath);
    const names = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg'];
    for (const name of names) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate))
            return candidate;
    }
    return null;
}
function normalizeYandexUrl(raw) {
    return raw.trim();
}
function detectJobType(url) {
    if (url.includes('/track/'))
        return 'track';
    if (url.includes('/album/'))
        return 'album';
    if (url.includes('/playlists/'))
        return 'playlist';
    if (url.includes('/artist/'))
        return 'artist';
    return 'mixed';
}
function normalizeArtistDisplay(artistRaw) {
    return artistRaw
        .replace(/\s*;\s*/g, ', ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
function buildYandexImportComment(sourceUrl, meta) {
    const mm = Math.floor((meta.duration || 0) / 60);
    const ss = Math.round((meta.duration || 0) % 60).toString().padStart(2, '0');
    return [
        `Импортировано из Yandex Music: ${sourceUrl}`,
        `Трек: ${meta.artist} — ${meta.title}`,
        `Альбом: ${meta.album || '—'}`,
        `Год: ${meta.year || '—'}`,
        `Жанр: ${meta.genre || '—'}`,
        `Номер трека: ${meta.trackNumber || '—'}`,
        `Формат: ${meta.format || '—'}`,
        `Битрейт: ${meta.bitrate || 0} kbps`,
        `Sample rate: ${meta.sampleRate || 0} Hz`,
        `Каналы: ${meta.channels || 0}`,
        `Длительность: ${mm}:${ss}`,
    ].join('\n');
}
function isYandexMusicUrl(url) {
    return /^https?:\/\/(music\.)?yandex\.(ru|com)\//i.test(url.trim());
}
async function findArtistGenre(artist) {
    const primary = (parseArtistNames(artist)[0] || artist || '').trim();
    if (!primary)
        return null;
    const cacheKey = primary.toLowerCase();
    if (artistGenreCache.has(cacheKey))
        return artistGenreCache.get(cacheKey) || null;
    const slug = slugify(primary);
    try {
        const row = await queryOne('SELECT genre FROM artists WHERE slug = $1', [slug]);
        const genre = row?.genre?.trim() || null;
        artistGenreCache.set(cacheKey, genre);
        return genre;
    }
    catch {
        artistGenreCache.set(cacheKey, null);
        return null;
    }
}
async function resolveYandexGenre(metaGenre, requestedGenre, artist) {
    if (metaGenre && metaGenre.trim())
        return metaGenre.trim();
    const fromArtist = await findArtistGenre(artist);
    if (fromArtist)
        return fromArtist;
    return (requestedGenre || 'Другое').trim();
}
async function ensureArtists(trackId, artistRaw, genre) {
    const names = parseArtistNames(artistRaw || 'Unknown');
    const first = names[0] || 'Unknown';
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const slug = slugify(name);
        const existing = await queryOne('SELECT id FROM artists WHERE slug = $1', [slug]);
        let artistId = existing?.id;
        if (!artistId) {
            artistId = uuid();
            await execute('INSERT INTO artists (id, name, slug, genre, tracks_count, total_plays) VALUES ($1, $2, $3, $4, 0, 0)', [artistId, name, slug, genre || 'Другое']);
        }
        await execute('INSERT INTO track_artists (track_id, artist_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [trackId, artistId, i]);
    }
    return slugify(first);
}
function finalizeJob(job) {
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    if (job.completedTracks === 0 && job.failedTracks > 0) {
        const firstFailed = job.tracks.find(t => t.status === 'error' && t.error)?.error;
        job.status = 'error';
        job.error = firstFailed
            ? `Не удалось загрузить ни одного трека (${job.failedTracks}/${job.totalTracks || 0}): ${firstFailed}`
            : `Не удалось загрузить ни одного трека (${job.failedTracks}/${job.totalTracks || 0}).`;
        return;
    }
    job.status = 'done';
    if (job.failedTracks > 0) {
        job.error = `Завершено частично: ${job.completedTracks} успешно, ${job.failedTracks} с ошибкой.`;
    }
}
async function runYandexCli(job) {
    const ymdDir = getYmdDir();
    if (!fs.existsSync(ymdDir)) {
        throw new Error(`Каталог yandex-music-downloader не найден: ${ymdDir}`);
    }
    const token = yandexToken();
    if (!token) {
        throw new Error('YANDEX_MUSIC_TOKEN не задан в окружении сервера');
    }
    const py = await ensureYmdEnv(ymdDir);
    const downloadRoot = path.join(PATHS.temp, 'yandex-import', job.id);
    fs.mkdirSync(downloadRoot, { recursive: true });
    const args = [
        '-m', 'ymd',
        '--token', token,
        '--quality', '2',
        '--skip-existing',
        '--embed-cover',
        '--url', job.sourceUrl,
        '--dir', downloadRoot,
    ];
    job.status = 'downloading';
    await runCommand(py, args, ymdDir, { PYTHONPATH: ymdDir }, 30 * 60 * 1000);
    const files = collectAudioFiles(downloadRoot);
    if (files.length === 0) {
        throw new Error('Yandex downloader завершился без скачанных аудиофайлов');
    }
    return files;
}
async function runImport(job, genre) {
    try {
        const files = await runYandexCli(job);
        job.totalTracks = files.length;
        job.tracks = files.map((f) => ({
            sourceId: path.basename(f),
            title: path.parse(f).name,
            artist: 'Unknown',
            album: path.basename(path.dirname(f)),
            status: 'pending',
        }));
        for (let i = 0; i < files.length; i++) {
            const src = files[i];
            const t = job.tracks[i];
            try {
                t.status = 'processing';
                job.status = 'processing';
                job.progress = Math.round((i / files.length) * 100);
                const ext = path.extname(src).toLowerCase();
                const destFilename = `${uuid()}${ext}`;
                const destPath = path.join(PATHS.uploads, destFilename);
                fs.mkdirSync(PATHS.uploads, { recursive: true });
                fs.copyFileSync(src, destPath);
                const meta = await extractMetadata(destPath);
                const title = (meta.title || path.parse(src).name || 'Unknown').trim();
                const artist = normalizeArtistDisplay((meta.artist || 'Unknown').trim());
                const album = (meta.album || path.basename(path.dirname(src)) || null);
                const year = Number(meta.year) || new Date().getFullYear();
                const resolvedGenre = await resolveYandexGenre(meta.genre, genre, artist);
                const artistNames = parseArtistNames(artist || 'Unknown');
                const artistSlug = slugify(artistNames[0] || 'Unknown');
                const trackId = uuid();
                const existing = await findExistingTrackByArtistAndTitle(title, artist);
                if (existing) {
                    throw new Error(`Трек уже есть на платформе: ${existing.artist} — ${existing.title} (/track/${existing.id})`);
                }
                await execute(`
          INSERT INTO tracks (id, title, artist, artist_slug, genre, year, duration,
                             original_filename, original_format, original_size, original_bitrate,
                             original_sample_rate, original_channels, explicit, status, meta_album, meta_track_number)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16)
        `, [
                    trackId,
                    title,
                    artist,
                    artistSlug,
                    resolvedGenre,
                    year,
                    meta.duration,
                    path.basename(src),
                    meta.format,
                    fs.statSync(destPath).size,
                    meta.bitrate,
                    meta.sampleRate,
                    meta.channels,
                    false,
                    album,
                    meta.trackNumber || null,
                ]);
                // track_artists has FK to tracks, so link artists only after track row exists
                await ensureArtists(trackId, artist, resolvedGenre);
                const coverPath = findCoverNearAudio(src) || undefined;
                enqueueTrack(trackId, destPath, coverPath);
                t.title = title;
                t.artist = artist;
                t.album = album || '';
                t.status = 'done';
                t.gromkoTrackId = trackId;
                job.completedTracks++;
            }
            catch (err) {
                t.status = 'error';
                t.error = err.message;
                job.failedTracks++;
                console.error(`  ❌ Yandex import failed for "${src}": ${err.message}`);
            }
        }
        finalizeJob(job);
    }
    catch (err) {
        job.status = 'error';
        job.error = err.message;
        job.finishedAt = new Date().toISOString();
        throw err;
    }
}
async function runSubmission(job, userId, genre) {
    try {
        const files = await runYandexCli(job);
        job.totalTracks = files.length;
        job.tracks = files.map((f) => ({
            sourceId: path.basename(f),
            title: path.parse(f).name,
            artist: 'Unknown',
            album: path.basename(path.dirname(f)),
            status: 'pending',
        }));
        for (let i = 0; i < files.length; i++) {
            const src = files[i];
            const t = job.tracks[i];
            try {
                t.status = 'processing';
                job.status = 'processing';
                job.progress = Math.round((i / files.length) * 100);
                const ext = path.extname(src).toLowerCase();
                const destFilename = `${uuid()}${ext}`;
                const destPath = path.join(PATHS.uploads, destFilename);
                fs.mkdirSync(PATHS.uploads, { recursive: true });
                fs.copyFileSync(src, destPath);
                const meta = await extractMetadata(destPath);
                const title = (meta.title || path.parse(src).name || 'Unknown').trim();
                const artist = normalizeArtistDisplay((meta.artist || 'Unknown').trim());
                const album = (meta.album || path.basename(path.dirname(src)) || null);
                const year = Number(meta.year) || new Date().getFullYear();
                const resolvedGenre = await resolveYandexGenre(meta.genre, genre, artist);
                let coverPath = null;
                const srcCover = findCoverNearAudio(src);
                if (srcCover) {
                    const coverExt = path.extname(srcCover).toLowerCase();
                    const coverDest = path.join(PATHS.uploads, `${uuid()}${coverExt}`);
                    fs.copyFileSync(srcCover, coverDest);
                    coverPath = coverDest;
                }
                const existing = await findExistingTrackByArtistAndTitle(title, artist);
                if (existing) {
                    throw new Error(`Трек уже есть на платформе: ${existing.artist} — ${existing.title} (/track/${existing.id})`);
                }
                const subId = uuid();
                const importComment = buildYandexImportComment(job.sourceUrl, {
                    title,
                    artist,
                    album,
                    year,
                    genre: resolvedGenre,
                    format: meta.format,
                    bitrate: meta.bitrate,
                    sampleRate: meta.sampleRate,
                    channels: meta.channels,
                    duration: meta.duration,
                    trackNumber: meta.trackNumber || null,
                });
                await execute(`
          INSERT INTO submissions (id, user_id, release_id, title, artist, genre, year, comment, status, original_filename, file_path, cover_path, album_name)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, $12)
        `, [
                    subId,
                    userId,
                    job.id,
                    title,
                    artist,
                    resolvedGenre,
                    year,
                    importComment,
                    path.basename(src),
                    destPath,
                    coverPath,
                    album,
                ]);
                t.title = title;
                t.artist = artist;
                t.album = album || '';
                t.status = 'done';
                t.gromkoTrackId = subId;
                job.completedTracks++;
            }
            catch (err) {
                t.status = 'error';
                t.error = err.message;
                job.failedTracks++;
                console.error(`  ❌ Yandex submission failed for "${src}": ${err.message}`);
            }
        }
        finalizeJob(job);
    }
    catch (err) {
        job.status = 'error';
        job.error = err.message;
        job.finishedAt = new Date().toISOString();
        throw err;
    }
}
export function getYandexJob(id) {
    return jobs.get(id);
}
export async function checkYandexImportHealth() {
    try {
        const ymdDir = getYmdDir();
        if (!fs.existsSync(ymdDir))
            return { available: false, reason: 'Каталог yandex-music-downloader-main не найден' };
        if (!yandexToken())
            return { available: false, reason: 'Не задан YANDEX_MUSIC_TOKEN' };
        const py = await ensureYmdEnv(ymdDir);
        await runCommand(py, ['-m', 'ymd', '--help'], ymdDir, { PYTHONPATH: ymdDir }, 20_000);
        return { available: true };
    }
    catch (err) {
        return { available: false, reason: err.message };
    }
}
export function startYandexSubmission(sourceUrl, userId, isAdmin, genre = 'Другое') {
    const url = normalizeYandexUrl(sourceUrl);
    if (!isYandexMusicUrl(url)) {
        throw new Error('Только ссылки Yandex Music (music.yandex.ru)');
    }
    const job = {
        id: uuid(),
        sourceUrl: url,
        type: detectJobType(url),
        status: 'pending',
        progress: 0,
        totalTracks: 0,
        completedTracks: 0,
        failedTracks: 0,
        tracks: [],
        startedAt: new Date().toISOString(),
    };
    jobs.set(job.id, job);
    if (isAdmin) {
        runImport(job, genre).catch((err) => {
            job.status = 'error';
            job.error = err.message;
            job.finishedAt = new Date().toISOString();
        });
    }
    else {
        runSubmission(job, userId, genre).catch((err) => {
            job.status = 'error';
            job.error = err.message;
            job.finishedAt = new Date().toISOString();
        });
    }
    return job.id;
}
//# sourceMappingURL=yandex-import.js.map