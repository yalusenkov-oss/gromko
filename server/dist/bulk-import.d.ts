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
//# sourceMappingURL=bulk-import.d.ts.map