/**
 * GROMKO Audio Processing Pipeline
 *
 * Полный пайплайн обработки аудио как у профессиональных стримингов:
 *
 * 1. Извлечение метаданных (bitrate, sample rate, duration, tags)
 * 2. Извлечение/обработка обложки из тегов или отдельного файла
 * 3. Нормализация громкости (EBU R128 / ReplayGain)
 * 4. Транскодирование в несколько качеств:
 *    - 64k AAC  (mobile / low bandwidth)
 *    - 128k AAC (standard streaming)
 *    - 256k AAC (high quality)
 *    - FLAC     (lossless — premium)
 * 5. Генерация HLS-плейлистов (master + per-quality) для адаптивного стриминга
 * 6. Генерация waveform peaks для визуализации
 * 7. Обновление БД со статусом и путями
 */
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { parseFile as parseAudioFile } from 'music-metadata';
import sharp from 'sharp';
import { execute, query } from './db.js';
import { CONFIG, PATHS, trackAudioDir, trackHlsDir } from './config.js';
import { S3_ENABLED, uploadToS3, uploadDirToS3, getS3Url } from './s3-storage.js';
const ENABLE_NORMALIZATION = process.env.AUDIO_NORMALIZE === 'true';
const TARGET_LUFS = Number(process.env.AUDIO_TARGET_LUFS || -14);
const TRUE_PEAK_DBTP = Number(process.env.AUDIO_TRUE_PEAK_DBTP || -1);
const FFMPEG_THREADS = Math.max(1, Number(process.env.AUDIO_FFMPEG_THREADS) || 1);
// ─── Set FFmpeg/FFprobe paths from npm packages (for environments without system ffmpeg) ───
try {
    // @ts-ignore
    const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
}
catch { /* system ffmpeg will be used */ }
try {
    // @ts-ignore
    const ffprobeInstaller = await import('@ffprobe-installer/ffprobe');
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
}
catch { /* system ffprobe will be used */ }
// ─────────────────────────────────────────────
// 1. Metadata Extraction
// ─────────────────────────────────────────────
export async function extractMetadata(filePath) {
    const metadata = await parseAudioFile(filePath);
    const { format, common } = metadata;
    let coverBuffer;
    let coverMime;
    if (common.picture && common.picture.length > 0) {
        coverBuffer = Buffer.from(common.picture[0].data);
        coverMime = common.picture[0].format;
    }
    return {
        duration: format.duration || 0,
        bitrate: Math.round((format.bitrate || 0) / 1000),
        sampleRate: format.sampleRate || 44100,
        channels: format.numberOfChannels || 2,
        format: (format.container || 'unknown').toLowerCase(),
        codec: (format.codec || 'unknown').toLowerCase(),
        lossless: format.lossless || false,
        title: common.title,
        artist: common.artist,
        album: common.album,
        year: common.year,
        trackNumber: common.track?.no || undefined,
        genre: common.genre?.[0],
        bpm: common.bpm,
        coverBuffer,
        coverMime,
    };
}
// ─────────────────────────────────────────────
// 2. Cover Art Processing
// ─────────────────────────────────────────────
/**
 * Fetch cover art from external APIs (iTunes / Deezer) when no embedded or local cover exists.
 * Returns a Buffer of the image, or undefined if not found.
 */
export async function fetchExternalCover(artist, title, album) {
    if (!artist && !title)
        return undefined;
    // Strategy: try several search queries in order of specificity
    const queries = [];
    if (artist && title)
        queries.push(`${artist} ${title}`);
    if (artist && album)
        queries.push(`${artist} ${album}`);
    if (artist)
        queries.push(artist);
    for (const q of queries) {
        // ── Try iTunes Search API (no auth required, excellent coverage) ──
        try {
            const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=5`;
            const res = await fetch(itunesUrl, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    // Find best match — prefer exact artist match
                    let bestResult = data.results[0];
                    if (artist) {
                        const artistLower = artist.toLowerCase().trim();
                        const exactMatch = data.results.find((r) => r.artistName?.toLowerCase().trim() === artistLower);
                        if (exactMatch)
                            bestResult = exactMatch;
                    }
                    // Get high-res artwork (replace 100x100 with 600x600)
                    let artworkUrl = bestResult.artworkUrl100 || bestResult.artworkUrl60;
                    if (artworkUrl) {
                        artworkUrl = artworkUrl.replace(/\d+x\d+(bb\.\w+)$/, '600x600$1');
                        const imgRes = await fetch(artworkUrl, { signal: AbortSignal.timeout(10000) });
                        if (imgRes.ok) {
                            const buf = Buffer.from(await imgRes.arrayBuffer());
                            if (buf.length > 1000) { // sanity check — not an error page
                                console.log(`    🎨 Cover found via iTunes: "${bestResult.trackName}" by ${bestResult.artistName}`);
                                return buf;
                            }
                        }
                    }
                }
            }
        }
        catch { /* iTunes failed — try next */ }
        // ── Try Deezer API (no auth required, good Russian music coverage) ──
        try {
            const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`;
            const res = await fetch(deezerUrl, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const data = await res.json();
                if (data.data && data.data.length > 0) {
                    let bestResult = data.data[0];
                    if (artist) {
                        const artistLower = artist.toLowerCase().trim();
                        const exactMatch = data.data.find((r) => r.artist?.name?.toLowerCase().trim() === artistLower);
                        if (exactMatch)
                            bestResult = exactMatch;
                    }
                    // Deezer provides album.cover_big (500x500) or cover_xl (1000x1000)
                    const coverUrl = bestResult.album?.cover_xl || bestResult.album?.cover_big || bestResult.album?.cover_medium;
                    if (coverUrl) {
                        const imgRes = await fetch(coverUrl, { signal: AbortSignal.timeout(10000) });
                        if (imgRes.ok) {
                            const buf = Buffer.from(await imgRes.arrayBuffer());
                            if (buf.length > 1000) {
                                console.log(`    🎨 Cover found via Deezer: "${bestResult.title}" by ${bestResult.artist?.name}`);
                                return buf;
                            }
                        }
                    }
                }
            }
        }
        catch { /* Deezer failed — try next query */ }
    }
    return undefined;
}
/** Genre mapping from iTunes/Deezer genres to our supported GENRES */
const EXTERNAL_GENRE_MAP = [
    [/hip[\s\-]*hop|хип[\s\-]*хоп/i, 'Хип-хоп'],
    [/^rap$|рэп|рап/i, 'Рэп'],
    [/^trap$|трэп/i, 'Trap'],
    [/r\s*[&n]\s*b|rhythm.*blues|soul|рнб/i, 'R&B'],
    [/drill|дрилл/i, 'Drill'],
    [/phonk|фонк/i, 'Phonk'],
    [/pop|поп/i, 'Pop'],
    [/rock|рок|punk|metal|grunge|alternative/i, 'Rock'],
    [/electro|edm|techno|house|trance|dubstep|drum.*bass|dnb|ambient|synth|idm|bass.*music|future|электрон/i, 'Electronic'],
];
function mapExternalGenre(raw) {
    if (!raw)
        return undefined;
    const t = raw.trim();
    // Direct match to our genres
    const GENRES_SET = new Set(['Хип-хоп', 'Рэп', 'Trap', 'R&B', 'Drill', 'Phonk', 'Pop', 'Rock', 'Electronic', 'Другое']);
    if (GENRES_SET.has(t))
        return t;
    for (const [re, genre] of EXTERNAL_GENRE_MAP) {
        if (re.test(t))
            return genre;
    }
    return undefined;
}
/**
 * Fetch metadata from external APIs (iTunes + Deezer) for a given track.
 * Returns enriched metadata or undefined if nothing found.
 */
export async function fetchExternalMetadata(artist, title, album) {
    if (!artist && !title)
        return undefined;
    const queries = [];
    if (artist && title)
        queries.push(`${artist} ${title}`);
    if (artist && album)
        queries.push(`${artist} ${album}`);
    if (artist)
        queries.push(artist);
    let itunesResult = null;
    let deezerResult = null;
    // ── Try iTunes Search API ──
    for (const q of queries) {
        if (itunesResult)
            break;
        try {
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=10`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    // Find best match: prefer exact artist + title match
                    if (artist && title) {
                        const aLower = artist.toLowerCase().trim();
                        const tLower = title.toLowerCase().trim();
                        const exact = data.results.find((r) => r.artistName?.toLowerCase().trim() === aLower &&
                            r.trackName?.toLowerCase().trim() === tLower);
                        if (exact) {
                            itunesResult = exact;
                            break;
                        }
                        // Try just artist match
                        const artistMatch = data.results.find((r) => r.artistName?.toLowerCase().trim() === aLower);
                        if (artistMatch) {
                            itunesResult = artistMatch;
                            break;
                        }
                    }
                    itunesResult = data.results[0];
                }
            }
        }
        catch { /* continue */ }
    }
    // ── Try Deezer API ──
    for (const q of queries) {
        if (deezerResult)
            break;
        try {
            const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const data = await res.json();
                if (data.data && data.data.length > 0) {
                    if (artist && title) {
                        const aLower = artist.toLowerCase().trim();
                        const tLower = title.toLowerCase().trim();
                        const exact = data.data.find((r) => r.artist?.name?.toLowerCase().trim() === aLower &&
                            r.title?.toLowerCase().trim() === tLower);
                        if (exact) {
                            deezerResult = exact;
                            break;
                        }
                        const artistMatch = data.data.find((r) => r.artist?.name?.toLowerCase().trim() === aLower);
                        if (artistMatch) {
                            deezerResult = artistMatch;
                            break;
                        }
                    }
                    deezerResult = data.data[0];
                }
            }
        }
        catch { /* continue */ }
    }
    if (!itunesResult && !deezerResult)
        return undefined;
    // Merge results: iTunes is better for genre/explicit/label/year, Deezer for BPM/ISRC
    const meta = { source: itunesResult ? 'itunes' : 'deezer' };
    // ── Genre ──
    if (itunesResult?.primaryGenreName) {
        meta.genre = mapExternalGenre(itunesResult.primaryGenreName) || undefined;
    }
    if (!meta.genre && deezerResult) {
        // Deezer: need to fetch track details for genre info
        // For now, genre from album data or artist
    }
    // ── Explicit ──
    if (itunesResult) {
        // iTunes: trackExplicitness = "explicit" | "notExplicit" | "cleaned"
        meta.explicit = itunesResult.trackExplicitness === 'explicit' ||
            itunesResult.collectionExplicitness === 'explicit';
    }
    if (meta.explicit === undefined && deezerResult) {
        meta.explicit = deezerResult.explicit_lyrics === true;
    }
    // ── Year & Release Date ──
    if (itunesResult?.releaseDate) {
        // iTunes releaseDate: "2023-03-15T12:00:00Z"
        const d = new Date(itunesResult.releaseDate);
        if (!isNaN(d.getTime())) {
            meta.year = d.getFullYear();
            meta.releaseDate = d.toISOString().slice(0, 10); // "2023-03-15"
        }
    }
    // ── Album ──
    if (itunesResult?.collectionName) {
        meta.album = itunesResult.collectionName;
    }
    else if (deezerResult?.album?.title) {
        meta.album = deezerResult.album.title;
    }
    // ── Label ──
    // iTunes doesn't return label in search, but does in lookup
    // We can try lookup if we have a trackId from iTunes
    if (itunesResult?.trackId) {
        try {
            const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesResult.trackId}`;
            const lookupRes = await fetch(lookupUrl, { signal: AbortSignal.timeout(5000) });
            if (lookupRes.ok) {
                const lookupData = await lookupRes.json();
                const r = lookupData.results?.[0];
                if (r?.copyright) {
                    // Extract label from copyright: "℗ 2023 Label Name" → "Label Name"
                    const labelMatch = r.copyright.match(/(?:℗|©|\(P\))\s*\d{4}\s+(.+)/);
                    if (labelMatch)
                        meta.label = labelMatch[1].trim();
                    else
                        meta.label = r.copyright;
                }
            }
        }
        catch { /* no label */ }
    }
    // ── Deezer: BPM + ISRC ──
    if (deezerResult?.id) {
        try {
            const trackUrl = `https://api.deezer.com/track/${deezerResult.id}`;
            const dRes = await fetch(trackUrl, { signal: AbortSignal.timeout(5000) });
            if (dRes.ok) {
                const detail = await dRes.json();
                if (detail.bpm && detail.bpm > 0)
                    meta.bpm = Math.round(detail.bpm);
                if (detail.isrc)
                    meta.isrc = detail.isrc;
                // If no genre yet, try Deezer genre from album
                if (!meta.genre && detail.album?.genre_id) {
                    // Map Deezer genre IDs
                    const deezerGenreMap = {
                        116: 'Рэп', // Rap/Hip Hop
                        152: 'Рэп', // Rap
                        85: 'Pop',
                        132: 'Pop',
                        106: 'Electronic',
                        113: 'Rock',
                        165: 'R&B',
                        169: 'R&B', // Soul & Funk
                    };
                    meta.genre = deezerGenreMap[detail.album.genre_id] || undefined;
                }
                // Also check explicit from Deezer if not yet set
                if (meta.explicit === undefined) {
                    meta.explicit = detail.explicit_lyrics === true;
                }
            }
        }
        catch { /* no Deezer details */ }
    }
    // Only return if we have at least something useful
    const hasUseful = meta.genre || meta.explicit !== undefined || meta.year ||
        meta.bpm || meta.album || meta.label || meta.isrc || meta.releaseDate;
    return hasUseful ? meta : undefined;
}
/**
 * Fix metadata for an existing track — fetches from external APIs and updates DB.
 * Returns the updated fields or null if nothing found.
 */
export async function fixTrackMetadata(trackId, artist, title, currentGenre, currentExplicit, currentYear, currentAlbum, currentBpm) {
    const extMeta = await fetchExternalMetadata(artist, title, currentAlbum);
    if (!extMeta)
        return null;
    const updates = [];
    const params = [];
    let idx = 1;
    const changed = {};
    // Genre: only update if current is "Другое" (the default placeholder)
    if (extMeta.genre && (!currentGenre || currentGenre === 'Другое')) {
        updates.push(`genre = $${idx++}`);
        params.push(extMeta.genre);
        changed.genre = extMeta.genre;
    }
    // Explicit: only update if currently false (default)
    if (extMeta.explicit === true && !currentExplicit) {
        updates.push(`explicit = $${idx++}`);
        params.push(true);
        changed.explicit = true;
    }
    // Year: only update if current is this year or next year (likely a default)
    const thisYear = new Date().getFullYear();
    if (extMeta.year && (!currentYear || currentYear >= thisYear - 1)) {
        // Only update if the API year differs significantly
        if (extMeta.year !== currentYear) {
            updates.push(`year = $${idx++}`);
            params.push(extMeta.year);
            changed.year = extMeta.year;
        }
    }
    // Album: only update if empty
    if (extMeta.album && !currentAlbum) {
        updates.push(`meta_album = $${idx++}`);
        params.push(extMeta.album);
        changed.album = extMeta.album;
    }
    // BPM: only update if empty
    if (extMeta.bpm && !currentBpm) {
        updates.push(`meta_bpm = $${idx++}`);
        params.push(extMeta.bpm);
        changed.bpm = extMeta.bpm;
    }
    // Release date: always update if available and column exists
    if (extMeta.releaseDate) {
        updates.push(`release_date = $${idx++}`);
        params.push(extMeta.releaseDate);
        changed.releaseDate = extMeta.releaseDate;
    }
    // Label
    if (extMeta.label) {
        updates.push(`meta_label = $${idx++}`);
        params.push(extMeta.label);
        changed.label = extMeta.label;
    }
    // ISRC
    if (extMeta.isrc) {
        updates.push(`meta_isrc = $${idx++}`);
        params.push(extMeta.isrc);
        changed.isrc = extMeta.isrc;
    }
    if (updates.length === 0)
        return null;
    updates.push(`updated_at = NOW()`);
    params.push(trackId);
    await execute(`UPDATE tracks SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    return changed;
}
export async function processCoverArt(trackId, coverBuffer, externalCoverPath, artist, title, album) {
    const coverDir = path.join(PATHS.covers, trackId);
    fs.mkdirSync(coverDir, { recursive: true });
    let sourceBuffer;
    if (coverBuffer && coverBuffer.length > 0) {
        sourceBuffer = coverBuffer;
    }
    else if (externalCoverPath && fs.existsSync(externalCoverPath)) {
        sourceBuffer = fs.readFileSync(externalCoverPath);
    }
    else {
        // Try fetching from external APIs (iTunes, Deezer)
        const externalBuffer = await fetchExternalCover(artist, title, album);
        if (externalBuffer) {
            sourceBuffer = externalBuffer;
        }
        else {
            // Generate a placeholder gradient cover
            sourceBuffer = await sharp({
                create: {
                    width: 600,
                    height: 600,
                    channels: 4,
                    background: { r: 239, g: 68, b: 68, alpha: 1 }, // red-500
                },
            })
                .png()
                .toBuffer();
        }
    }
    const paths = {};
    for (const size of CONFIG.coverSizes) {
        const filename = `${size.name}.webp`;
        const outputPath = path.join(coverDir, filename);
        await sharp(sourceBuffer)
            .resize(size.width, size.height, { fit: 'cover' })
            .webp({ quality: 85 })
            .toFile(outputPath);
        paths[size.name] = `/covers/${trackId}/${filename}`;
    }
    // Also save original as JPEG for fallback
    const originalPath = path.join(coverDir, 'original.jpg');
    await sharp(sourceBuffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toFile(originalPath);
    paths['original'] = `/covers/${trackId}/original.jpg`;
    return paths;
}
/**
 * Fix cover art for an existing track — fetches from external APIs and updates DB + S3.
 * Returns the new cover_path or null if no cover found.
 */
export async function fixTrackCover(trackId, artist, title, album) {
    const coverBuffer = await fetchExternalCover(artist, title, album || undefined);
    if (!coverBuffer)
        return null;
    // Process cover into all sizes
    const coverPaths = await processCoverArt(trackId, coverBuffer);
    // Upload to S3 if enabled
    let finalCoverPath = coverPaths['medium'] || coverPaths['original'] || Object.values(coverPaths)[0];
    if (S3_ENABLED) {
        const coverDir = path.join(PATHS.covers, trackId);
        if (fs.existsSync(coverDir)) {
            const coverFiles = fs.readdirSync(coverDir);
            for (const cf of coverFiles) {
                const cfPath = path.join(coverDir, cf);
                const s3Url = await uploadToS3(cfPath, `covers/${trackId}/${cf}`);
                const name = path.parse(cf).name;
                coverPaths[name] = s3Url;
            }
            finalCoverPath = coverPaths['medium'] || coverPaths['original'] || Object.values(coverPaths)[0];
            // Cleanup local files after S3 upload
            try {
                fs.rmSync(coverDir, { recursive: true, force: true });
            }
            catch { /* ignore */ }
        }
    }
    // Update DB
    await execute(`UPDATE tracks SET cover_path = $1 WHERE id = $2`, [finalCoverPath, trackId]);
    return finalCoverPath;
}
function applyFfmpegLimits(command) {
    return command.outputOptions(['-threads', String(FFMPEG_THREADS)]);
}
// ─────────────────────────────────────────────
// 3. Audio Loudness Analysis (EBU R128)
// ─────────────────────────────────────────────
function analyzeLoudness(inputPath) {
    return new Promise((resolve, reject) => {
        let loudnessData = '';
        applyFfmpegLimits(ffmpeg(inputPath))
            .noVideo()
            .audioFilters('ebur128=peak=true')
            .format('null')
            .output('/dev/null')
            .on('stderr', (line) => {
            loudnessData += line + '\n';
        })
            .on('end', () => {
            // Parse the SUMMARY block from ebur128 output
            // The summary appears at the end: "Summary:" section with "I:  -X.X LUFS"
            const summaryMatch = loudnessData.match(/Summary:[\s\S]*?I:\s+(-?\d+\.?\d*)\s+LUFS/);
            if (summaryMatch) {
                const lufs = parseFloat(summaryMatch[1]);
                // Sanity check: real music is between -5 and -30 LUFS
                if (lufs > -50 && lufs < 0) {
                    resolve(lufs);
                    return;
                }
            }
            // If we can't get a reasonable reading, skip normalization (0 dB gain)
            console.warn('Loudness analysis returned unusual value, skipping normalization');
            resolve(-14); // target = -14, so gain = 0 dB
        })
            .on('error', (err) => {
            console.warn('Loudness analysis failed, using default:', err.message);
            resolve(-14); // fallback: 0 dB gain
        })
            .run();
    });
}
// ─────────────────────────────────────────────
// 4. Transcoding to Multiple Qualities
// ─────────────────────────────────────────────
function transcodeToQuality(inputPath, outputPath, quality, loudnessLufs) {
    return new Promise((resolve, reject) => {
        // Apply only attenuation (never boost) to avoid clipping artifacts.
        const gainDb = TARGET_LUFS - loudnessLufs;
        const safeGainDb = Math.max(-6, Math.min(0, gainDb));
        const truePeakLinear = Math.pow(10, TRUE_PEAK_DBTP / 20);
        const cmd = applyFfmpegLimits(ffmpeg(inputPath))
            .noVideo(); // CRITICAL: skip embedded cover art video stream
        if (quality.codec === 'flac') {
            const flacCmd = cmd
                .audioCodec('flac')
                .audioFrequency(quality.sampleRate)
                .audioChannels(quality.channels);
            if (ENABLE_NORMALIZATION) {
                const filters = [`alimiter=limit=${truePeakLinear.toFixed(6)}`];
                if (safeGainDb !== 0)
                    filters.unshift(`volume=${safeGainDb}dB`);
                flacCmd.audioFilters(filters.join(','));
            }
            flacCmd
                .format('flac')
                .output(outputPath);
        }
        else {
            const aacCmd = cmd
                .audioCodec('aac')
                .audioBitrate(quality.bitrate)
                .audioFrequency(quality.sampleRate)
                .audioChannels(quality.channels)
                .format('mp4')
                .outputOptions([
                '-movflags', '+faststart',
                '-profile:a', 'aac_low',
                '-aac_coder', 'twoloop',
                '-cutoff', '20000',
            ]); // web-optimized + higher-quality AAC settings
            if (ENABLE_NORMALIZATION) {
                const filters = [`alimiter=limit=${truePeakLinear.toFixed(6)}`];
                if (safeGainDb !== 0)
                    filters.unshift(`volume=${safeGainDb}dB`);
                aacCmd.audioFilters(filters.join(','));
            }
            aacCmd
                .output(outputPath);
        }
        cmd
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
    });
}
// ─────────────────────────────────────────────
// 5. HLS Playlist Generation (Adaptive Bitrate)
// ─────────────────────────────────────────────
function generateHlsStream(inputPath, outputDir, qualityKey, quality) {
    return new Promise((resolve, reject) => {
        const playlistName = `${qualityKey}.m3u8`;
        const segmentPattern = path.join(outputDir, `${qualityKey}_%03d.ts`);
        const playlistPath = path.join(outputDir, playlistName);
        fs.mkdirSync(outputDir, { recursive: true });
        const cmd = applyFfmpegLimits(ffmpeg(inputPath))
            .noVideo(); // CRITICAL: skip embedded cover art video stream
        if (quality.codec === 'flac') {
            // For lossless, use FLAC in fMP4 segments (HLS supports this)
            cmd
                .audioCodec('flac')
                .audioFrequency(quality.sampleRate)
                .audioChannels(quality.channels);
        }
        else {
            cmd
                .audioCodec('aac')
                .audioBitrate(quality.bitrate)
                .audioFrequency(quality.sampleRate)
                .audioChannels(quality.channels);
        }
        cmd
            .format('hls')
            .outputOptions([
            `-hls_time`, `${CONFIG.hlsSegmentDuration}`,
            `-hls_list_size`, `0`, // keep all segments
            `-hls_segment_type`, `mpegts`,
            `-hls_segment_filename`, segmentPattern,
            `-hls_playlist_type`, `vod`,
        ])
            .output(playlistPath)
            .on('end', () => resolve(playlistName))
            .on('error', (err) => reject(err))
            .run();
    });
}
function generateMasterPlaylist(hlsDir, qualities) {
    const masterPath = path.join(hlsDir, 'master.m3u8');
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    for (const q of qualities) {
        content += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},CODECS="mp4a.40.2"\n`;
        content += `${q.playlist}\n\n`;
    }
    fs.writeFileSync(masterPath, content, 'utf-8');
    return 'master.m3u8';
}
// ─────────────────────────────────────────────
// 5b. HLS from already-transcoded files (copy codec, no re-encode)
// ─────────────────────────────────────────────
function generateHlsFromTranscoded(inputPath, outputDir, qualityKey) {
    return new Promise((resolve, reject) => {
        const playlistName = `${qualityKey}.m3u8`;
        const segmentPattern = path.join(outputDir, `${qualityKey}_%03d.ts`);
        const playlistPath = path.join(outputDir, playlistName);
        fs.mkdirSync(outputDir, { recursive: true });
        applyFfmpegLimits(ffmpeg(inputPath))
            .audioCodec('copy') // No re-encoding — just segment the already-transcoded file
            .noVideo()
            .format('hls')
            .outputOptions([
            `-hls_time`, `${CONFIG.hlsSegmentDuration}`,
            `-hls_list_size`, `0`,
            `-hls_segment_type`, `mpegts`,
            `-hls_segment_filename`, segmentPattern,
            `-hls_playlist_type`, `vod`,
        ])
            .output(playlistPath)
            .on('end', () => resolve(playlistName))
            .on('error', (err) => reject(err))
            .run();
    });
}
// ─────────────────────────────────────────────
// 6. Waveform Peak Generation
// ─────────────────────────────────────────────
function generateWaveformPeaks(inputPath, numPeaks) {
    return new Promise((resolve, reject) => {
        const rawPath = inputPath + '.raw';
        // Convert to raw PCM, mono, low sample rate for fast processing
        applyFfmpegLimits(ffmpeg(inputPath))
            .noVideo()
            .audioCodec('pcm_s16le')
            .audioChannels(1)
            .audioFrequency(8000)
            .format('s16le')
            .output(rawPath)
            .on('end', () => {
            try {
                const rawBuffer = fs.readFileSync(rawPath);
                const samples = new Int16Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.length / 2);
                const peaks = [];
                const samplesPerPeak = Math.max(1, Math.floor(samples.length / numPeaks));
                for (let i = 0; i < numPeaks; i++) {
                    const start = i * samplesPerPeak;
                    const end = Math.min(start + samplesPerPeak, samples.length);
                    let maxAbs = 0;
                    for (let j = start; j < end; j++) {
                        const abs = Math.abs(samples[j]);
                        if (abs > maxAbs)
                            maxAbs = abs;
                    }
                    // Normalize to 0-1
                    peaks.push(Math.round((maxAbs / 32768) * 1000) / 1000);
                }
                // Cleanup temp raw file
                fs.unlinkSync(rawPath);
                resolve(peaks);
            }
            catch (err) {
                if (fs.existsSync(rawPath))
                    fs.unlinkSync(rawPath);
                reject(err);
            }
        })
            .on('error', (err) => {
            if (fs.existsSync(rawPath))
                fs.unlinkSync(rawPath);
            reject(err);
        })
            .run();
    });
}
// ─────────────────────────────────────────────
// 7. Full Processing Pipeline
// ─────────────────────────────────────────────
export async function processTrack(trackId, inputPath, coverPath, keepOriginal) {
    const audioDir = trackAudioDir(trackId);
    const hlsDir = trackHlsDir(trackId);
    fs.mkdirSync(audioDir, { recursive: true });
    fs.mkdirSync(hlsDir, { recursive: true });
    // Update status to 'processing'
    await execute(`
    UPDATE tracks SET status = 'processing', processing_started_at = NOW()
    WHERE id = $1
  `, [trackId]);
    try {
        // ── Step 1: Extract metadata ──
        console.log(`[${trackId}] Extracting metadata...`);
        const meta = await extractMetadata(inputPath);
        // ── Step 2: Process cover art ──
        // Fetch track info from DB for external cover search (artist/title/album)
        console.log(`[${trackId}] Processing cover art...`);
        const trackRow = await query('SELECT title, artist, meta_album FROM tracks WHERE id = $1', [trackId]);
        const dbArtist = trackRow[0]?.artist || meta.artist;
        const dbTitle = trackRow[0]?.title || meta.title;
        const dbAlbum = trackRow[0]?.meta_album || meta.album;
        const coverPaths = await processCoverArt(trackId, meta.coverBuffer, coverPath, dbArtist, dbTitle, dbAlbum);
        // ── Step 3: Analyze loudness ──
        let loudness = -14;
        if (ENABLE_NORMALIZATION) {
            console.log(`[${trackId}] Analyzing loudness (EBU R128)...`);
            loudness = await analyzeLoudness(inputPath);
            console.log(`[${trackId}] Integrated loudness: ${loudness.toFixed(1)} LUFS (target ${TARGET_LUFS} LUFS, TP ${TRUE_PEAK_DBTP} dBTP)`);
        }
        else {
            console.log(`[${trackId}] Loudness normalization disabled (AUDIO_NORMALIZE=false)`);
        }
        // ── Step 4: Transcode to multiple qualities ──
        // Smart quality selection based on source bitrate to avoid pointless upsampling
        console.log(`[${trackId}] Transcoding (source: ${meta.bitrate}kbps ${meta.format})...`);
        const streams = {};
        // Low quality (64k AAC) — always generate
        const lowPath = path.join(audioDir, 'low.m4a');
        await transcodeToQuality(inputPath, lowPath, CONFIG.qualities.low, loudness);
        streams.low = `/audio/${trackId}/low.m4a`;
        // Medium quality (128k AAC) — always generate
        const mediumPath = path.join(audioDir, 'medium.m4a');
        await transcodeToQuality(inputPath, mediumPath, CONFIG.qualities.medium, loudness);
        streams.medium = `/audio/${trackId}/medium.m4a`;
        // High quality (256k AAC) — only if source bitrate > 160kbps
        // No point upsampling 128kbps MP3 to 256k AAC
        if (meta.bitrate > 160 || meta.lossless) {
            const highPath = path.join(audioDir, 'high.m4a');
            await transcodeToQuality(inputPath, highPath, CONFIG.qualities.high, loudness);
            streams.high = `/audio/${trackId}/high.m4a`;
        }
        else {
            // Use medium as "high" fallback
            streams.high = streams.medium;
        }
        // Lossless (FLAC) — only if source is actually lossless (WAV/FLAC/AIFF)
        // No point transcoding lossy MP3 → FLAC (would be fake lossless)
        if (meta.lossless || ['wav', 'aiff', 'flac'].includes(meta.format)) {
            const losslessPath = path.join(audioDir, 'lossless.flac');
            await transcodeToQuality(inputPath, losslessPath, CONFIG.qualities.lossless, loudness);
            streams.lossless = `/audio/${trackId}/lossless.flac`;
        }
        // ── Step 5: Generate HLS streams (from already-transcoded files, NOT from source) ──
        console.log(`[${trackId}] Generating HLS streams...`);
        const hlsQualities = [];
        // Use the transcoded m4a files as input to avoid re-encoding
        const lowHls = await generateHlsFromTranscoded(lowPath, hlsDir, 'low');
        hlsQualities.push({ key: 'low', playlist: lowHls, bandwidth: 64000 });
        const medHls = await generateHlsFromTranscoded(mediumPath, hlsDir, 'medium');
        hlsQualities.push({ key: 'medium', playlist: medHls, bandwidth: 128000 });
        if (streams.high !== streams.medium) {
            const highSrc = path.join(audioDir, 'high.m4a');
            const highHls = await generateHlsFromTranscoded(highSrc, hlsDir, 'high');
            hlsQualities.push({ key: 'high', playlist: highHls, bandwidth: 256000 });
        }
        const masterPlaylist = generateMasterPlaylist(hlsDir, hlsQualities);
        // ── Step 6: Generate waveform ──
        console.log(`[${trackId}] Generating waveform peaks...`);
        const waveformPeaks = await generateWaveformPeaks(inputPath, CONFIG.waveformPeaks);
        // Save waveform JSON locally (will be uploaded to S3 below)
        const waveformPath = path.join(PATHS.waveforms, `${trackId}.json`);
        fs.writeFileSync(waveformPath, JSON.stringify(waveformPeaks));
        // ── Step 6.5: Upload to S3 if enabled ──
        if (S3_ENABLED) {
            console.log(`[${trackId}] Uploading to S3...`);
            // Upload audio streams
            if (fs.existsSync(lowPath)) {
                streams.low = await uploadToS3(lowPath, `audio/${trackId}/low.m4a`);
            }
            if (fs.existsSync(mediumPath)) {
                streams.medium = await uploadToS3(mediumPath, `audio/${trackId}/medium.m4a`);
            }
            if (streams.high !== streams.medium) {
                const hp = path.join(audioDir, 'high.m4a');
                if (fs.existsSync(hp)) {
                    streams.high = await uploadToS3(hp, `audio/${trackId}/high.m4a`);
                }
            }
            else {
                streams.high = streams.medium; // same S3 URL
            }
            if (streams.lossless) {
                const lp = path.join(audioDir, 'lossless.flac');
                if (fs.existsSync(lp)) {
                    streams.lossless = await uploadToS3(lp, `audio/${trackId}/lossless.flac`);
                }
            }
            // Upload HLS directory
            await uploadDirToS3(hlsDir, `audio/${trackId}/hls`);
            // Upload cover images
            const coverDir = path.join(PATHS.covers, trackId);
            if (fs.existsSync(coverDir)) {
                const coverFiles = fs.readdirSync(coverDir);
                for (const cf of coverFiles) {
                    const cfPath = path.join(coverDir, cf);
                    const s3Url = await uploadToS3(cfPath, `covers/${trackId}/${cf}`);
                    // Update coverPaths with S3 URLs
                    const name = path.parse(cf).name; // "thumb", "small", "medium", "large", "original"
                    coverPaths[name] = s3Url;
                }
            }
            // Upload waveform JSON
            await uploadToS3(waveformPath, `waveforms/${trackId}.json`);
            // Build HLS master URL (S3)
            const hlsMasterUrl = getS3Url(`audio/${trackId}/hls/${masterPlaylist}`);
            // ── Cleanup local files after S3 upload ──
            console.log(`[${trackId}] Cleaning up local files...`);
            try {
                fs.rmSync(audioDir, { recursive: true, force: true });
                fs.rmSync(path.join(PATHS.covers, trackId), { recursive: true, force: true });
                fs.unlinkSync(waveformPath);
            }
            catch { /* ignore cleanup errors */ }
            // ── Step 7: Update database with S3 URLs ──
            console.log(`[${trackId}] Updating database (S3 URLs)...`);
            await execute(`
        UPDATE tracks SET
          status = 'ready',
          duration = $1,
          original_format = $2,
          original_bitrate = $3,
          original_sample_rate = $4,
          original_channels = $5,
          cover_path = $6,
          hls_master = $7,
          stream_low = $8,
          stream_medium = $9,
          stream_high = $10,
          stream_lossless = $11,
          waveform_peaks = $12,
          meta_album = $13,
          meta_track_number = $14,
          meta_bpm = $15,
          meta_loudness_lufs = $16,
          processing_finished_at = NOW(),
          updated_at = NOW()
        WHERE id = $17
      `, [
                meta.duration,
                meta.format,
                meta.bitrate,
                meta.sampleRate,
                meta.channels,
                coverPaths.medium || coverPaths.original,
                hlsMasterUrl,
                streams.low,
                streams.medium,
                streams.high,
                streams.lossless || null,
                JSON.stringify(waveformPeaks),
                meta.album || null,
                meta.trackNumber || null,
                meta.bpm || null,
                loudness,
                trackId
            ]);
        }
        else {
            // ── Step 7: Update database with local paths (no S3) ──
            console.log(`[${trackId}] Updating database (local paths)...`);
            await execute(`
        UPDATE tracks SET
          status = 'ready',
          duration = $1,
          original_format = $2,
          original_bitrate = $3,
          original_sample_rate = $4,
          original_channels = $5,
          cover_path = $6,
          hls_master = $7,
          stream_low = $8,
          stream_medium = $9,
          stream_high = $10,
          stream_lossless = $11,
          waveform_peaks = $12,
          meta_album = $13,
          meta_track_number = $14,
          meta_bpm = $15,
          meta_loudness_lufs = $16,
          processing_finished_at = NOW(),
          updated_at = NOW()
        WHERE id = $17
      `, [
                meta.duration,
                meta.format,
                meta.bitrate,
                meta.sampleRate,
                meta.channels,
                coverPaths.medium || coverPaths.original,
                `/audio/${trackId}/hls/${masterPlaylist}`,
                streams.low,
                streams.medium,
                streams.high,
                streams.lossless || null,
                JSON.stringify(waveformPeaks),
                meta.album || null,
                meta.trackNumber || null,
                meta.bpm || null,
                loudness,
                trackId
            ]);
        }
        // Cleanup original upload after successful processing (unless keepOriginal)
        if (!keepOriginal && fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
        }
        console.log(`[${trackId}] ✅ Processing complete!`);
        return {
            trackId,
            duration: meta.duration,
            streams: {
                low: streams.low,
                medium: streams.medium,
                high: streams.high,
                lossless: streams.lossless,
            },
            hlsMaster: `/audio/${trackId}/hls/${masterPlaylist}`,
            waveformPeaks,
            coverPaths,
            meta,
        };
    }
    catch (error) {
        console.error(`[${trackId}] ❌ Processing failed:`, error);
        await execute(`
      UPDATE tracks SET
        status = 'error',
        processing_error = $1,
        processing_finished_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
    `, [error.message || 'Unknown error', trackId]);
        throw error;
    }
}
// ─────────────────────────────────────────────
// Queue-based processing (parallel workers)
// ─────────────────────────────────────────────
import os from 'os';
const processingQueue = [];
let activeWorkers = 0;
/** Max concurrent FFmpeg processes — leave 1 core free for the server */
const MAX_WORKERS = Math.max(1, Math.min(Number(process.env.AUDIO_PROCESS_WORKERS) || 1, Math.max(1, os.cpus().length - 1), 4));
export function enqueueTrack(trackId, inputPath, coverPath, keepOriginal) {
    processingQueue.push({ trackId, inputPath, coverPath, keepOriginal });
    drainQueue();
}
export function getQueueStatus() {
    return {
        queued: processingQueue.length,
        active: activeWorkers,
        maxWorkers: MAX_WORKERS,
    };
}
function drainQueue() {
    while (activeWorkers < MAX_WORKERS && processingQueue.length > 0) {
        const job = processingQueue.shift();
        activeWorkers++;
        processTrack(job.trackId, job.inputPath, job.coverPath, job.keepOriginal)
            .catch((err) => console.error(`[${job.trackId}] Processing queue error:`, err))
            .finally(() => {
            activeWorkers--;
            drainQueue();
        });
    }
}
//# sourceMappingURL=audio-processor.js.map