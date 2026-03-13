/**
 * Global listening room broadcast hook.
 * Runs at the App level so the room stays alive even when navigating away from ProfilePage.
 */

import { useEffect } from 'react';
import { useStore } from '../store';
import { apiUrl } from '../lib/api';

function getToken(): string | null {
  return localStorage.getItem('gromko_token');
}

async function apiFetchJson(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { ...opts, headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useRoomBroadcast() {
  const { roomActive, player } = useStore();

  // Broadcast room state every 3 seconds
  useEffect(() => {
    if (!roomActive || !player.currentTrack) return;

    const broadcast = () => {
      const { player: p, setRoomListeners, setRoomSuggestions, roomPublic } = useStore.getState();
      if (!p.currentTrack) return;
      apiFetchJson('/listening-room', {
        method: 'PUT',
        body: JSON.stringify({
          trackId: p.currentTrack.id,
          trackTitle: p.currentTrack.title,
          trackArtist: p.currentTrack.artist,
          trackCover: p.currentTrack.cover,
          progress: p.progress || 0,
          isPlaying: p.isPlaying,
          isPublic: roomPublic,
        }),
      }).then(d => {
        setRoomListeners(d.listeners || []);
        setRoomSuggestions(d.suggestions || []);
      }).catch(() => {});
    };

    broadcast();
    const iv = setInterval(broadcast, 3000);
    return () => clearInterval(iv);
  }, [roomActive, player.currentTrack?.id, player.isPlaying]);

  // Close room on unmount (app close / logout)
  useEffect(() => {
    return () => {
      const { roomActive: active } = useStore.getState();
      if (active) {
        apiFetchJson('/listening-room', { method: 'DELETE' }).catch(() => {});
      }
    };
  }, []);
}
