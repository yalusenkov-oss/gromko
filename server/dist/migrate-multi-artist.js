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
import { query, queryOne, execute, initSchema, closeDb } from './db.js';
import { v4 as uuid } from 'uuid';
import { parseArtistNames } from './parse-artists.js';
import { slugify } from './slugify.js';
async function ensureArtist(name, genre) {
    const slug = slugify(name);
    if (!slug)
        return { id: '', slug: 'unknown' };
    const existing = await queryOne('SELECT id FROM artists WHERE slug = $1', [slug]);
    if (existing)
        return { id: existing.id, slug };
    const id = uuid();
    await execute(`
    INSERT INTO artists (id, name, slug, genre, tracks_count, total_plays)
    VALUES ($1, $2, $3, $4, 0, 0)
  `, [id, name, slug, genre]);
    console.log(`  ✅ Created artist: ${name} (${slug})`);
    return { id, slug };
}
async function main() {
    console.log('\n  🔄 GROMKO Multi-Artist Migration\n');
    // Step 0: Ensure schema (creates track_artists table if needed)
    await initSchema();
    // Step 1: Get all tracks
    const allTracks = await query('SELECT id, artist, artist_slug, genre FROM tracks');
    console.log(`  📊 Total tracks: ${allTracks.length}`);
    // Step 2: Process each track
    let splitCount = 0;
    let linkCount = 0;
    for (const track of allTracks) {
        const names = parseArtistNames(track.artist);
        if (names.length > 1) {
            splitCount++;
            console.log(`  🔀 "${track.artist}" → [${names.join(' | ')}]`);
        }
        // Ensure all individual artists exist
        const artistEntries = [];
        for (const name of names) {
            const entry = await ensureArtist(name, track.genre);
            artistEntries.push(entry);
        }
        // Update track's primary artist_slug to first artist
        if (artistEntries.length > 0 && artistEntries[0].slug !== track.artist_slug) {
            await execute('UPDATE tracks SET artist_slug = $1 WHERE id = $2', [artistEntries[0].slug, track.id]);
        }
        // Populate junction table
        for (let i = 0; i < artistEntries.length; i++) {
            if (!artistEntries[i].id)
                continue;
            const existing = await queryOne('SELECT 1 FROM track_artists WHERE track_id = $1 AND artist_id = $2', [track.id, artistEntries[i].id]);
            if (!existing) {
                await execute('INSERT INTO track_artists (track_id, artist_id, position) VALUES ($1, $2, $3)', [track.id, artistEntries[i].id, i]);
                linkCount++;
            }
        }
    }
    // Step 3: Delete combined-name artist entries that are no longer needed
    // These are artists like "Платина, ЕГОР КРИД" — their slug will contain commas-turned-to-dashes
    const combinedArtists = await query(`SELECT id, name, slug FROM artists WHERE name LIKE '%,%'`);
    let deletedCount = 0;
    for (const artist of combinedArtists) {
        // Check if any tracks still reference this combined artist via artist_slug
        const tracksUsing = await queryOne('SELECT COUNT(*) as c FROM tracks WHERE artist_slug = $1', [artist.slug]);
        const junctionUsing = await queryOne('SELECT COUNT(*) as c FROM track_artists WHERE artist_id = $1', [artist.id]);
        if (Number(tracksUsing?.c || 0) === 0 && Number(junctionUsing?.c || 0) === 0) {
            await execute('DELETE FROM artists WHERE id = $1', [artist.id]);
            console.log(`  🗑️  Deleted combined artist: "${artist.name}"`);
            deletedCount++;
        }
    }
    // Step 4: Recalculate artist track counts and total plays
    await execute(`
    UPDATE artists SET
      tracks_count = (
        SELECT COUNT(DISTINCT t.id) FROM tracks t
        LEFT JOIN track_artists ta ON ta.track_id = t.id
        WHERE (ta.artist_id = artists.id OR t.artist_slug = artists.slug)
          AND t.status = 'ready'
      ),
      total_plays = (
        SELECT COALESCE(SUM(t.plays), 0) FROM tracks t
        LEFT JOIN track_artists ta ON ta.track_id = t.id
        WHERE (ta.artist_id = artists.id OR t.artist_slug = artists.slug)
          AND t.status = 'ready'
      )
  `);
    // Summary
    console.log('\n  ╔══════════════════════════════════════════════════╗');
    console.log('  ║         📊  Migration Results                     ║');
    console.log('  ╠══════════════════════════════════════════════════╣');
    console.log(`  ║  Tracks processed:    ${String(allTracks.length).padStart(5)}                      ║`);
    console.log(`  ║  Tracks with multi:   ${String(splitCount).padStart(5)}                      ║`);
    console.log(`  ║  Junction links added: ${String(linkCount).padStart(4)}                      ║`);
    console.log(`  ║  Combined artists del: ${String(deletedCount).padStart(4)}                      ║`);
    console.log('  ╚══════════════════════════════════════════════════╝');
    // Show final artist list
    const artists = await query('SELECT name, slug, tracks_count FROM artists ORDER BY tracks_count DESC');
    console.log('\n  📋 Final artist list:');
    for (const a of artists) {
        console.log(`     ${a.name} (${a.slug}) — ${a.tracks_count} tracks`);
    }
    await closeDb();
    console.log('\n  ✅ Migration complete!\n');
}
main().catch(async (err) => {
    console.error('💥 Migration error:', err);
    await closeDb().catch(() => { });
    process.exit(1);
});
//# sourceMappingURL=migrate-multi-artist.js.map