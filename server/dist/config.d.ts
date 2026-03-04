export declare const PATHS: {
    /** Root data directory */
    data: string;
    /** Uploaded original audio files before processing */
    uploads: string;
    /** Processed audio output: HLS segments, transcoded files */
    audio: string;
    /** Cover art (original + resized) */
    covers: string;
    /** Waveform JSON cache */
    waveforms: string;
    /** Temp directory for processing */
    temp: string;
};
/** Per-track audio directory: data/audio/{trackId}/ */
export declare function trackAudioDir(trackId: string): string;
/** Per-track HLS directory: data/audio/{trackId}/hls/ */
export declare function trackHlsDir(trackId: string): string;
/** Ensure all required directories exist */
export declare function ensureDirs(): void;
/** Server config */
export declare const CONFIG: {
    port: number;
    host: string;
    /** Max upload size in bytes (500MB — WAV 24bit/96kHz can be large) */
    maxUploadSize: number;
    /** Allowed audio MIME types */
    allowedAudioMimes: string[];
    /** Allowed audio extensions */
    allowedAudioExts: string[];
    /** Allowed cover MIME types */
    allowedImageMimes: string[];
    /** Transcoding quality presets — like Spotify/Yandex Music */
    qualities: {
        readonly low: {
            readonly label: "Экономный";
            readonly bitrate: "64k";
            readonly codec: "aac";
            readonly sampleRate: 22050;
            readonly channels: 1;
            readonly suffix: "_low";
        };
        readonly medium: {
            readonly label: "Стандартный";
            readonly bitrate: "128k";
            readonly codec: "aac";
            readonly sampleRate: 44100;
            readonly channels: 2;
            readonly suffix: "_medium";
        };
        readonly high: {
            readonly label: "Высокое";
            readonly bitrate: "256k";
            readonly codec: "aac";
            readonly sampleRate: 44100;
            readonly channels: 2;
            readonly suffix: "_high";
        };
        readonly lossless: {
            readonly label: "Без потерь";
            readonly bitrate: "0";
            readonly codec: "flac";
            readonly sampleRate: 44100;
            readonly channels: 2;
            readonly suffix: "_lossless";
        };
    };
    /** HLS segment duration in seconds */
    hlsSegmentDuration: number;
    /** Waveform: number of peaks for visualization */
    waveformPeaks: number;
    /** Cover art sizes to generate */
    coverSizes: {
        name: string;
        width: number;
        height: number;
    }[];
};
//# sourceMappingURL=config.d.ts.map