/**
 * GROMKO Spotify Import Module
 *
 * Integrates with SpotiFLAC Go microservice to:
 * 1. Fetch Spotify metadata (tracks, albums)
 * 2. Download audio files via Tidal/Qobuz/Deezer/Amazon
 * 3. Feed downloaded files into the GROMKO audio processing pipeline
 *
 * The SpotiFLAC Go server must be running on SPOTIFLAC_URL (default http://localhost:3099)
 */
export interface SpotifyTrackMeta {
    spotify_id: string;
    name: string;
    artists: string;
    album_name: string;
    album_artist?: string;
    duration_ms: number;
    images: string;
    release_date: string;
    track_number: number;
    total_tracks?: number;
    disc_number?: number;
    total_discs?: number;
    is_explicit?: boolean;
    external_urls?: string;
    plays?: string;
    copyright?: string;
    publisher?: string;
    preview_url?: string;
    genre?: string;
    genres?: string[] | string;
}
export interface SpotifyAlbumMeta {
    album_info: {
        total_tracks: number;
        name: string;
        release_date: string;
        artists: string;
        images: string;
    };
    track_list: SpotifyTrackMeta[];
}
export interface SpotifyImportJob {
    id: string;
    spotifyUrl: string;
    type: 'track' | 'album';
    status: 'pending' | 'fetching_metadata' | 'downloading' | 'processing' | 'done' | 'error';
    service: string;
    progress: number;
    totalTracks: number;
    completedTracks: number;
    failedTracks: number;
    tracks: SpotifyImportTrack[];
    error?: string;
    startedAt: string;
    finishedAt?: string;
}
export interface SpotifyImportTrack {
    spotifyId: string;
    title: string;
    artist: string;
    album: string;
    status: 'pending' | 'downloading' | 'processing' | 'done' | 'error';
    gromkoTrackId?: string;
    error?: string;
}
export declare function getJob(id: string): SpotifyImportJob | undefined;
export declare function getAllJobs(): SpotifyImportJob[];
export declare function checkSpotiflacHealth(): Promise<boolean>;
export declare function fetchSpotifyMetadata(spotifyUrl: string): Promise<any>;
export declare function searchSpotify(query: string, limit?: number): Promise<any>;
/**
 * Start a Spotify import job. Returns the job ID immediately,
 * the import runs in the background.
 */
export declare function startSpotifyImport(spotifyUrl: string, service?: string, genre?: string): string;
/**
 * Submit a Spotify track by URL. For regular users, creates a submission entry
 * that goes through moderation. For admins, directly imports the track.
 * Returns job status info for polling.
 */
export declare function startSpotifySubmission(spotifyUrl: string, userId: string, isAdmin: boolean, genre?: string, service?: string): string;
//# sourceMappingURL=spotify-import.d.ts.map