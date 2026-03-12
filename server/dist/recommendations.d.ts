/**
 * GROMKO Recommendation Engine
 *
 * Система алгоритмов рекомендаций для музыкальной площадки.
 *
 * Архитектура:
 *
 * 1. Сбор событий (user_events) — play, finish, skip, like, unlike,
 *    add_to_playlist, search, share, follow_artist, open_track
 *
 * 2. Профиль вкуса пользователя (user_taste_profile) — считается из событий:
 *    - топ жанров, артистов, BPM-диапазон, время активности
 *
 * 3. Алгоритмы:
 *    - forYou()           — главная: персональный микс
 *    - nextTrack()        — что поставить следующим
 *    - similarTracks()    — похожие на конкретный трек
 *    - similarArtists()   — похожие артисты
 *    - continueListening() — продолжить слушать
 *    - newForYou()        — новинки под вкус
 *    - trendingForYou()   — тренды в твоих жанрах
 *    - rediscover()       — забытые любимые
 *
 * Баланс: 70% знакомого + 20% близкого нового + 10% exploration
 */
export declare function initRecommendationSchema(): Promise<void>;
interface UserEvent {
    userId: string;
    eventType: string;
    trackId?: string;
    artistSlug?: string;
    genre?: string;
    context?: string;
    durationListened?: number;
    trackDuration?: number;
    sessionId?: string;
}
export declare function recordEvent(event: UserEvent): Promise<void>;
/**
 * Rebuild user taste profile from the last 90 days of events.
 * Can be called periodically or on-demand.
 */
export declare function rebuildTasteProfile(userId: string): Promise<void>;
export declare function forYou(userId: string | null, limit?: number): Promise<any[]>;
export declare function nextTrack(userId: string | null, currentTrackId: string, recentIds?: string[]): Promise<any | null>;
export declare function similarTracks(trackId: string, limit?: number): Promise<any[]>;
export declare function similarArtists(artistSlug: string, limit?: number): Promise<any[]>;
export declare function continueListening(userId: string, limit?: number): Promise<any[]>;
export declare function newForYou(userId: string | null, limit?: number): Promise<any[]>;
export declare function trendingForYou(userId: string, limit?: number): Promise<any[]>;
export declare function rediscover(userId: string, limit?: number): Promise<any[]>;
export declare function getUserTasteSummary(userId: string): Promise<{
    topGenres: {
        genre: string;
        count: number;
    }[];
    topArtists: {
        slug: string;
        name: string;
        count: number;
    }[];
    avgListenRatio: number;
    skipRate: number;
    explorationScore: number;
    timePreferences: any;
    eventsProcessed: any;
    preferredBpm: {
        min: number;
        max: number;
    };
} | null>;
export {};
//# sourceMappingURL=recommendations.d.ts.map