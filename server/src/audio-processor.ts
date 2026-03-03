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
import { v4 as uuid } from 'uuid';
import { parseFile as parseAudioFile } from 'music-metadata';
import sharp from 'sharp';
import { execute, query } from './db.js';
import { CONFIG, PATHS, trackAudioDir, trackHlsDir } from './config.js';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AudioMeta {
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  format: string;
  codec: string;
  lossless: boolean;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNumber?: number;
  genre?: string;
  bpm?: number;
  coverBuffer?: Buffer;
  coverMime?: string;
}

export interface ProcessingResult {
  trackId: string;
  duration: number;
  streams: {
    low: string;
    medium: string;
    high: string;
    lossless?: string;
  };
  hlsMaster: string;
  waveformPeaks: number[];
  coverPaths: Record<string, string>;
  meta: AudioMeta;
}

// ─────────────────────────────────────────────
// 1. Metadata Extraction
// ─────────────────────────────────────────────

export async function extractMetadata(filePath: string): Promise<AudioMeta> {
  const metadata = await parseAudioFile(filePath);
  const { format, common } = metadata;

  let coverBuffer: Buffer | undefined;
  let coverMime: string | undefined;
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

export async function processCoverArt(
  trackId: string,
  coverBuffer?: Buffer,
  externalCoverPath?: string
): Promise<Record<string, string>> {
  const coverDir = path.join(PATHS.covers, trackId);
  fs.mkdirSync(coverDir, { recursive: true });

  let sourceBuffer: Buffer;

  if (coverBuffer && coverBuffer.length > 0) {
    sourceBuffer = coverBuffer;
  } else if (externalCoverPath && fs.existsSync(externalCoverPath)) {
    sourceBuffer = fs.readFileSync(externalCoverPath);
  } else {
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

  const paths: Record<string, string> = {};

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

// ─────────────────────────────────────────────
// 3. Audio Loudness Analysis (EBU R128)
// ─────────────────────────────────────────────

function analyzeLoudness(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let loudnessData = '';
    ffmpeg(inputPath)
      .audioFilters('ebur128=peak=true')
      .format('null')
      .output('/dev/null')
      .on('stderr', (line: string) => {
        loudnessData += line + '\n';
      })
      .on('end', () => {
        // Parse integrated loudness from FFmpeg output
        const match = loudnessData.match(/I:\s+(-?\d+\.?\d*)\s+LUFS/);
        const lufs = match ? parseFloat(match[1]) : -14;
        resolve(lufs);
      })
      .on('error', (err: Error) => {
        console.warn('Loudness analysis failed, using default:', err.message);
        resolve(-14); // fallback
      })
      .run();
  });
}

// ─────────────────────────────────────────────
// 4. Transcoding to Multiple Qualities
// ─────────────────────────────────────────────

function transcodeToQuality(
  inputPath: string,
  outputPath: string,
  quality: typeof CONFIG.qualities[keyof typeof CONFIG.qualities],
  loudnessLufs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Calculate gain adjustment to target -14 LUFS (Spotify standard)
    const targetLufs = -14;
    const gainDb = targetLufs - loudnessLufs;
    const clampedGain = Math.max(-10, Math.min(10, gainDb));

    const cmd = ffmpeg(inputPath);

    if (quality.codec === 'flac') {
      cmd
        .audioCodec('flac')
        .audioFrequency(quality.sampleRate)
        .audioChannels(quality.channels)
        .audioFilters(`volume=${clampedGain}dB`)
        .format('flac')
        .output(outputPath);
    } else {
      cmd
        .audioCodec('aac')
        .audioBitrate(quality.bitrate)
        .audioFrequency(quality.sampleRate)
        .audioChannels(quality.channels)
        .audioFilters(`volume=${clampedGain}dB`)
        .format('mp4')
        .outputOptions(['-movflags', '+faststart']) // web-optimized
        .output(outputPath);
    }

    cmd
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

// ─────────────────────────────────────────────
// 5. HLS Playlist Generation (Adaptive Bitrate)
// ─────────────────────────────────────────────

function generateHlsStream(
  inputPath: string,
  outputDir: string,
  qualityKey: string,
  quality: typeof CONFIG.qualities[keyof typeof CONFIG.qualities]
): Promise<string> {
  return new Promise((resolve, reject) => {
    const playlistName = `${qualityKey}.m3u8`;
    const segmentPattern = path.join(outputDir, `${qualityKey}_%03d.ts`);
    const playlistPath = path.join(outputDir, playlistName);

    fs.mkdirSync(outputDir, { recursive: true });

    const cmd = ffmpeg(inputPath);

    if (quality.codec === 'flac') {
      // For lossless, use FLAC in fMP4 segments (HLS supports this)
      cmd
        .audioCodec('flac')
        .audioFrequency(quality.sampleRate)
        .audioChannels(quality.channels);
    } else {
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
        `-hls_list_size`, `0`,       // keep all segments
        `-hls_segment_type`, `mpegts`,
        `-hls_segment_filename`, segmentPattern,
        `-hls_playlist_type`, `vod`,
      ])
      .output(playlistPath)
      .on('end', () => resolve(playlistName))
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

function generateMasterPlaylist(
  hlsDir: string,
  qualities: { key: string; playlist: string; bandwidth: number }[]
): string {
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
// 6. Waveform Peak Generation
// ─────────────────────────────────────────────

function generateWaveformPeaks(inputPath: string, numPeaks: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const rawPath = inputPath + '.raw';

    // Convert to raw PCM, mono, low sample rate for fast processing
    ffmpeg(inputPath)
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(8000)
      .format('s16le')
      .output(rawPath)
      .on('end', () => {
        try {
          const rawBuffer = fs.readFileSync(rawPath);
          const samples = new Int16Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.length / 2);

          const peaks: number[] = [];
          const samplesPerPeak = Math.max(1, Math.floor(samples.length / numPeaks));

          for (let i = 0; i < numPeaks; i++) {
            const start = i * samplesPerPeak;
            const end = Math.min(start + samplesPerPeak, samples.length);
            let maxAbs = 0;
            for (let j = start; j < end; j++) {
              const abs = Math.abs(samples[j]);
              if (abs > maxAbs) maxAbs = abs;
            }
            // Normalize to 0-1
            peaks.push(Math.round((maxAbs / 32768) * 1000) / 1000);
          }

          // Cleanup temp raw file
          fs.unlinkSync(rawPath);
          resolve(peaks);
        } catch (err) {
          if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
          reject(err);
        }
      })
      .on('error', (err: Error) => {
        if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
        reject(err);
      })
      .run();
  });
}

// ─────────────────────────────────────────────
// 7. Full Processing Pipeline
// ─────────────────────────────────────────────

export async function processTrack(
  trackId: string,
  inputPath: string,
  coverPath?: string,
  keepOriginal?: boolean
): Promise<ProcessingResult> {
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
    console.log(`[${trackId}] Processing cover art...`);
    const coverPaths = await processCoverArt(trackId, meta.coverBuffer, coverPath);

    // ── Step 3: Analyze loudness ──
    console.log(`[${trackId}] Analyzing loudness (EBU R128)...`);
    const loudness = await analyzeLoudness(inputPath);
    console.log(`[${trackId}] Integrated loudness: ${loudness.toFixed(1)} LUFS`);

    // ── Step 4: Transcode to multiple qualities ──
    // Smart quality selection based on source bitrate to avoid pointless upsampling
    console.log(`[${trackId}] Transcoding (source: ${meta.bitrate}kbps ${meta.format})...`);
    const streams: Record<string, string> = {};

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
    } else {
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

    // ── Step 5: Generate HLS streams ──
    console.log(`[${trackId}] Generating HLS streams...`);
    const hlsQualities: { key: string; playlist: string; bandwidth: number }[] = [];

    const lowHls = await generateHlsStream(inputPath, hlsDir, 'low', CONFIG.qualities.low);
    hlsQualities.push({ key: 'low', playlist: lowHls, bandwidth: 64000 });

    const medHls = await generateHlsStream(inputPath, hlsDir, 'medium', CONFIG.qualities.medium);
    hlsQualities.push({ key: 'medium', playlist: medHls, bandwidth: 128000 });

    const highHls = await generateHlsStream(inputPath, hlsDir, 'high', CONFIG.qualities.high);
    hlsQualities.push({ key: 'high', playlist: highHls, bandwidth: 256000 });

    const masterPlaylist = generateMasterPlaylist(hlsDir, hlsQualities);

    // ── Step 6: Generate waveform ──
    console.log(`[${trackId}] Generating waveform peaks...`);
    const waveformPeaks = await generateWaveformPeaks(inputPath, CONFIG.waveformPeaks);

    // Save waveform JSON
    const waveformPath = path.join(PATHS.waveforms, `${trackId}.json`);
    fs.writeFileSync(waveformPath, JSON.stringify(waveformPeaks));

    // ── Step 7: Update database ──
    console.log(`[${trackId}] Updating database...`);
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
  } catch (error: any) {
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

interface QueueJob {
  trackId: string;
  inputPath: string;
  coverPath?: string;
  keepOriginal?: boolean;
}

const processingQueue: QueueJob[] = [];
let activeWorkers = 0;

/** Max concurrent FFmpeg processes — leave 1 core free for the server */
const MAX_WORKERS = Math.max(1, Math.min(os.cpus().length - 1, 4));

export function enqueueTrack(
  trackId: string,
  inputPath: string,
  coverPath?: string,
  keepOriginal?: boolean
): void {
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

function drainQueue(): void {
  while (activeWorkers < MAX_WORKERS && processingQueue.length > 0) {
    const job = processingQueue.shift()!;
    activeWorkers++;
    processTrack(job.trackId, job.inputPath, job.coverPath, job.keepOriginal)
      .catch((err) => console.error(`[${job.trackId}] Processing queue error:`, err))
      .finally(() => {
        activeWorkers--;
        drainQueue();
      });
  }
}
