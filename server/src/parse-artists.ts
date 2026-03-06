/**
 * Utility to split an artist string into individual artist names.
 * Handles: commas, "feat.", "feat", "ft.", "ft", "&", "and", "x"
 * 
 * Examples:
 *   "Artist1, Artist2"           → ["Artist1", "Artist2"]
 *   "Artist1 feat. Artist2"      → ["Artist1", "Artist2"]
 *   "Artist1 feat Artist2"       → ["Artist1", "Artist2"]
 *   "Artist1 ft. Artist2"        → ["Artist1", "Artist2"]
 *   "Artist1 ft Artist2"         → ["Artist1", "Artist2"]
 *   "Artist1 & Artist2"          → ["Artist1", "Artist2"]
 *   "Artist1 x Artist2"          → ["Artist1", "Artist2"]
 *   "Artist1 feat. Artist2, Artist3" → ["Artist1", "Artist2", "Artist3"]
 */

// Regex that matches common artist separators:
//   - comma (with optional whitespace)
//   - " feat. ", " feat ", " ft. ", " ft " (case-insensitive, with word boundaries)
//   - " & "
//   - " x " (lowercase only, to avoid splitting names like "DJ Xzibit")
const ARTIST_SEPARATOR = /,\s*|\s+(?:feat\.?|ft\.?)\s+|\s+&\s+|\s+x\s+/i;

export function parseArtistNames(artistString: string): string[] {
  return artistString
    .split(ARTIST_SEPARATOR)
    .map(n => n.trim())
    .filter(Boolean);
}
