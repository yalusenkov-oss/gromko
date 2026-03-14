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

const SIGNAL_WEIGHTS: Record<string, number> = {
  play:             3,
  finish:           5,   // дослушал до конца — сильный сигнал
  replay:           6,   // переслушал — ещё сильнее
  like:             7,
  unlike:          -5,
  dislike:         -7,
  add_to_playlist:  8,
  skip:            -4,   // legacy fallback
  skip_early:      -6,   // скипнул почти сразу — сильный негативный сигнал
  skip_late:       -1,   // поздний скип — слабый негативный сигнал
  seek_back:        2,   // вернулся назад — интерес к моменту
  replay_segment:   4,   // переслушал сегмент — сильный локальный интерес
  share:            6,
  follow_artist:    5,
  open_track:       1,
  open_artist:      2,
  search:           2,
  queue_next:       4,
};

const SCORE_WEIGHTS_RAW = {
  genreAffinity: 0.30,
  artistAffinity: 0.25,
  bpmFit: 0.15,
  popularity: 0.08,
  freshness: 0.07,
  discoveryBonus: 0.10,
  artistLikeness: 0.03,
  randomness: 0.12,
} as const;

function normalizeWeights<T extends Record<string, number>>(weights: T): T {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) throw new Error('Recommendation score weights must sum to > 0');
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total])
  ) as T;
}

const SCORE_WEIGHTS = normalizeWeights(SCORE_WEIGHTS_RAW);

function getTimeSlot(date: Date, useUtc = false): 'morning' | 'day' | 'evening' | 'night' {
  const hour = useUtc ? date.getUTCHours() : date.getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

function getTimeSlotForTimezone(date: Date, timezone?: string | null): 'morning' | 'day' | 'evening' | 'night' {
  if (!timezone) return getTimeSlot(date, true);

  try {
    const hourString = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    }).format(date);
    const hour = Number(hourString);
    if (!Number.isFinite(hour)) return getTimeSlot(date, true);
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'day';
    if (hour >= 18 && hour < 23) return 'evening';
    return 'night';
  } catch {
    return getTimeSlot(date, true);
  }
}

// ─── DB Migrations ───

export async function initRecommendationSchema(): Promise<void> {
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
      timezone TEXT,
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

// ─── Event Recording ───

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

const EVENT_INSERT_RETRIES = 3;
const EVENT_RETRY_DELAY_MS = 250;
const EVENT_BATCH_SIZE = 50;
const EVENT_FLUSH_INTERVAL_MS = 1000;
const EVENT_QUEUE_MAX_SIZE = 5000;
const PROFILE_REBUILD_DEBOUNCE_MS = 15000;

const pendingProfileRebuilds = new Map<string, ReturnType<typeof setTimeout>>();
const activeProfileRebuilds = new Set<string>();
const queuedEvents: UserEvent[] = [];
let eventFlushTimer: ReturnType<typeof setTimeout> | null = null;
let eventFlushInProgress = false;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function scheduleTasteProfileRebuild(userId: string): void {
  const existingTimer = pendingProfileRebuilds.get(userId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(async () => {
    pendingProfileRebuilds.delete(userId);
    if (activeProfileRebuilds.has(userId)) return;

    activeProfileRebuilds.add(userId);
    try {
      await rebuildTasteProfile(userId);
    } catch (err: any) {
      console.error('rebuildTasteProfile error:', err?.message || err);
    } finally {
      activeProfileRebuilds.delete(userId);
    }
  }, PROFILE_REBUILD_DEBOUNCE_MS);

  pendingProfileRebuilds.set(userId, timer);
}

function scheduleEventFlush(immediate = false): void {
  if (eventFlushTimer) {
    if (!immediate) return;
    clearTimeout(eventFlushTimer);
    eventFlushTimer = null;
  }

  eventFlushTimer = setTimeout(() => {
    eventFlushTimer = null;
    void flushEventQueue();
  }, immediate ? 0 : EVENT_FLUSH_INTERVAL_MS);
}

async function insertEventBatch(batch: UserEvent[]): Promise<boolean> {
  const values: any[] = [];
  const placeholders = batch.map((event, index) => {
    const offset = index * 9;
    values.push(
      event.userId,
      event.eventType,
      event.trackId || null,
      event.artistSlug || null,
      event.genre || null,
      event.context || null,
      event.durationListened || 0,
      event.trackDuration || 0,
      event.sessionId || null,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
  }).join(', ');

  for (let attempt = 1; attempt <= EVENT_INSERT_RETRIES; attempt++) {
    try {
      await execute(`
        INSERT INTO user_events (
          user_id, event_type, track_id, artist_slug, genre, context, duration_listened, track_duration, session_id
        ) VALUES ${placeholders}
      `, values);
      return true;
    } catch (err: any) {
      if (attempt === EVENT_INSERT_RETRIES) {
        console.error('recordEvent batch error:', err?.message || err);
        return false;
      }
      await delay(EVENT_RETRY_DELAY_MS * attempt);
    }
  }

  return false;
}

async function flushEventQueue(): Promise<void> {
  if (eventFlushInProgress || queuedEvents.length === 0) return;

  eventFlushInProgress = true;
  try {
    while (queuedEvents.length > 0) {
      const batch = queuedEvents.splice(0, EVENT_BATCH_SIZE);
      const inserted = await insertEventBatch(batch);
      if (!inserted) continue;

      const affectedUsers = new Set(batch.map(event => event.userId));
      for (const userId of affectedUsers) {
        scheduleTasteProfileRebuild(userId);
      }
    }
  } finally {
    eventFlushInProgress = false;
    if (queuedEvents.length > 0) scheduleEventFlush(true);
  }
}

export async function recordEvent(event: UserEvent): Promise<void> {
  if (queuedEvents.length >= EVENT_QUEUE_MAX_SIZE) {
    queuedEvents.shift();
    console.error('recordEvent queue overflow: dropping oldest event');
  }

  queuedEvents.push(event);
  scheduleEventFlush(queuedEvents.length >= EVENT_BATCH_SIZE);
}

// ─── Taste Profile Computation ───

/**
 * Rebuild user taste profile from the last 90 days of events.
 * Can be called periodically or on-demand.
 */
export async function rebuildTasteProfile(userId: string): Promise<void> {
  // Gather events from last 90 days
  const events = await query(`
    SELECT ue.event_type, ue.track_id, ue.artist_slug, ue.genre,
           ue.duration_listened, ue.track_duration, ue.created_at,
           t.genre as track_genre, t.artist_slug as track_artist_slug,
           t.meta_bpm as bpm,
           u.timezone as user_timezone
    FROM user_events ue
    LEFT JOIN tracks t ON t.id = ue.track_id
    LEFT JOIN users u ON u.id = ue.user_id
    WHERE ue.user_id = $1 AND ue.created_at > NOW() - INTERVAL '90 days'
    ORDER BY ue.created_at DESC
  `, [userId]);

  if (events.length === 0) return;

  // ── Genre scores ──
  const genreScores = new Map<string, number>();
  // ── Artist scores ──
  const artistScores = new Map<string, number>();
  // ── BPM tracking ──
  const bpmValues: number[] = [];
  // ── Listen ratio tracking ──
  let totalListenRatios = 0;
  let listenRatioCount = 0;
  // ── Skip counting ──
  const startedTracks = new Set<string>();
  const skippedTracks = new Set<string>();
  // ── Time of day ──
  const timeSlots: Record<string, number> = { morning: 0, day: 0, evening: 0, night: 0 };
  const userTimezone = events[0]?.user_timezone || null;

  // Apply recency decay: recent events matter more
  const now = Date.now();
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

  for (const ev of events) {
    const weight = SIGNAL_WEIGHTS[ev.event_type] || 0;
    if (weight === 0) continue;

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
    if (ev.track_id && ['play', 'finish', 'skip', 'skip_early', 'skip_late'].includes(ev.event_type)) {
      startedTracks.add(ev.track_id);
    }
    if (ev.track_id && ['skip', 'skip_early', 'skip_late'].includes(ev.event_type)) {
      skippedTracks.add(ev.track_id);
    }

    // Time of day
    const slot = getTimeSlotForTimezone(new Date(ev.created_at), userTimezone);
    timeSlots[slot]++;
  }

  // Normalize genre scores to 0-100
  const maxGenre = Math.max(...genreScores.values(), 1);
  const normalizedGenres: Record<string, number> = {};
  for (const [g, s] of genreScores) {
    normalizedGenres[g] = Math.round((s / maxGenre) * 100);
  }

  // Normalize artist scores to 0-100
  const maxArtist = Math.max(...artistScores.values(), 1);
  const normalizedArtists: Record<string, number> = {};
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
  const skipRate = startedTracks.size > 0 ? skippedTracks.size / startedTracks.size : 0.2;

  // Exploration score: users who listen to many different genres/artists are more exploratory
  const uniqueGenres = genreScores.size;
  const uniqueArtists = artistScores.size;
  const exploration = Math.min(1, (uniqueGenres * 0.1 + uniqueArtists * 0.02));

  // Normalize time preferences
  const totalTime = Object.values(timeSlots).reduce((s, v) => s + v, 0) || 1;
  const timePrefs: Record<string, number> = {};
  for (const [k, v] of Object.entries(timeSlots)) {
    timePrefs[k] = Math.round((v / totalTime) * 100) / 100;
  }

  // Upsert profile
  await execute(`
    INSERT INTO user_taste_profile (
      user_id, genre_scores, artist_scores,
      preferred_bpm_min, preferred_bpm_max,
      avg_listen_ratio, skip_rate, exploration_score,
      time_preferences, timezone, events_processed, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      genre_scores = $2, artist_scores = $3,
      preferred_bpm_min = $4, preferred_bpm_max = $5,
      avg_listen_ratio = $6, skip_rate = $7, exploration_score = $8,
      time_preferences = $9, timezone = $10, events_processed = $11, updated_at = NOW()
  `, [
    userId,
    JSON.stringify(normalizedGenres),
    JSON.stringify(normalizedArtists),
    bpmMin, bpmMax,
    avgListenRatio, skipRate, exploration,
    JSON.stringify(timePrefs),
    userTimezone,
    events.length,
  ]);
}

// ─── Recommendation Algorithms ───

interface RecoTrack {
  id: string;
  title: string;
  artist: string;
  artist_slug: string;
  genre: string;
  cover_path: string;
  plays: number;
  score: number;
}

/**
 * Get or rebuild user taste profile (with cache TTL of 1 hour)
 */
async function getTasteProfile(userId: string) {
  const profile = await queryOne(`
    SELECT * FROM user_taste_profile
    WHERE user_id = $1 AND updated_at > NOW() - INTERVAL '1 hour'
  `, [userId]);

  if (profile) return profile;

  // Rebuild if stale or missing
  await rebuildTasteProfile(userId);
  return queryOne('SELECT * FROM user_taste_profile WHERE user_id = $1', [userId]);
}

/**
 * Score a track for a specific user based on their taste profile
 */
function scoreTrack(
  track: any,
  profile: any,
  recentTrackIds: Set<string>,
  skippedTrackIds: Set<string>,
): number {
  if (!profile) return track.plays * 0.001 + Math.random() * 0.05; // fallback: popularity + jitter

  const genreScores: Record<string, number> = profile.genre_scores || {};
  const artistScores: Record<string, number> = profile.artist_scores || {};
  const timePreferences: Record<string, number> = profile.time_preferences || {};
  const exploration: number = profile.exploration_score ?? 0.5;

  // Base components
  const genreAffinity = (genreScores[track.genre] || 0) / 100;           // 0-1
  const artistAffinity = (artistScores[track.artist_slug] || 0) / 100;   // 0-1
  const popularity = Math.min(1, (track.plays || 0) / 1000);             // 0-1 (cap at 1000)
  const freshness = track.created_at
    ? Math.max(0, 1 - (Date.now() - new Date(track.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000))
    : 0; // 1.0 if today, 0 if 30+ days old

  // BPM fit
  let bpmFit = 0.5; // neutral
  if (track.meta_bpm && profile.preferred_bpm_min && profile.preferred_bpm_max) {
    if (track.meta_bpm >= profile.preferred_bpm_min && track.meta_bpm <= profile.preferred_bpm_max) {
      bpmFit = 1.0;
    } else {
      const dist = Math.min(
        Math.abs(track.meta_bpm - profile.preferred_bpm_min),
        Math.abs(track.meta_bpm - profile.preferred_bpm_max)
      );
      bpmFit = Math.max(0, 1 - dist / 60);
    }
  }

  // Discovery bonus: tracks from genres/artists user hasn't explored much
  // High exploration_score → more weight to unknown genres
  const isUnknownGenre = !genreScores[track.genre];
  const isUnknownArtist = !artistScores[track.artist_slug];
  const discoveryBonus = (isUnknownGenre ? 0.5 : 0) + (isUnknownArtist ? 0.3 : 0);

  // Likes bonus: if user liked many tracks from this artist, boost
  const artistLikeness = (artistScores[track.artist_slug] || 0) > 70 ? 0.1 : 0;

  // Penalties
  const repetitionPenalty = recentTrackIds.has(track.id) ? 0.6 : 0;
  const skipPenalty = skippedTrackIds.has(track.id) ? 0.4 : 0;

  // Dynamic weights based on exploration score:
  // High exploration → less genre/artist weight, more discovery/random
  // Low exploration → strong genre/artist preference
  const explorationFactor = exploration; // 0-1
  const familiarWeight = 1 - explorationFactor * 0.4; // 0.6-1.0
  const discoveryWeight = explorationFactor * 0.3;     // 0-0.3
  const currentSlot = getTimeSlotForTimezone(new Date(), profile.timezone);
  const slotPreference = timePreferences[currentSlot] ?? 0.25;
  const timeMultiplier = 0.9 + slotPreference * 0.4; // 0.9 - 1.3

  // Final score
  const score =
    familiarWeight * (
      SCORE_WEIGHTS.genreAffinity * genreAffinity +
      SCORE_WEIGHTS.artistAffinity * artistAffinity +
      SCORE_WEIGHTS.bpmFit * bpmFit
    ) +
    SCORE_WEIGHTS.popularity * popularity +
    SCORE_WEIGHTS.freshness * freshness +
    discoveryWeight * (SCORE_WEIGHTS.discoveryBonus * discoveryBonus) +
    SCORE_WEIGHTS.artistLikeness * artistLikeness +
    SCORE_WEIGHTS.randomness * Math.random()
    - repetitionPenalty
    - skipPenalty;

  return score * timeMultiplier;
}

/**
 * Get recently played/skipped track IDs for penalty calculation
 */
async function getRecentHistory(userId: string): Promise<{ played: Set<string>; skipped: Set<string> }> {
  const played = await query(`
    SELECT DISTINCT track_id FROM user_events
    WHERE user_id = $1 AND event_type IN ('play', 'finish')
    AND created_at > NOW() - INTERVAL '24 hours'
  `, [userId]);

  const skipped = await query(`
    SELECT DISTINCT track_id FROM user_events
    WHERE user_id = $1 AND event_type IN ('skip', 'skip_early', 'skip_late', 'dislike')
    AND created_at > NOW() - INTERVAL '7 days'
  `, [userId]);

  return {
    played: new Set(played.map((r: any) => r.track_id)),
    skipped: new Set(skipped.map((r: any) => r.track_id)),
  };
}

// ────────────────────────────────────────────
// 1. FOR YOU (главная: персональный микс)
// ────────────────────────────────────────────

export async function forYou(userId: string | null, limit = 20): Promise<any[]> {
  const profile = userId ? await getTasteProfile(userId) : null;
  const history = userId
    ? await getRecentHistory(userId)
    : { played: new Set<string>(), skipped: new Set<string>() };
  const { played, skipped } = history;
  const topGenres = profile
    ? Object.entries(profile.genre_scores || {})
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([genre]) => genre)
    : [];
  const topArtists = profile
    ? Object.entries(profile.artist_scores || {})
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([artistSlug]) => artistSlug)
    : [];

  // Get candidate tracks from multiple pools for diversity
  const [recent, popular, random] = await Promise.all([
    // Pool 1: Recent tracks (fresh content)
    query(`SELECT * FROM tracks WHERE status = 'ready' ORDER BY created_at DESC LIMIT 200`),
    // Pool 2: Popular tracks (proven quality)
    query(`SELECT * FROM tracks WHERE status = 'ready' ORDER BY plays DESC LIMIT 200`),
    // Pool 3: Random tracks (exploration / long tail)
    query(`SELECT * FROM tracks WHERE status = 'ready' ORDER BY RANDOM() LIMIT 100`),
  ]);

  // Merge + deduplicate
  const seen = new Set<string>();
  const candidates: any[] = [];
  for (const pool of [recent, popular, random]) {
    for (const t of pool) {
      if (!seen.has(t.id)) { seen.add(t.id); candidates.push(t); }
    }
  }

  // Collaborative filtering: if user exists, find tracks liked by similar users
  let collabBoost = new Map<string, number>();
  if (userId && (topArtists.length > 0 || topGenres.length > 0)) {
    try {
      const collabTracks = await query(`
        WITH similar_users AS (
          SELECT
            ue.user_id,
            COUNT(*) AS overlap_events,
            COUNT(DISTINCT ue.artist_slug) FILTER (WHERE ue.artist_slug IS NOT NULL AND ue.artist_slug = ANY($2::text[])) AS artist_overlap,
            COUNT(DISTINCT ue.genre) FILTER (WHERE ue.genre IS NOT NULL AND ue.genre = ANY($3::text[])) AS genre_overlap
          FROM user_events ue
          WHERE ue.user_id != $1
            AND ue.created_at > NOW() - INTERVAL '30 days'
            AND (
              ue.artist_slug = ANY($2::text[])
              OR ue.genre = ANY($3::text[])
            )
          GROUP BY ue.user_id
          ORDER BY artist_overlap DESC, genre_overlap DESC, overlap_events DESC
          LIMIT 25
        )
        SELECT
          ue.track_id,
          SUM(
            su.artist_overlap * 1.5 +
            su.genre_overlap * 1.0 +
            su.overlap_events * 0.1 +
            CASE ue.event_type
              WHEN 'add_to_playlist' THEN 2.5
              WHEN 'like' THEN 2.0
              WHEN 'replay' THEN 1.8
              WHEN 'finish' THEN 1.2
              ELSE 0.5
            END
          ) AS collab_score,
          COUNT(DISTINCT ue.user_id) AS supporting_users
        FROM similar_users su
        JOIN user_events ue ON ue.user_id = su.user_id
        WHERE ue.track_id IS NOT NULL
          AND ue.event_type IN ('like', 'finish', 'replay', 'add_to_playlist')
          AND ue.created_at > NOW() - INTERVAL '30 days'
          AND ue.track_id NOT IN (
            SELECT DISTINCT track_id
            FROM user_events
            WHERE user_id = $1
              AND track_id IS NOT NULL
              AND event_type IN ('play', 'finish', 'skip', 'skip_early', 'skip_late', 'dislike')
          )
        GROUP BY ue.track_id
        ORDER BY collab_score DESC, supporting_users DESC
        LIMIT 50
      `, [userId, topArtists, topGenres]);

      const maxCollabScore = collabTracks.reduce((max: number, row: any) => {
        const score = Number(row.collab_score || 0);
        return Math.max(max, score);
      }, 0);

      for (const row of collabTracks) {
        const rawScore = Number(row.collab_score || 0);
        if (!row.track_id || rawScore <= 0) continue;
        const normalized = maxCollabScore > 0 ? rawScore / maxCollabScore : 0;
        collabBoost.set(row.track_id, normalized);
      }
    } catch { /* collaborative filtering is best-effort */ }
  }

  // Score each candidate
  const scored = candidates.map((t: any) => {
    let score = scoreTrack(t, profile, played, skipped);
    // Collaborative boost: tracks that similar users enjoy
    const collabScore = collabBoost.get(t.id);
    if (collabScore) score += 0.18 * collabScore;
    return { ...t, score };
  });

  // Sort by score
  scored.sort((a: any, b: any) => b.score - a.score);

  // Ensure diversity: max 2 tracks per artist, max 3 per genre
  const result: any[] = [];
  const artistCount = new Map<string, number>();
  const genreCount = new Map<string, number>();
  for (const t of scored) {
    const ac = artistCount.get(t.artist_slug) || 0;
    const gc = genreCount.get(t.genre) || 0;
    if (ac >= 2) continue;
    if (gc >= Math.max(3, Math.ceil(limit * 0.4))) continue; // max 40% from one genre
    artistCount.set(t.artist_slug, ac + 1);
    genreCount.set(t.genre, gc + 1);
    result.push(t);
    if (result.length >= limit) break;
  }

  return result;
}

// ────────────────────────────────────────────
// 2. NEXT TRACK (что поставить следующим)
// ────────────────────────────────────────────

export async function nextTrack(
  userId: string | null,
  currentTrackId: string,
  recentIds: string[] = [],
): Promise<any | null> {
  // Get current track info
  const current = await queryOne('SELECT * FROM tracks WHERE id = $1', [currentTrackId]);
  if (!current) return null;

  const recentSet = new Set(recentIds);
  recentSet.add(currentTrackId);

  // Analyse session context: what genres have been playing?
  let sessionGenres = new Map<string, number>();
  if (recentIds.length > 0) {
    const placeholders = recentIds.slice(-10).map((_, i) => `$${i + 1}`).join(',');
    const sessionTracks = await query(
      `SELECT genre FROM tracks WHERE id IN (${placeholders})`,
      recentIds.slice(-10)
    );
    for (const st of sessionTracks) {
      sessionGenres.set(st.genre, (sessionGenres.get(st.genre) || 0) + 1);
    }
  }

  // Determine if we should introduce variety (avoid genre fatigue)
  const currentGenreCount = sessionGenres.get(current.genre) || 0;
  const shouldDiversify = currentGenreCount >= 3; // 3+ same genre in a row → mix it up

  // Find candidates from multiple pools
  const [sameGenre, sameArtist, crossGenre] = await Promise.all([
    // Pool 1: Same genre (continuity)
    query(`
      SELECT * FROM tracks WHERE status = 'ready' AND id != $1 AND genre = $2
      ORDER BY plays DESC LIMIT 80
    `, [currentTrackId, current.genre]),
    // Pool 2: Same artist (flow)
    query(`
      SELECT * FROM tracks WHERE status = 'ready' AND id != $1 AND artist_slug = $2
      ORDER BY RANDOM() LIMIT 20
    `, [currentTrackId, current.artist_slug]),
    // Pool 3: Cross-genre (variety)
    query(`
      SELECT * FROM tracks WHERE status = 'ready' AND id != $1 AND genre != $2
      ORDER BY plays DESC LIMIT 50
    `, [currentTrackId, current.genre]),
  ]);

  // Merge + deduplicate
  const seen = new Set<string>();
  const all: any[] = [];
  for (const pool of [sameGenre, sameArtist, crossGenre]) {
    for (const t of pool) {
      if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
    }
  }

  // Score based on similarity + session context
  const scored = all.map((t: any) => {
    let sim = 0;

    // Same genre = strong signal (reduced if session has genre fatigue)
    if (t.genre === current.genre) {
      sim += shouldDiversify ? 0.15 : 0.35;
    } else if (shouldDiversify) {
      sim += 0.15; // bonus for different genre when diversifying
    }

    // Same artist bonus
    if (t.artist_slug === current.artist_slug) sim += 0.12;

    // BPM proximity (smooth energy transition)
    if (t.meta_bpm && current.meta_bpm) {
      const bpmDiff = Math.abs(t.meta_bpm - current.meta_bpm);
      sim += Math.max(0, 0.15 * (1 - bpmDiff / 40));
    }

    // Same album: next track from album (natural album flow)
    if (t.meta_album && current.meta_album && t.meta_album === current.meta_album) {
      // Prefer next track number in the album
      if (t.meta_track_number && current.meta_track_number) {
        const diff = t.meta_track_number - current.meta_track_number;
        if (diff === 1) sim += 0.25; // next track in album → strong boost
        else if (diff > 0 && diff <= 3) sim += 0.12;
      } else {
        sim += 0.08;
      }
    }

    // Popularity factor
    sim += Math.min(0.10, (t.plays || 0) / 5000);

    // Freshness
    if (t.created_at) {
      const ageMs = Date.now() - new Date(t.created_at).getTime();
      sim += Math.max(0, 0.05 * (1 - ageMs / (90 * 24 * 60 * 60 * 1000)));
    }

    // Random for variety
    sim += Math.random() * 0.08;

    // Penalties
    if (recentSet.has(t.id)) sim -= 0.7;

    return { ...t, score: sim };
  });

  // If we have a user, also factor in their taste
  if (userId) {
    const profile = await getTasteProfile(userId);
    if (profile) {
      const { skipped } = await getRecentHistory(userId);
      for (const t of scored) {
        t.score += scoreTrack(t, profile, recentSet, skipped) * 0.35;
      }
    }
  }

  scored.sort((a: any, b: any) => b.score - a.score);
  return scored[0] || null;
}

// ────────────────────────────────────────────
// 3. SIMILAR TRACKS (похожие на конкретный трек)
// ────────────────────────────────────────────

export async function similarTracks(trackId: string, limit = 10): Promise<any[]> {
  const track = await queryOne('SELECT * FROM tracks WHERE id = $1', [trackId]);
  if (!track) return [];

  const candidateQueries: Promise<any[]>[] = [
    query(`
      SELECT * FROM tracks
      WHERE status = 'ready' AND id != $1
      ORDER BY
        CASE WHEN genre = $2 THEN 0 ELSE 1 END,
        CASE WHEN artist_slug = $3 THEN 0 ELSE 1 END,
        plays DESC
      LIMIT 120
    `, [trackId, track.genre, track.artist_slug]),
  ];

  if (track.genre) {
    candidateQueries.push(query(`
      SELECT * FROM tracks
      WHERE status = 'ready'
        AND id != $1
        AND genre = $2
      ORDER BY created_at DESC
      LIMIT 60
    `, [trackId, track.genre]));
  }

  if (track.meta_bpm) {
    candidateQueries.push(query(`
      SELECT * FROM tracks
      WHERE status = 'ready'
        AND id != $1
        AND meta_bpm IS NOT NULL
        AND meta_bpm BETWEEN $2 AND $3
      ORDER BY plays DESC
      LIMIT 60
    `, [trackId, Math.max(40, track.meta_bpm - 15), Math.min(250, track.meta_bpm + 15)]));
  }

  const coListenedRows = await query(`
    WITH source_listeners AS (
      SELECT DISTINCT user_id
      FROM user_events
      WHERE track_id = $1
        AND event_type IN ('play', 'finish', 'like', 'replay', 'add_to_playlist')
        AND user_id IS NOT NULL
        AND created_at > NOW() - INTERVAL '120 days'
    )
    SELECT
      ue.track_id,
      COUNT(DISTINCT ue.user_id) AS shared_users,
      SUM(
        CASE ue.event_type
          WHEN 'add_to_playlist' THEN 2.5
          WHEN 'like' THEN 2.0
          WHEN 'replay' THEN 1.8
          WHEN 'finish' THEN 1.2
          ELSE 0.6
        END
      ) AS engagement_score
    FROM user_events ue
    JOIN source_listeners sl ON sl.user_id = ue.user_id
    WHERE ue.track_id IS NOT NULL
      AND ue.track_id != $1
      AND ue.event_type IN ('play', 'finish', 'like', 'replay', 'add_to_playlist')
      AND ue.created_at > NOW() - INTERVAL '120 days'
    GROUP BY ue.track_id
    HAVING COUNT(DISTINCT ue.user_id) >= 2
    ORDER BY shared_users DESC, engagement_score DESC
    LIMIT 60
  `, [trackId]);

  if (coListenedRows.length > 0) {
    const collabIds = coListenedRows.map((row: any) => row.track_id);
    const placeholders = collabIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    candidateQueries.push(query(
      `SELECT * FROM tracks WHERE status = 'ready' AND id IN (${placeholders})`,
      collabIds
    ));
  }

  const pools = await Promise.all(candidateQueries);
  const seen = new Set<string>();
  const candidates: any[] = [];
  for (const pool of pools) {
    for (const candidate of pool) {
      if (!seen.has(candidate.id)) {
        seen.add(candidate.id);
        candidates.push(candidate);
      }
    }
  }

  const collabMap = new Map<string, { sharedUsers: number; engagementScore: number }>();
  const maxSharedUsers = coListenedRows.reduce((max: number, row: any) => Math.max(max, Number(row.shared_users || 0)), 0);
  const maxEngagementScore = coListenedRows.reduce((max: number, row: any) => Math.max(max, Number(row.engagement_score || 0)), 0);
  for (const row of coListenedRows) {
    collabMap.set(row.track_id, {
      sharedUsers: Number(row.shared_users || 0),
      engagementScore: Number(row.engagement_score || 0),
    });
  }

  const scored = candidates.map((t: any) => {
    let sim = 0;

    if (t.genre === track.genre) sim += 0.40;
    if (t.artist_slug === track.artist_slug) sim += 0.20;

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

    const collab = collabMap.get(t.id);
    if (collab) {
      const sharedUsersScore = maxSharedUsers > 0 ? collab.sharedUsers / maxSharedUsers : 0;
      const engagementScore = maxEngagementScore > 0 ? collab.engagementScore / maxEngagementScore : 0;
      sim += sharedUsersScore * 0.22 + engagementScore * 0.12;
    }

    sim += Math.min(0.10, (t.plays || 0) / 5000);

    if (t.created_at) {
      const ageMs = Date.now() - new Date(t.created_at).getTime();
      sim += Math.max(0, 0.04 * (1 - ageMs / (180 * 24 * 60 * 60 * 1000)));
    }

    return { ...t, score: sim };
  });

  scored.sort((a: any, b: any) => b.score - a.score);
  return scored.slice(0, limit);
}

// ────────────────────────────────────────────
// 4. SIMILAR ARTISTS
// ────────────────────────────────────────────

export async function similarArtists(artistSlug: string, limit = 6): Promise<any[]> {
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
    if (!artist) return [];
    return query(`
      SELECT * FROM artists
      WHERE slug != $1 AND genre = $2 AND tracks_count > 0
      ORDER BY total_plays DESC
      LIMIT $3
    `, [artistSlug, artist.genre, limit]);
  }

  const ranked = coListened.slice(0, limit);
  const slugs = ranked.map((r: any) => r.artist_slug);
  const placeholders = slugs.map((_: any, i: number) => `$${i + 1}`).join(',');
  const artists = await query(`SELECT * FROM artists WHERE slug IN (${placeholders})`, slugs);
  const artistMap = new Map(artists.map((artist: any) => [artist.slug, artist]));

  return ranked
    .map((row: any) => artistMap.get(row.artist_slug))
    .filter(Boolean);
}

// ────────────────────────────────────────────
// 5. CONTINUE LISTENING (продолжить слушать)
// ────────────────────────────────────────────

export async function continueListening(userId: string, limit = 10): Promise<any[]> {
  // Tracks the user started but did not complete recently
  const recent = await query(`
    SELECT DISTINCT ON (ue.track_id) ue.track_id, ue.created_at,
           ue.event_type, ue.duration_listened, ue.track_duration
    FROM user_events ue
    WHERE ue.user_id = $1
      AND ue.track_id IS NOT NULL
      AND ue.event_type IN ('play', 'finish', 'skip', 'skip_early', 'skip_late')
      AND ue.created_at > NOW() - INTERVAL '7 days'
    ORDER BY ue.track_id, ue.created_at DESC
  `, [userId]);

  if (recent.length === 0) return [];

  const unfinished = recent.filter((row: any) => {
    const listened = Number(row.duration_listened || 0);
    const duration = Number(row.track_duration || 0);
    const ratio = duration > 0 ? listened / duration : 0;

    if (row.event_type === 'finish') return false;
    if (ratio >= 0.98) return false;
    if (ratio <= 0.05) return false;
    return true;
  });

  if (unfinished.length === 0) return [];

  const trackIds = unfinished.map((r: any) => r.track_id);
  const placeholders = trackIds.map((_: any, i: number) => `$${i + 1}`).join(',');
  const tracks = await query(
    `SELECT * FROM tracks WHERE id IN (${placeholders}) AND status = 'ready'`,
    trackIds
  );

  // Sort: most recently listened first
  const recentMap = new Map(unfinished.map((r: any) => [r.track_id, r]));
  tracks.sort((a: any, b: any) => {
    const ra = recentMap.get(a.id);
    const rb = recentMap.get(b.id);
    return new Date(rb?.created_at || 0).getTime() - new Date(ra?.created_at || 0).getTime();
  });

  return tracks.slice(0, limit);
}

// ────────────────────────────────────────────
// 6. NEW FOR YOU (новинки под ваш вкус)
// ────────────────────────────────────────────

export async function newForYou(userId: string | null, limit = 10): Promise<any[]> {
  if (!userId) {
    return query(`
      SELECT * FROM tracks WHERE status = 'ready'
      ORDER BY created_at DESC LIMIT $1
    `, [limit * 4]).then((candidates: any[]) => {
      const result: any[] = [];
      const seenAlbums = new Set<string>();
      for (const t of candidates) {
        const albumKey = (t.meta_album && t.meta_album.trim()) ? `${t.artist_slug}::${t.meta_album}` : '';
        if (albumKey && seenAlbums.has(albumKey)) continue;
        if (albumKey) seenAlbums.add(albumKey);
        result.push(t);
        if (result.length >= limit) break;
      }
      return result;
    });
  }

  const profile = await getTasteProfile(userId);
  const history = await getRecentHistory(userId);
  const { played, skipped } = history;

  let topGenres: string[] = [];
  let topArtists: string[] = [];

  if (profile) {
    const genreScores: Record<string, number> = profile.genre_scores || {};
    const artistScores: Record<string, number> = profile.artist_scores || {};
    topGenres = Object.entries(genreScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);
    topArtists = Object.entries(artistScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([slug]) => slug);
  }

  if (topGenres.length === 0) {
    const liked = await query(`
      SELECT DISTINCT t.genre FROM tracks t
      JOIN users u ON t.id = ANY(u.liked_tracks)
      WHERE u.id = $1 AND t.genre IS NOT NULL
      LIMIT 5
    `, [userId]);
    if (liked.length > 0) {
      topGenres = liked.map((r: any) => r.genre);
    } else {
      const playedGenres = await query(`
        SELECT t.genre, COUNT(*) as cnt FROM user_events ue
        JOIN tracks t ON t.id = ue.track_id
        WHERE ue.user_id = $1 AND ue.event_type IN ('play','finish','replay','like')
          AND t.genre IS NOT NULL
        GROUP BY t.genre ORDER BY cnt DESC LIMIT 5
      `, [userId]);
      topGenres = playedGenres.map((r: any) => r.genre);
    }
  }

  if (topArtists.length === 0) {
    const playedArtists = await query(`
      SELECT t.artist_slug, COUNT(*) as cnt FROM user_events ue
      JOIN tracks t ON t.id = ue.track_id
      WHERE ue.user_id = $1 AND ue.event_type IN ('play','finish','replay','like')
        AND t.artist_slug IS NOT NULL
      GROUP BY t.artist_slug ORDER BY cnt DESC LIMIT 5
    `, [userId]);
    topArtists = playedArtists.map((r: any) => r.artist_slug);
  }

  if (topGenres.length === 0 && topArtists.length === 0) {
    return query(`
      SELECT * FROM tracks WHERE status = 'ready'
      ORDER BY created_at DESC LIMIT $1
    `, [limit * 4]).then((rows: any[]) => rows.slice(0, limit));
  }

  const queries: Promise<any[]>[] = [
    query(`
      SELECT * FROM tracks
      WHERE status = 'ready'
        AND created_at > NOW() - INTERVAL '45 days'
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit * 20]),
  ];

  if (topGenres.length > 0) {
    const placeholders = topGenres.map((_, i) => `$${i + 1}`).join(',');
    queries.push(query(`
      SELECT * FROM tracks
      WHERE status = 'ready'
        AND created_at > NOW() - INTERVAL '45 days'
        AND genre IN (${placeholders})
      ORDER BY created_at DESC
      LIMIT $${topGenres.length + 1}
    `, [...topGenres, limit * 12]));
  }

  if (topArtists.length > 0) {
    const placeholders = topArtists.map((_, i) => `$${i + 1}`).join(',');
    queries.push(query(`
      SELECT * FROM tracks
      WHERE status = 'ready'
        AND created_at > NOW() - INTERVAL '45 days'
        AND artist_slug IN (${placeholders})
      ORDER BY created_at DESC
      LIMIT $${topArtists.length + 1}
    `, [...topArtists, limit * 10]));
  }

  const pools = await Promise.all(queries);
  const seen = new Set<string>();
  const candidates: any[] = [];
  for (const pool of pools) {
    for (const track of pool) {
      if (!seen.has(track.id)) {
        seen.add(track.id);
        candidates.push(track);
      }
    }
  }

  const topGenreSet = new Set(topGenres);
  const topArtistSet = new Set(topArtists);
  const scored = candidates.map((track: any) => {
    let score = scoreTrack(track, profile, played, skipped);
    if (topGenreSet.has(track.genre)) score += 0.12;
    if (topArtistSet.has(track.artist_slug)) score += 0.18;
    if (track.created_at) {
      const ageMs = Date.now() - new Date(track.created_at).getTime();
      const freshBoost = Math.max(0, 1 - ageMs / (45 * 24 * 60 * 60 * 1000));
      score += freshBoost * 0.35;
    }
    return { ...track, score };
  });

  scored.sort((a: any, b: any) => b.score - a.score);

  const result: any[] = [];
  const seenAlbums = new Set<string>();
  const seenArtists = new Map<string, number>();
  for (const track of scored) {
    const albumKey = (track.meta_album && track.meta_album.trim()) ? `${track.artist_slug}::${track.meta_album}` : '';
    if (albumKey && seenAlbums.has(albumKey)) continue;
    const artistCount = seenArtists.get(track.artist_slug) || 0;
    if (artistCount >= 2) continue;
    if (albumKey) seenAlbums.add(albumKey);
    seenArtists.set(track.artist_slug, artistCount + 1);
    result.push(track);
    if (result.length >= limit) break;
  }

  return result;
}

// ────────────────────────────────────────────
// 7. TRENDING IN YOUR GENRES
// ────────────────────────────────────────────

export async function trendingForYou(userId: string, limit = 10): Promise<any[]> {
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

  const genreScores: Record<string, number> = profile.genre_scores || {};
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

export async function rediscover(userId: string, limit = 10): Promise<any[]> {
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

export async function getUserTasteSummary(userId: string) {
  const profile = await getTasteProfile(userId);
  if (!profile) return null;

  const genreScores: Record<string, number> = profile.genre_scores || {};
  const artistScoresRaw: Record<string, number> = profile.artist_scores || {};

  // Top 5 genres
  const topGenres = Object.entries(genreScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, score]) => ({ genre, count: score }));

  // Top 5 artists — resolve slugs to names
  const topArtistSlugs = Object.entries(artistScoresRaw)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let topArtists: { slug: string; name: string; count: number }[] = [];
  if (topArtistSlugs.length > 0) {
    const slugList = topArtistSlugs.map(([s]) => s);
    const placeholders = slugList.map((_, i) => `$${i + 1}`).join(',');
    const artists = await query(`SELECT slug, name FROM artists WHERE slug IN (${placeholders})`, slugList);
    const nameMap = new Map(artists.map((a: any) => [a.slug, a.name]));
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
