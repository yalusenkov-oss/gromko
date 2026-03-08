import { query } from './db.js';
import { parseArtistNames } from './parse-artists.js';
import { slugify } from './slugify.js';

export interface ExistingTrackMatch {
  id: string;
  title: string;
  artist: string;
}

function normalizeText(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasArtistOverlap(a: string, b: string): boolean {
  const aa = parseArtistNames(a).map(normalizeText).filter(Boolean);
  const bb = parseArtistNames(b).map(normalizeText).filter(Boolean);
  if (aa.length === 0 || bb.length === 0) return false;
  const setB = new Set(bb);
  return aa.some(x => setB.has(x));
}

export async function findExistingTrackByArtistAndTitle(
  title: string,
  artistRaw: string,
): Promise<ExistingTrackMatch | null> {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return null;

  const artistNames = parseArtistNames(artistRaw || '').filter(Boolean);
  const slugs = Array.from(new Set(artistNames.map(slugify).filter(Boolean)));
  const fallbackArtist = artistNames[0] || artistRaw || '';

  const rows = await query<ExistingTrackMatch>(`
    SELECT x.id, x.title, x.artist
    FROM (
      SELECT DISTINCT t.id, t.title, t.artist, t.created_at
      FROM tracks t
      LEFT JOIN track_artists ta ON ta.track_id = t.id
      LEFT JOIN artists a ON a.id = ta.artist_id
      WHERE t.status = 'ready'
        AND (
          (array_length($1::text[], 1) IS NOT NULL AND (t.artist_slug = ANY($1::text[]) OR a.slug = ANY($1::text[])))
          OR lower(t.artist) = lower($2)
        )
    ) x
    ORDER BY x.created_at DESC
    LIMIT 250
  `, [slugs, fallbackArtist]);

  for (const row of rows) {
    if (normalizeText(row.title) !== normalizedTitle) continue;
    if (hasArtistOverlap(row.artist, artistRaw) || normalizeText(row.artist) === normalizeText(artistRaw)) {
      return row;
    }
  }

  return null;
}
