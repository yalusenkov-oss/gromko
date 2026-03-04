/**
 * React hook that bridges the Audio Engine with the Zustand store.
 * 
 * Синхронизирует реальное воспроизведение аудио со стейтом UI.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStore, Track } from '../store';
import { audioEngine, AudioTrack, EngineState } from './engine';

const API_BASE = ''; // Uses Vite proxy

/** Convert store Track to AudioEngine track format */
function toAudioTrack(track: Track): AudioTrack {
  // If the track has server-side streams, use them
  // Otherwise fall back to the API streaming endpoint
  const cover = track.cover?.startsWith('http')
    ? track.cover
    : track.cover?.startsWith('/')
      ? `${API_BASE}${track.cover}`
      : track.cover;

  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    cover: cover || '',
    duration: track.duration,
    streams: track.streams as AudioTrack['streams'],
    hlsMaster: track.hlsMaster,
    waveform: track.waveform,
  };
}

export function useAudioEngine() {
  const {
    player,
    setProgress,
    setVolume: setStoreVolume,
  } = useStore();

  const lastTrackIdRef = useRef<string | null>(null);
  const isEnginePlayingRef = useRef(false);

  // ─── Sync store -> engine ───
  // When store says "play this track", tell the engine
  useEffect(() => {
    if (!player.currentTrack) return;

    const trackId = player.currentTrack.id;

    // Only trigger engine if it's a new track
    if (trackId !== lastTrackIdRef.current) {
      lastTrackIdRef.current = trackId;

      const audioTrack = toAudioTrack(player.currentTrack);
      const queueAudio = player.queue.map(toAudioTrack);

      audioEngine.play(audioTrack, queueAudio);
    }
  }, [player.currentTrack?.id]);

  // Sync play/pause state
  useEffect(() => {
    if (!player.currentTrack) return;

    const engineState = audioEngine.getState();
    if (player.isPlaying && engineState.state === 'paused') {
      audioEngine.resume();
    } else if (!player.isPlaying && engineState.state === 'playing') {
      audioEngine.pause();
    }
  }, [player.isPlaying]);

  // Sync volume
  useEffect(() => {
    audioEngine.setVolume(player.volume);
  }, [player.volume]);

  // Sync shuffle → engine
  useEffect(() => {
    audioEngine.setShuffle(player.shuffle);
  }, [player.shuffle]);

  // Sync repeat → engine
  useEffect(() => {
    audioEngine.setRepeat(player.repeat);
  }, [player.repeat]);

  // ─── Sync engine -> store ───
  // Update store progress from real audio playback
  // AND sync track changes when engine auto-advances (e.g. track ended → next)
  useEffect(() => {
    const unsubscribe = audioEngine.subscribe((state: EngineState) => {
      // Update progress in store
      if (state.duration > 0 && state.state === 'playing') {
        setProgress(state.progress);
      }

      // When engine auto-advances to a new track, sync store's currentTrack
      if (state.track && state.track.id !== lastTrackIdRef.current) {
        lastTrackIdRef.current = state.track.id;
        const storeState = useStore.getState();
        // Skip if store already has this track
        if (storeState.player.currentTrack?.id === state.track.id) return;

        const matchedTrack = storeState.player.queue.find(
          (t: Track) => t.id === state.track!.id
        );
        if (matchedTrack) {
          useStore.setState((s) => ({
            player: { ...s.player, currentTrack: matchedTrack, progress: 0, isPlaying: true }
          }));
        } else {
          // Track not in store queue — build a minimal Track from engine's AudioTrack
          const et = state.track!;
          const fallbackTrack: Track = {
            id: et.id,
            title: et.title,
            artist: et.artist,
            artistSlug: '',
            genre: '',
            year: 0,
            cover: et.cover,
            duration: et.duration,
            plays: 0,
            likes: 0,
          };
          useStore.setState((s) => ({
            player: { ...s.player, currentTrack: fallbackTrack, progress: 0, isPlaying: true }
          }));
        }
      }

      // Track play/pause state
      const isPlaying = state.state === 'playing';
      if (isPlaying !== isEnginePlayingRef.current) {
        isEnginePlayingRef.current = isPlaying;
        // Only update store if it differs
        const storeIsPlaying = useStore.getState().player.isPlaying;
        if (isPlaying !== storeIsPlaying) {
          useStore.setState((s) => ({
            player: { ...s.player, isPlaying }
          }));
        }
      }
    });

    return unsubscribe;
  }, []);

  // ─── Enhanced controls that go through the engine ───

  const engineSeek = useCallback((progress: number) => {
    audioEngine.seek(progress);
    setProgress(progress);
  }, [setProgress]);

  const engineSetVolume = useCallback((v: number) => {
    audioEngine.setVolume(v);
    setStoreVolume(v);
  }, [setStoreVolume]);

  const engineNext = useCallback(() => {
    // Engine handles track advancement; store sync happens via subscribe callback
    audioEngine.next();
  }, []);

  const enginePrev = useCallback(() => {
    // Engine handles track reversal; store sync happens via subscribe callback
    audioEngine.prev();
  }, []);

  return {
    seek: engineSeek,
    setVolume: engineSetVolume,
    next: engineNext,
    prev: enginePrev,
    engine: audioEngine,
  };
}
