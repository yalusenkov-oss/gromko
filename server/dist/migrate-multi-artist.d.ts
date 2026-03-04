#!/usr/bin/env tsx
/**
 * GROMKO Migration: Split combined artists into separate entries
 *
 * This script:
 * 1. Creates the track_artists junction table if not exists
 * 2. Finds all tracks where `artist` contains ", " / "feat" / "ft" / "&" (multi-artist)
 * 3. Splits into individual artists, creates missing artist rows
 * 4. Populates the track_artists junction table for ALL tracks
 * 5. Updates artist_slug on tracks to point to the FIRST (primary) artist
 * 6. Removes duplicate/combined artist entries (e.g., "Платина, ЕГОР КРИД")
 * 7. Recalculates artist track counts
 *
 * Usage:
 *   cd server && npx tsx src/migrate-multi-artist.ts
 */
import 'dotenv/config';
//# sourceMappingURL=migrate-multi-artist.d.ts.map