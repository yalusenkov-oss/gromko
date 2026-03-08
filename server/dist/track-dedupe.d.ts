export interface ExistingTrackMatch {
    id: string;
    title: string;
    artist: string;
}
export declare function findExistingTrackByArtistAndTitle(title: string, artistRaw: string): Promise<ExistingTrackMatch | null>;
//# sourceMappingURL=track-dedupe.d.ts.map