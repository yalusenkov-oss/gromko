/**
 * Global room listener hook.
 * Runs at the App level so the room connection stays alive when navigating away from the host's page.
 * Handles: sync polling, desync detection, auto-leave on room close.
 */

import { useEffect, useRef } from 'react';
import { useStore, type Track } from '../store';
import { apiUrl } from '../lib/api';
import { audioEngine } from '../audio/engine';

function getToken(): string | null {
  return localStorage.getItem('gromko_token');
}

export function useRoomListener() {
  const {
    joinedRoomHostId,
    joinedRoomInviteToken,
    joinedRoomDesync,
    setJoinedRoom,
    setJoinedRoomDesync,
    setJoinedRoomState,
    playTrack,
  } = useStore();

  // Track the last known trackId from the host to detect host track changes gracefully
  const lastHostTrackId = useRef<string | null>(null);
  const trackChangeGrace = useRef(false);

  // ── Sync with room while joined ──
  useEffect(() => {
    if (!joinedRoomHostId) return;

    const syncRoom = async () => {
      try {
        const token = getToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (joinedRoomInviteToken) headers['X-Room-Token'] = joinedRoomInviteToken;
        const res = await fetch(apiUrl(`/listening-room/${joinedRoomHostId}`), { headers });
        if (!res.ok) {
          // Room closed by host
          setJoinedRoom(null);
          audioEngine.pause();
          return;
        }
        const d = await res.json();
        setJoinedRoomState({
          trackId: d.trackId,
          trackTitle: d.trackTitle,
          trackArtist: d.trackArtist,
          trackCover: d.trackCover,
          progress: d.progress,
          isPlaying: d.isPlaying,
          listenersCount: d.listenersCount,
          hostName: d.hostName || '',
        });

        // Don't force-sync if user manually desynced
        if (joinedRoomDesync) return;

        const { player: p } = useStore.getState();

        // Host changed track — this is normal, not a desync
        if (d.trackId && p.currentTrack?.id !== d.trackId) {
          // Mark grace period so the engine subscribe doesn't fire a false desync
          trackChangeGrace.current = true;
          lastHostTrackId.current = d.trackId;

          const allTracks = useStore.getState().tracks;
          let track: Track | undefined = allTracks.find((t: Track) => t.id === d.trackId);
          if (!track) {
            try {
              const tRes = await fetch(apiUrl(`/tracks/${d.trackId}`));
              if (tRes.ok) track = await tRes.json();
            } catch { /* ignore */ }
          }
          if (!track) {
            track = {
              id: d.trackId, title: d.trackTitle, artist: d.trackArtist,
              artistSlug: '', genre: '', year: 0, cover: d.trackCover,
              duration: 0, plays: 0, likes: 0,
            };
          }
          playTrack(track, [track]);
          setTimeout(() => {
            if (d.progress > 0) audioEngine.seek(d.progress);
            trackChangeGrace.current = false;
          }, 1200);
        } else {
          lastHostTrackId.current = d.trackId;
          // Same track — sync position (if drift > 5%)
          const engineProgress = audioEngine.getState().progress;
          const drift = Math.abs(engineProgress - (d.progress || 0));
          if (drift > 0.05 && d.progress > 0) {
            audioEngine.seek(d.progress);
          }
          // Sync play/pause state
          if (d.isPlaying && !p.isPlaying) {
            audioEngine.resume();
          } else if (!d.isPlaying && p.isPlaying) {
            audioEngine.pause();
          }
        }
      } catch { /* network error, try again next cycle */ }
    };

    syncRoom();
    const iv = setInterval(syncRoom, 3000);
    return () => clearInterval(iv);
  }, [joinedRoomHostId, joinedRoomInviteToken, joinedRoomDesync]);

  // ── Detect user desync (manual pause/seek/track change) ──
  useEffect(() => {
    if (!joinedRoomHostId || joinedRoomDesync) return;

    const unsub = audioEngine.subscribe((engineState) => {
      // During grace period (host changed track, we're switching), don't detect desync
      if (trackChangeGrace.current) return;

      const { player: p, joinedRoomHostId: hostId } = useStore.getState();
      if (!hostId) return;

      // User paused manually while room is playing
      const roomState = useStore.getState().joinedRoomState;
      if (!roomState) return;

      if (roomState.isPlaying && engineState.state === 'paused' && p.currentTrack?.id === roomState.trackId) {
        setJoinedRoomDesync(true);
        return;
      }
      // User switched to a different track than the host's
      if (p.currentTrack && p.currentTrack.id !== roomState.trackId && p.currentTrack.id !== lastHostTrackId.current) {
        setJoinedRoomDesync(true);
      }
    });
    return unsub;
  }, [joinedRoomHostId, joinedRoomDesync]);

  // ── Leave room on app close ──
  useEffect(() => {
    return () => {
      const { joinedRoomHostId: hostId } = useStore.getState();
      if (hostId) {
        const token = getToken();
        if (token) {
          const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
          if (joinedRoomInviteToken) headers['X-Room-Token'] = joinedRoomInviteToken;
          fetch(apiUrl(`/listening-room/${hostId}/leave`), {
            method: 'POST',
            headers,
          }).catch(() => {});
        }
      }
    };
  }, [joinedRoomInviteToken]);
}
