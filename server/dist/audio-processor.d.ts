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
export declare function processCoverArt(trackId: string, coverBuffer?: Buffer, externalCoverPath?: string): Promise<Record<string, string>>;
export declare function processTrack(trackId: string, inputPath: string, coverPath?: string, keepOriginal?: boolean): Promise<ProcessingResult>;
export declare function enqueueTrack(trackId: string, inputPath: string, coverPath?: string, keepOriginal?: boolean): void;
export declare function getQueueStatus(): {
    queued: number;
    active: number;
    maxWorkers: number;
};
//# sourceMappingURL=audio-processor.d.ts.map