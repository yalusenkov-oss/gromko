/**
 * GROMKO Server — Audio Streaming Platform Backend
 *
 * Express сервер для:
 * - Загрузки и обработки аудиофайлов (FFmpeg pipeline)
 * - Стриминга аудио (HLS adaptive + direct HTTP Range)
 * - REST API для фронтенда
 * - Раздача статики (обложки, waveforms)
 */
import 'dotenv/config';
declare const app: import("express-serve-static-core").Express;
export default app;
//# sourceMappingURL=index.d.ts.map