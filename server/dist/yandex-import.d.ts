export interface YandexImportTrack {
    sourceId: string;
    title: string;
    artist: string;
    album: string;
    status: 'pending' | 'downloading' | 'processing' | 'done' | 'error';
    gromkoTrackId?: string;
    error?: string;
}
export interface YandexImportJob {
    id: string;
    sourceUrl: string;
    type: 'track' | 'album' | 'playlist' | 'artist' | 'mixed';
    status: 'pending' | 'downloading' | 'processing' | 'done' | 'error';
    progress: number;
    totalTracks: number;
    completedTracks: number;
    failedTracks: number;
    tracks: YandexImportTrack[];
    error?: string;
    startedAt: string;
    finishedAt?: string;
}
export declare function getYandexJob(id: string): YandexImportJob | undefined;
export declare function checkYandexImportHealth(): Promise<{
    available: boolean;
    reason?: string;
}>;
export declare function startYandexSubmission(sourceUrl: string, userId: string, isAdmin: boolean, genre?: string): string;
//# sourceMappingURL=yandex-import.d.ts.map