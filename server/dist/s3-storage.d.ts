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
import 'dotenv/config';
/** Бакет для обработанных файлов (CDN) */
export declare const CDN_BUCKET: string;
/** Префикс для обработанных файлов внутри бакета */
export declare const CDN_PREFIX: string;
/** Публичный базовый URL для прямого доступа к файлам */
export declare const CDN_BASE_URL: string;
/** Включён ли S3 storage (если ключи заданы) */
export declare const S3_ENABLED: boolean;
/**
 * Загрузить файл в S3.
 * @returns Публичный URL файла.
 */
export declare function uploadToS3(localPath: string, s3Key: string, options?: {
    cacheControl?: string;
}): Promise<string>;
/**
 * Загрузить буфер в S3.
 */
export declare function uploadBufferToS3(buffer: Buffer, s3Key: string, contentType: string, options?: {
    cacheControl?: string;
}): Promise<string>;
/**
 * Загрузить целую директорию в S3 (рекурсивно).
 * Используется для HLS (master.m3u8 + segments).
 * @returns Массив { localPath, s3Url }.
 */
export declare function uploadDirToS3(localDir: string, s3Prefix: string): Promise<{
    localPath: string;
    s3Url: string;
}[]>;
/**
 * Получить публичный S3 URL для ключа.
 */
export declare function getS3Url(s3Key: string): string;
/**
 * Проверить существование объекта.
 */
export declare function s3Exists(s3Key: string): Promise<boolean>;
//# sourceMappingURL=s3-storage.d.ts.map