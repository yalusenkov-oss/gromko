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
export declare function extractMetadata(filePath: string): Promise<AudioMeta>;
/**
 * Fetch cover art from external APIs (iTunes / Deezer) when no embedded or local cover exists.
 * Returns a Buffer of the image, or undefined if not found.
 */
export declare function fetchExternalCover(artist?: string, title?: string, album?: string): Promise<Buffer | undefined>;
export interface ExternalMeta {
    genre?: string;
    explicit?: boolean;
    year?: number;
    releaseDate?: string;
    album?: string;
    bpm?: number;
    isrc?: string;
    label?: string;
    deezerBpm?: number;
    source: 'itunes' | 'deezer';
}
/**
 * Fetch metadata from external APIs (iTunes + Deezer) for a given track.
 * Returns enriched metadata or undefined if nothing found.
 */
export declare function fetchExternalMetadata(artist?: string, title?: string, album?: string): Promise<ExternalMeta | undefined>;
/**
 * Fix metadata for an existing track — fetches from external APIs and updates DB.
 * Returns the updated fields or null if nothing found.
 */
export declare function fixTrackMetadata(trackId: string, artist: string, title: string, currentGenre?: string, currentExplicit?: boolean, currentYear?: number, currentAlbum?: string, currentBpm?: number): Promise<Record<string, any> | null>;
export declare function processCoverArt(trackId: string, coverBuffer?: Buffer, externalCoverPath?: string, artist?: string, title?: string, album?: string): Promise<Record<string, string>>;
/**
 * Fix cover art for an existing track — fetches from external APIs and updates DB + S3.
 * Returns the new cover_path or null if no cover found.
 */
export declare function fixTrackCover(trackId: string, artist: string, title: string, album?: string): Promise<string | null>;
export declare function processTrack(trackId: string, inputPath: string, coverPath?: string, keepOriginal?: boolean): Promise<ProcessingResult>;
export declare function enqueueTrack(trackId: string, inputPath: string, coverPath?: string, keepOriginal?: boolean): void;
export declare function getQueueStatus(): {
    queued: number;
    active: number;
    maxWorkers: number;
};
//# sourceMappingURL=audio-processor.d.ts.map