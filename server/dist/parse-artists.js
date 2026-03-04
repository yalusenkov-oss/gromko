/**
 * Utility to split an artist string into individual artist names.
 * Handles: commas, "feat.", "feat", "ft.", "ft", "&", "and"
 *
 * Examples:
 *   "Artist1, Artist2"           → ["Artist1", "Artist2"]
 *   "Artist1 feat. Artist2"      → ["Artist1", "Artist2"]
 *   "Artist1 feat Artist2"       → ["Artist1", "Artist2"]
 *   "Artist1 ft. Artist2"        → ["Artist1", "Artist2"]
 *   "Artist1 ft Artist2"         → ["Artist1", "Artist2"]
 *   "Artist1 & Artist2"          → ["Artist1", "Artist2"]
 *   "Artist1 feat. Artist2, Artist3" → ["Artist1", "Artist2", "Artist3"]
 */
// Regex that matches common artist separators:
//   - comma (with optional whitespace)
//   - " feat. ", " feat ", " ft. ", " ft " (case-insensitive, with word boundaries)
//   - " & "
const ARTIST_SEPARATOR = /,\s*|\s+(?:feat\.?|ft\.?)\s+|\s+&\s+/i;
export function parseArtistNames(artistString) {
    return artistString
        .split(ARTIST_SEPARATOR)
        .map(n => n.trim())
        .filter(Boolean);
}
//# sourceMappingURL=parse-artists.js.map