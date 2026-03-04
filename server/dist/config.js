import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');
function resolveDataDir() {
    if (process.env.DATA_DIR)
        return process.env.DATA_DIR;
    const localDir = path.join(ROOT, 'data');
    try {
        fs.mkdirSync(localDir, { recursive: true });
        return localDir;
    }
    catch {
        return '/tmp/gromko-data';
    }
}
const DATA_DIR = resolveDataDir();
export const PATHS = {
    /** Root data directory */
    data: DATA_DIR,
    /** Uploaded original audio files before processing */
    uploads: path.join(DATA_DIR, 'uploads'),
    /** Processed audio output: HLS segments, transcoded files */
    audio: path.join(DATA_DIR, 'audio'),
    /** Cover art (original + resized) */
    covers: path.join(DATA_DIR, 'covers'),
    /** Waveform JSON cache */
    waveforms: path.join(DATA_DIR, 'waveforms'),
    /** Temp directory for processing */
    temp: path.join(DATA_DIR, 'temp'),
};
/** Per-track audio directory: data/audio/{trackId}/ */
export function trackAudioDir(trackId) {
    return path.join(PATHS.audio, trackId);
}
/** Per-track HLS directory: data/audio/{trackId}/hls/ */
export function trackHlsDir(trackId) {
    return path.join(PATHS.audio, trackId, 'hls');
}
/** Ensure all required directories exist */
export function ensureDirs() {
    for (const dir of Object.values(PATHS)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
/** Server config */
export const CONFIG = {
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0',
    /** Max upload size in bytes (500MB — WAV 24bit/96kHz can be large) */
    maxUploadSize: 500 * 1024 * 1024,
    /** Allowed audio MIME types */
    allowedAudioMimes: [
        'audio/mpeg', // mp3
        'audio/mp3',
        'audio/wav',
        'audio/wave',
        'audio/x-wav',
        'audio/flac',
        'audio/x-flac',
        'audio/ogg',
        'audio/aac',
        'audio/mp4',
        'audio/x-m4a',
        'audio/m4a',
    ],
    /** Allowed audio extensions */
    allowedAudioExts: ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.wma', '.opus'],
    /** Allowed cover MIME types */
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/webp'],
    /** Transcoding quality presets — like Spotify/Yandex Music */
    qualities: {
        low: {
            label: 'Экономный',
            bitrate: '64k',
            codec: 'aac',
            sampleRate: 22050,
            channels: 1,
            suffix: '_low',
        },
        medium: {
            label: 'Стандартный',
            bitrate: '128k',
            codec: 'aac',
            sampleRate: 44100,
            channels: 2,
            suffix: '_medium',
        },
        high: {
            label: 'Высокое',
            bitrate: '256k',
            codec: 'aac',
            sampleRate: 44100,
            channels: 2,
            suffix: '_high',
        },
        lossless: {
            label: 'Без потерь',
            bitrate: '0',
            codec: 'flac',
            sampleRate: 44100,
            channels: 2,
            suffix: '_lossless',
        },
    },
    /** HLS segment duration in seconds */
    hlsSegmentDuration: 6,
    /** Waveform: number of peaks for visualization */
    waveformPeaks: 200,
    /** Cover art sizes to generate */
    coverSizes: [
        { name: 'thumb', width: 100, height: 100 },
        { name: 'small', width: 300, height: 300 },
        { name: 'medium', width: 600, height: 600 },
        { name: 'large', width: 1200, height: 1200 },
    ],
};
//# sourceMappingURL=config.js.map