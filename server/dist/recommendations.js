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
import { query, queryOne, execute } from './db.js';
// ─── Signal Weights ───
// How much each user action contributes to taste scoring
const SIGNAL_WEIGHTS = {
    play: 3,
    finish: 5, // дослушал до конца — сильный сигнал
    replay: 6, // переслушал — ещё сильнее
    like: 7,
    unlike: -5,
    add_to_playlist: 8,
    skip: -4, // скипнул в первые 15 сек
    share: 6,
    follow_artist: 5,
    open_track: 1,
    open_artist: 2,
    search: 2,
    queue_next: 4,
};
// ─── DB Migrations ───
export async function initRecommendationSchema() {
    await execute(`
    -- Events log: every user action
    CREATE TABLE IF NOT EXISTS user_events (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      track_id TEXT,
      artist_slug TEXT,
      genre TEXT,
      context TEXT,              -- e.g. 'home', 'search', 'artist_page', 'autoplay'
      duration_listened DOUBLE PRECISION DEFAULT 0,
      track_duration DOUBLE PRECISION DEFAULT 0,
      session_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- User taste profile: computed periodically from events
    CREATE TABLE IF NOT EXISTS user_taste_profile (
      user_id TEXT PRIMARY KEY,
      -- Top genres with scores: {"Hip-Hop": 85, "R&B": 45, ...}
      genre_scores JSONB NOT NULL DEFAULT '{}',
      -- Top artists with scores: {"artist-slug": 92, ...}
      artist_scores JSONB NOT NULL DEFAULT '{}',
      -- Preferred BPM range
      preferred_bpm_min DOUBLE PRECISION DEFAULT 80,
      preferred_bpm_max DOUBLE PRECISION DEFAULT 160,
      -- Listening patterns
      avg_listen_ratio DOUBLE PRECISION DEFAULT 0.7,  -- avg % of track listened
      skip_rate DOUBLE PRECISION DEFAULT 0.2,          -- % of tracks skipped
      exploration_score DOUBLE PRECISION DEFAULT 0.5,  -- склонность к новому (0-1)
      -- Time of day preferences: {"morning": 0.1, "day": 0.3, "evening": 0.4, "night": 0.2}
      time_preferences JSONB NOT NULL DEFAULT '{}',
      -- Total events processed
      events_processed INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Indexes for fast queries
    CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_events_track ON user_events(track_id);
    CREATE INDEX IF NOT EXISTS idx_user_events_type ON user_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_user_events_created ON user_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_user_events_user_type ON user_events(user_id, event_type);
  `);
}
export async function recordEvent(event) {
    execute(`
    INSERT INTO user_events (user_id, event_type, track_id, artist_slug, genre, context, duration_listened, track_duration, session_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
        event.userId,
        event.eventType,
        event.trackId || null,
        event.artistSlug || null,
        event.genre || null,
        event.context || null,
        event.durationListened || 0,
        event.trackDuration || 0,
        event.sessionId || null,
    ]).catch(err => console.error('recordEvent error:', err.message));
}
// ─── Taste Profile Computation ───
/**
 * Rebuild user taste profile from the last 90 days of events.
 * Can be called periodically or on-demand.
 */
export async function rebuildTasteProfile(userId) {
    // Gather events from last 90 days
    const events = await query(`
    SELECT ue.event_type, ue.track_id, ue.artist_slug, ue.genre,
           ue.duration_listened, ue.track_duration, ue.created_at,
           t.genre as track_genre, t.artist_slug as track_artist_slug,
           t.meta_bpm as bpm
    FROM user_events ue
    LEFT JOIN tracks t ON t.id = ue.track_id
    WHERE ue.user_id = $1 AND ue.created_at > NOW() - INTERVAL '90 days'
    ORDER BY ue.created_at DESC
  `, [userId]);
    if (events.length === 0)
        return;
    // ── Genre scores ──
    const genreScores = new Map();
    // ── Artist scores ──
    const artistScores = new Map();
    // ── BPM tracking ──
    const bpmValues = [];
    // ── Listen ratio tracking ──
    let totalListenRatios = 0;
    let listenRatioCount = 0;
    // ── Skip counting ──
    let skipCount = 0;
    let playCount = 0;
    // ── Time of day ──
    const timeSlots = { morning: 0, day: 0, evening: 0, night: 0 };
    // Apply recency decay: recent events matter more
    const now = Date.now();
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
    for (const ev of events) {
        const weight = SIGNAL_WEIGHTS[ev.event_type] || 0;
        if (weight === 0)
            continue;
        // Recency factor: 1.0 for today, ~0.3 for 90 days ago
        const age = now - new Date(ev.created_at).getTime();
        const recency = Math.max(0.3, 1 - (age / NINETY_DAYS) * 0.7);
        const score = weight * recency;
        // Genre scoring
        const genre = ev.genre || ev.track_genre;
        if (genre) {
            genreScores.set(genre, (genreScores.get(genre) || 0) + score);
        }
        // Artist scoring
        const artistSlug = ev.artist_slug || ev.track_artist_slug;
        if (artistSlug) {
            artistScores.set(artistSlug, (artistScores.get(artistSlug) || 0) + score);
        }
        // BPM
        if (ev.bpm && ev.bpm > 40 && ev.bpm < 250) {
            bpmValues.push(ev.bpm);
        }
        // Listen ratio
        if (ev.event_type === 'finish' || ev.event_type === 'play') {
            if (ev.duration_listened > 0 && ev.track_duration > 0) {
                totalListenRatios += ev.duration_listened / ev.track_duration;
                listenRatioCount++;
            }
        }
        // Skip/play counting
        if (ev.event_type === 'skip')
            skipCount++;
        if (ev.event_type === 'play')
            playCount++;
        // Time of day
        const hour = new Date(ev.created_at).getHours();
        if (hour >= 6 && hour < 12)
            timeSlots.morning++;
        else if (hour >= 12 && hour < 18)
            timeSlots.day++;
        else if (hour >= 18 && hour < 23)
            timeSlots.evening++;
        else
            timeSlots.night++;
    }
    // Normalize genre scores to 0-100
    const maxGenre = Math.max(...genreScores.values(), 1);
    const normalizedGenres = {};
    for (const [g, s] of genreScores) {
        normalizedGenres[g] = Math.round((s / maxGenre) * 100);
    }
    // Normalize artist scores to 0-100
    const maxArtist = Math.max(...artistScores.values(), 1);
    const normalizedArtists = {};
    for (const [a, s] of artistScores) {
        normalizedArtists[a] = Math.round((s / maxArtist) * 100);
    }
    // BPM range (use percentiles to filter outliers)
    let bpmMin = 80, bpmMax = 160;
    if (bpmValues.length > 3) {
        bpmValues.sort((a, b) => a - b);
        bpmMin = bpmValues[Math.floor(bpmValues.length * 0.15)];
        bpmMax = bpmValues[Math.floor(bpmValues.length * 0.85)];
    }
    // Average listen ratio
    const avgListenRatio = listenRatioCount > 0 ? totalListenRatios / listenRatioCount : 0.7;
    // Skip rate
    const skipRate = playCount > 0 ? skipCount / playCount : 0.2;
    // Exploration score: users who listen to many different genres/artists are more exploratory
    const uniqueGenres = genreScores.size;
    const uniqueArtists = artistScores.size;
    const exploration = Math.min(1, (uniqueGenres * 0.1 + uniqueArtists * 0.02));
    // Normalize time preferences
    const totalTime = Object.values(timeSlots).reduce((s, v) => s + v, 0) || 1;
    const timePrefs = {};
    for (const [k, v] of Object.entries(timeSlots)) {
        timePrefs[k] = Math.round((v / totalTime) * 100) / 100;
    }
    // Upsert profile
    await execute(`
    INSERT INTO user_taste_profile (
      user_id, genre_scores, artist_scores,
      preferred_bpm_min, preferred_bpm_max,
      avg_listen_ratio, skip_rate, exploration_score,
      time_preferences, events_processed, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      genre_scores = $2, artist_scores = $3,
      preferred_bpm_min = $4, preferred_bpm_max = $5,
      avg_listen_ratio = $6, skip_rate = $7, exploration_score = $8,
      time_preferences = $9, events_processed = $10, updated_at = NOW()
  `, [
        userId,
        JSON.stringify(normalizedGenres),
        JSON.stringify(normalizedArtists),
        bpmMin, bpmMax,
        avgListenRatio, skipRate, exploration,
        JSON.stringify(timePrefs),
        events.length,
    ]);
}
/**
 * Get or rebuild user taste profile (with cache TTL of 1 hour)
 */
async function getTasteProfile(userId) {
    const profile = await queryOne(`
    SELECT * FROM user_taste_profile
    WHERE user_id = $1 AND updated_at > NOW() - INTERVAL '1 hour'
  `, [userId]);
    if (profile)
        return profile;
    // Rebuild if stale or missing
    await rebuildTasteProfile(userId);
    return queryOne('SELECT * FROM user_taste_profile WHERE user_id = $1', [userId]);
}
/**
 * Score a track for a specific user based on their taste profile
 */
function scoreTrack(track, profile, recentTrackIds, skippedTrackIds) {
    if (!profile)
        return track.plays * 0.001; // fallback: popularity
    const genreScores = profile.genre_scores || {};
    const artistScores = profile.artist_scores || {};
    // Base components
    const genreAffinity = (genreScores[track.genre] || 0) / 100; // 0-1
    const artistAffinity = (artistScores[track.artist_slug] || 0) / 100; // 0-1
    const popularity = Math.min(1, (track.plays || 0) / 1000); // 0-1 (cap at 1000)
    const freshness = track.created_at
        ? Math.max(0, 1 - (Date.now() - new Date(track.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000))
        : 0; // 1.0 if today, 0 if 30+ days old
    // BPM fit
    let bpmFit = 0.5; // neutral
    if (track.meta_bpm && profile.preferred_bpm_min && profile.preferred_bpm_max) {
        if (track.meta_bpm >= profile.preferred_bpm_min && track.meta_bpm <= profile.preferred_bpm_max) {
            bpmFit = 1.0;
        }
        else {
            const dist = Math.min(Math.abs(track.meta_bpm - profile.preferred_bpm_min), Math.abs(track.meta_bpm - profile.preferred_bpm_max));
            bpmFit = Math.max(0, 1 - dist / 60);
        }
    }
    // Penalties
    const repetitionPenalty = recentTrackIds.has(track.id) ? 0.6 : 0;
    const skipPenalty = skippedTrackIds.has(track.id) ? 0.4 : 0;
    // Final score
    const score = 0.30 * genreAffinity +
        0.25 * artistAffinity +
        0.15 * bpmFit +
        0.10 * popularity +
        0.10 * freshness +
        0.10 * Math.random() // slight randomness for variety
        - repetitionPenalty
        - skipPenalty;
    return score;
}
/**
 * Get recently played/skipped track IDs for penalty calculation
 */
async function getRecentHistory(userId) {
    const played = await query(`
    SELECT DISTINCT track_id FROM user_events
    WHERE user_id = $1 AND event_type IN ('play', 'finish')
    AND created_at > NOW() - INTERVAL '24 hours'
  `, [userId]);
    const skipped = await query(`
    SELECT DISTINCT track_id FROM user_events
    WHERE user_id = $1 AND event_type = 'skip'
    AND created_at > NOW() - INTERVAL '7 days'
  `, [userId]);
    return {
        played: new Set(played.map((r) => r.track_id)),
        skipped: new Set(skipped.map((r) => r.track_id)),
    };
}
// ────────────────────────────────────────────
// 1. FOR YOU (главная: персональный микс)
// ────────────────────────────────────────────
export async function forYou(userId, limit = 20) {
    const profile = userId ? await getTasteProfile(userId) : null;
    const history = userId
        ? await getRecentHistory(userId)
        : { played: new Set(), skipped: new Set() };
    const { played, skipped } = history;
    // Get candidate tracks
    const candidates = await query(`
    SELECT * FROM tracks WHERE status = 'ready'
    ORDER BY created_at DESC LIMIT 500
  `);
    // Score each candidate
    const scored = candidates.map((t) => ({
        ...t,
        score: scoreTrack(t, profile, played, skipped),
    }));
    // Sort by score, take top N
    scored.sort((a, b) => b.score - a.score);
    // Ensure diversity: don't show more than 3 tracks from same artist
    const result = [];
    const artistCount = new Map();
    for (const t of scored) {
        const count = artistCount.get(t.artist_slug) || 0;
        if (count >= 3)
            continue;
        artistCount.set(t.artist_slug, count + 1);
        result.push(t);
        if (result.length >= limit)
            break;
    }
    return result;
}
// ────────────────────────────────────────────
// 2. NEXT TRACK (что поставить следующим)
// ────────────────────────────────────────────
export async function nextTrack(userId, currentTrackId, recentIds = []) {
    // Get current track info
    const current = await queryOne('SELECT * FROM tracks WHERE id = $1', [currentTrackId]);
    if (!current)
        return null;
    const recentSet = new Set(recentIds);
    recentSet.add(currentTrackId);
    // Find candidates: same genre, similar BPM, not recently played
    const candidates = await query(`
    SELECT * FROM tracks
    WHERE status = 'ready'
      AND id != $1
      AND genre = $2
    ORDER BY plays DESC
    LIMIT 100
  `, [currentTrackId, current.genre]);
    // Also add some cross-genre tracks for variety
    const crossGenre = await query(`
    SELECT * FROM tracks
    WHERE status = 'ready'
      AND id != $1
      AND genre != $2
    ORDER BY plays DESC
    LIMIT 30
  `, [currentTrackId, current.genre]);
    const all = [...candidates, ...crossGenre];
    // Score based on similarity to current track
    const scored = all.map((t) => {
        let sim = 0;
        // Same genre = strong signal
        if (t.genre === current.genre)
            sim += 0.35;
        // Same artist bonus
        if (t.artist_slug === current.artist_slug)
            sim += 0.15;
        // BPM proximity
        if (t.meta_bpm && current.meta_bpm) {
            const bpmDiff = Math.abs(t.meta_bpm - current.meta_bpm);
            sim += Math.max(0, 0.15 * (1 - bpmDiff / 40));
        }
        // Same album bonus
        if (t.meta_album && current.meta_album && t.meta_album === current.meta_album) {
            sim += 0.10;
        }
        // Popularity factor
        sim += Math.min(0.15, (t.plays || 0) / 5000);
        // Freshness
        if (t.created_at) {
            const ageMs = Date.now() - new Date(t.created_at).getTime();
            sim += Math.max(0, 0.05 * (1 - ageMs / (90 * 24 * 60 * 60 * 1000)));
        }
        // Small random factor for variety
        sim += Math.random() * 0.05;
        // Penalties
        if (recentSet.has(t.id))
            sim -= 0.5;
        return { ...t, score: sim };
    });
    // If we have a user, also factor in their taste
    if (userId) {
        const profile = await getTasteProfile(userId);
        if (profile) {
            const { skipped } = await getRecentHistory(userId);
            for (const t of scored) {
                t.score += scoreTrack(t, profile, recentSet, skipped) * 0.3;
            }
        }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0] || null;
}
// ────────────────────────────────────────────
// 3. SIMILAR TRACKS (похожие на конкретный трек)
// ────────────────────────────────────────────
export async function similarTracks(trackId, limit = 10) {
    const track = await queryOne('SELECT * FROM tracks WHERE id = $1', [trackId]);
    if (!track)
        return [];
    // Find tracks with matching genre, prioritize same artist or similar BPM
    const candidates = await query(`
    SELECT * FROM tracks
    WHERE status = 'ready' AND id != $1
    ORDER BY
      CASE WHEN genre = $2 THEN 0 ELSE 1 END,
      CASE WHEN artist_slug = $3 THEN 0 ELSE 1 END,
      plays DESC
    LIMIT 100
  `, [trackId, track.genre, track.artist_slug]);
    const scored = candidates.map((t) => {
        let sim = 0;
        if (t.genre === track.genre)
            sim += 0.40;
        if (t.artist_slug === track.artist_slug)
            sim += 0.20;
        // BPM similarity
        if (t.meta_bpm && track.meta_bpm) {
            const diff = Math.abs(t.meta_bpm - track.meta_bpm);
            sim += Math.max(0, 0.15 * (1 - diff / 40));
        }
        // Same album
        if (t.meta_album && track.meta_album && t.meta_album === track.meta_album) {
            sim += 0.10;
        }
        // Year proximity
        if (t.year && track.year) {
            const yearDiff = Math.abs(t.year - track.year);
            sim += Math.max(0, 0.05 * (1 - yearDiff / 10));
        }
        sim += Math.min(0.10, (t.plays || 0) / 5000);
        return { ...t, score: sim };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}
// ────────────────────────────────────────────
// 4. SIMILAR ARTISTS
// ────────────────────────────────────────────
export async function similarArtists(artistSlug, limit = 6) {
    // Find artists who share listeners with this artist
    // Approach: users who listen to artist X also listen to artist Y
    const coListened = await query(`
    SELECT ue2.artist_slug, COUNT(DISTINCT ue2.user_id) as shared_listeners
    FROM user_events ue1
    JOIN user_events ue2 ON ue2.user_id = ue1.user_id
      AND ue2.artist_slug IS NOT NULL
      AND ue2.artist_slug != $1
      AND ue2.event_type IN ('play', 'finish', 'like')
    WHERE ue1.artist_slug = $1
      AND ue1.event_type IN ('play', 'finish', 'like')
      AND ue1.created_at > NOW() - INTERVAL '90 days'
      AND ue2.created_at > NOW() - INTERVAL '90 days'
    GROUP BY ue2.artist_slug
    ORDER BY shared_listeners DESC
    LIMIT $2
  `, [artistSlug, limit * 2]);
    if (coListened.length === 0) {
        // Fallback: artists in same genre
        const artist = await queryOne('SELECT genre FROM artists WHERE slug = $1', [artistSlug]);
        if (!artist)
            return [];
        return query(`
      SELECT * FROM artists
      WHERE slug != $1 AND genre = $2 AND tracks_count > 0
      ORDER BY total_plays DESC
      LIMIT $3
    `, [artistSlug, artist.genre, limit]);
    }
    const slugs = coListened.map((r) => r.artist_slug).slice(0, limit);
    const placeholders = slugs.map((_, i) => `$${i + 1}`).join(',');
    return query(`SELECT * FROM artists WHERE slug IN (${placeholders}) ORDER BY total_plays DESC`, slugs);
}
// ────────────────────────────────────────────
// 5. CONTINUE LISTENING (продолжить слушать)
// ────────────────────────────────────────────
export async function continueListening(userId, limit = 10) {
    // Tracks the user started but didn't finish, or listened recently
    const recent = await query(`
    SELECT DISTINCT ON (ue.track_id) ue.track_id, ue.created_at,
           ue.duration_listened, ue.track_duration
    FROM user_events ue
    WHERE ue.user_id = $1
      AND ue.event_type IN ('play', 'finish')
      AND ue.created_at > NOW() - INTERVAL '7 days'
    ORDER BY ue.track_id, ue.created_at DESC
  `, [userId]);
    if (recent.length === 0)
        return [];
    const trackIds = recent.map((r) => r.track_id);
    const placeholders = trackIds.map((_, i) => `$${i + 1}`).join(',');
    const tracks = await query(`SELECT * FROM tracks WHERE id IN (${placeholders}) AND status = 'ready'`, trackIds);
    // Sort: most recently listened first
    const recentMap = new Map(recent.map((r) => [r.track_id, r]));
    tracks.sort((a, b) => {
        const ra = recentMap.get(a.id);
        const rb = recentMap.get(b.id);
        return new Date(rb?.created_at || 0).getTime() - new Date(ra?.created_at || 0).getTime();
    });
    return tracks.slice(0, limit);
}
// ────────────────────────────────────────────
// 6. NEW FOR YOU (новинки под ваш вкус)
// ────────────────────────────────────────────
export async function newForYou(userId, limit = 10) {
    const profile = userId ? await getTasteProfile(userId) : null;
    let candidates;
    if (!profile) {
        // No profile — return general new releases
        candidates = await query(`
      SELECT * FROM tracks WHERE status = 'ready'
      ORDER BY created_at DESC LIMIT $1
    `, [limit * 4]);
    }
    else {
        // Get user's top genres
        const genreScores = profile.genre_scores || {};
        const topGenres = Object.entries(genreScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([g]) => g);
        if (topGenres.length === 0) {
            candidates = await query('SELECT * FROM tracks WHERE status = \'ready\' ORDER BY created_at DESC LIMIT $1', [limit * 4]);
        }
        else {
            const placeholders = topGenres.map((_, i) => `$${i + 1}`).join(',');
            candidates = await query(`
        SELECT * FROM tracks
        WHERE status = 'ready'
          AND genre IN (${placeholders})
          AND created_at > NOW() - INTERVAL '30 days'
        ORDER BY created_at DESC
        LIMIT $${topGenres.length + 1}
      `, [...topGenres, limit * 4]);
        }
    }
    // Deduplicate: max 1 track per album (meta_album or artist_slug fallback)
    const result = [];
    const seenAlbums = new Set();
    for (const t of candidates) {
        const albumKey = (t.meta_album && t.meta_album.trim()) ? `${t.artist_slug}::${t.meta_album}` : '';
        if (albumKey && seenAlbums.has(albumKey))
            continue;
        if (albumKey)
            seenAlbums.add(albumKey);
        result.push(t);
        if (result.length >= limit)
            break;
    }
    return result;
}
// ────────────────────────────────────────────
// 7. TRENDING IN YOUR GENRES
// ────────────────────────────────────────────
export async function trendingForYou(userId, limit = 10) {
    const profile = await getTasteProfile(userId);
    if (!profile) {
        return query(`
      SELECT t.*, COUNT(ph.id) as recent_plays
      FROM tracks t
      JOIN play_history ph ON ph.track_id = t.id
      WHERE ph.played_at > NOW() - INTERVAL '24 hours'
        AND t.status = 'ready'
      GROUP BY t.id
      ORDER BY recent_plays DESC
      LIMIT $1
    `, [limit]);
    }
    const genreScores = profile.genre_scores || {};
    const topGenres = Object.entries(genreScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g]) => g);
    if (topGenres.length === 0) {
        return query(`
      SELECT t.*, COUNT(ph.id) as recent_plays
      FROM tracks t
      JOIN play_history ph ON ph.track_id = t.id
      WHERE ph.played_at > NOW() - INTERVAL '24 hours'
        AND t.status = 'ready'
      GROUP BY t.id ORDER BY recent_plays DESC LIMIT $1
    `, [limit]);
    }
    const placeholders = topGenres.map((_, i) => `$${i + 1}`).join(',');
    return query(`
    SELECT t.*, COUNT(ph.id) as recent_plays
    FROM tracks t
    JOIN play_history ph ON ph.track_id = t.id
    WHERE ph.played_at > NOW() - INTERVAL '48 hours'
      AND t.status = 'ready'
      AND t.genre IN (${placeholders})
    GROUP BY t.id
    ORDER BY recent_plays DESC
    LIMIT $${topGenres.length + 1}
  `, [...topGenres, limit]);
}
// ────────────────────────────────────────────
// 8. REDISCOVER (забытые любимые)
// ────────────────────────────────────────────
export async function rediscover(userId, limit = 10) {
    // Tracks the user liked or finished multiple times, but hasn't listened to in 14+ days
    return query(`
    SELECT t.*, COUNT(ue.id) as past_engagement
    FROM user_events ue
    JOIN tracks t ON t.id = ue.track_id
    WHERE ue.user_id = $1
      AND ue.event_type IN ('finish', 'like', 'replay', 'add_to_playlist')
      AND t.status = 'ready'
      AND t.id NOT IN (
        SELECT track_id FROM user_events
        WHERE user_id = $1
          AND event_type IN ('play', 'finish')
          AND created_at > NOW() - INTERVAL '14 days'
      )
    GROUP BY t.id
    HAVING COUNT(ue.id) >= 2
    ORDER BY past_engagement DESC
    LIMIT $2
  `, [userId, limit]);
}
// ────────────────────────────────────────────
// 9. USER TASTE SUMMARY (for profile page)
// ────────────────────────────────────────────
export async function getUserTasteSummary(userId) {
    const profile = await getTasteProfile(userId);
    if (!profile)
        return null;
    const genreScores = profile.genre_scores || {};
    const artistScoresRaw = profile.artist_scores || {};
    // Top 5 genres
    const topGenres = Object.entries(genreScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, score]) => ({ genre, count: score }));
    // Top 5 artists — resolve slugs to names
    const topArtistSlugs = Object.entries(artistScoresRaw)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    let topArtists = [];
    if (topArtistSlugs.length > 0) {
        const slugList = topArtistSlugs.map(([s]) => s);
        const placeholders = slugList.map((_, i) => `$${i + 1}`).join(',');
        const artists = await query(`SELECT slug, name FROM artists WHERE slug IN (${placeholders})`, slugList);
        const nameMap = new Map(artists.map((a) => [a.slug, a.name]));
        topArtists = topArtistSlugs.map(([slug, score]) => ({
            slug,
            name: nameMap.get(slug) || slug,
            count: score,
        }));
    }
    return {
        topGenres,
        topArtists,
        avgListenRatio: Math.round((profile.avg_listen_ratio || 0.7) * 100),
        skipRate: Math.round((profile.skip_rate || 0.2) * 100),
        explorationScore: Math.round((profile.exploration_score || 0.5) * 100),
        timePreferences: profile.time_preferences || {},
        eventsProcessed: profile.events_processed || 0,
        preferredBpm: {
            min: Math.round(profile.preferred_bpm_min || 80),
            max: Math.round(profile.preferred_bpm_max || 160),
        },
    };
}
//# sourceMappingURL=recommendations.js.map