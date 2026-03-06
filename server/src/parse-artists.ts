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
//   - " x " (lowercase only, to avoid splitting names like "DJ Xzibit" or "ARTIST X")
//   Two-step: first split by case-insensitive patterns (feat/ft), then by " x " separately
const ARTIST_SEPARATOR_CI = /,\s*|\s+(?:feat\.?|ft\.?)\s+|\s+&\s+/i;

export function parseArtistNames(artistString: string): string[] {
  // First split by case-insensitive separators (comma, feat, ft, &)
  const parts = artistString.split(ARTIST_SEPARATOR_CI);
  
  // Then split each part by lowercase " x " only (case-sensitive)
  const result: string[] = [];
  for (const part of parts) {
    const xParts = part.split(/\s+x\s+/);
    for (const p of xParts) {
      const trimmed = p.trim();
      if (trimmed) result.push(trimmed);
    }
  }
  return result;
}
