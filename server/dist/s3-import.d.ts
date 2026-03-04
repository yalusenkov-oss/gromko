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
//# sourceMappingURL=s3-import.d.ts.map