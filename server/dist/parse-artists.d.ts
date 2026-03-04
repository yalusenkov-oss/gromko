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
export declare function parseArtistNames(artistString: string): string[];
//# sourceMappingURL=parse-artists.d.ts.map