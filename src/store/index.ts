import { create } from 'zustand';
import { apiUrl } from '../lib/api';
import { trackEvent } from '../utils/trackEvent';

export type Role = 'guest' | 'user' | 'admin';

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistSlug: string;
  artists?: { name: string; slug: string }[] | null;
  genre: string;
  year: number;
  cover: string;
  duration: number;
  plays: number;
  likes: number;
  isNew?: boolean;
  featured?: boolean;
  explicit?: boolean;
  streams?: { low?: string; medium?: string; high?: string; lossless?: string };
  hlsMaster?: string;
  waveform?: number[];
  meta?: { album?: string; bpm?: number; loudness?: number; label?: string; isrc?: string; releaseDate?: string };
  createdAt?: string;
}

export interface Artist {
  id: string;
  name: string;
  slug: string;
  photo: string;
  banner?: string | null;
  bio: string;
  genre: string;
  tracksCount: number;
  totalPlays: number;
  socials?: { vk?: string; instagram?: string; telegram?: string };
}

export interface Playlist {
  id: string;
  title: string;
  description: string | null;
  userId: string;
  trackIds: string[];
  isPublic: boolean;
  coverUrl: string | null;
  likesCount: number;
  tracksCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  id: string;
  userId: string;
  releaseId?: string;
  title: string;
  artist: string;
  genre: string;
  year: number;
  comment: string;
  status: 'pending' | 'approved' | 'rejected' | 'deferred';
  rejectReason?: string;
  albumName?: string;
  coverUrl?: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  avatar: string;
  bio: string;
  timezone?: string;
  joinedAt: string;
  isBlocked: boolean;
  likedTracks: string[];
  likedAlbums: string[];
  likedArtists: string[];
}

export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  isBuffering: boolean;
  volume: number;
  progress: number;
  shuffle: boolean;
  repeat: 'none' | 'one' | 'all';
  isFullscreen: boolean;
}

export const GENRES = ['Хип-хоп', 'Рэп', 'Trap', 'R&B', 'Drill', 'Phonk', 'Pop', 'Rock', 'Electronic', 'Другое'];

function getToken(): string | null {
  return localStorage.getItem('gromko_token');
}
function setToken(token: string | null) {
  if (token) localStorage.setItem('gromko_token', token);
  else localStorage.removeItem('gromko_token');
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string> || {}) };
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (timezone) headers['X-Timezone'] = timezone;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(apiUrl(path), { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function mapUser(u: any): User {
  return {
    id: u.id, name: u.name, email: u.email,
    username: u.username || u.name?.toLowerCase().replace(/[^a-z0-9_]/g, '') || '',
    role: u.role || 'user',
    avatar: u.avatar || '',
    bio: u.bio || '',
    timezone: u.timezone || '',
    joinedAt: u.createdAt || u.created_at || '',
    isBlocked: u.isBlocked ?? u.is_blocked ?? false,
    likedTracks: u.likedTracks || u.liked_tracks || [],
    likedAlbums: u.likedAlbums || u.liked_albums || [],
    likedArtists: u.likedArtists || u.liked_artists || [],
  };
}

export interface AdminStats {
  tracks: number;
  artists: number;
  users: number;
  totalPlays: number;
  pending: number;
  processing: number;
  errors: number;
  ready: number;
  pendingSubmissions: number;
  recentUsers: number;
  activeListeners: number;
  playsToday: number;
  playsWeek: number;
  playsMonth: number;
  topGenres: { genre: string; count: number }[];
  topTracks: Track[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  isBlocked: boolean;
  createdAt: string;
  likesCount: number;
  totalPlays: number;
  lastActive: string | null;
}

export interface AdminSubmission {
  id: string;
  userId: string;
  releaseId: string | null;
  title: string;
  artist: string;
  genre: string;
  year: number;
  comment: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'deferred';
  rejectReason: string | null;
  originalFilename: string;
  coverUrl: string | null;
  audioUrl: string | null;
  albumName: string | null;
  createdAt: string;
  user: { name: string; email: string; avatar: string };
}

interface AppStore {
  currentUser: User | null;
  authLoading: boolean;
  dataReady: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (name: string, email: string, password: string, country?: string, username?: string, timezone?: string) => Promise<true | string>;
  restoreSession: () => Promise<void>;
  updateProfile: (data: { name?: string; avatar?: string; bio?: string; username?: string; timezone?: string }) => Promise<boolean>;

  tracks: Track[];
  artists: Artist[];
  users: User[];
  submissions: Submission[];
  playlists: Playlist[];

  // Admin data (backed by real API)
  adminStats: AdminStats | null;
  adminUsers: AdminUser[];
  adminSubmissions: AdminSubmission[];

  fetchTracks: (params?: Record<string, string>) => Promise<void>;
  fetchArtists: () => Promise<void>;
  fetchAdminUsers: () => Promise<void>;
  fetchAdminStats: () => Promise<void>;
  fetchAdminSubmissions: () => Promise<void>;
  fetchMySubmissions: () => Promise<void>;

  player: PlayerState;
  playTrack: (track: Track, queue?: Track[]) => void;
  queueNext: (track: Track) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setVolume: (v: number) => void;
  setProgress: (p: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleFullscreen: () => void;

  toggleLike: (trackId: string) => void;
  toggleAlbumLike: (albumName: string) => void;
  toggleArtistLike: (artistSlug: string) => void;
  addPlaylist: (title: string, trackIds: string[], description?: string, isPublic?: boolean) => Promise<Playlist | null>;
  updatePlaylist: (id: string, data: { title?: string; description?: string; isPublic?: boolean; trackIds?: string[] }) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  fetchMyPlaylists: () => Promise<void>;
  toggleFollow: (userId: string) => Promise<boolean>;
  submitTrack: (sub: Omit<Submission, 'id' | 'status' | 'createdAt'>) => void;

  updateTrack: (id: string, data: Partial<Track>) => Promise<void>;
  deleteTrack: (id: string) => Promise<void>;
  addTrack: (track: Omit<Track, 'id'>) => void;
  updateArtist: (id: string, data: Partial<Artist>) => Promise<void>;
  deleteArtist: (id: string) => Promise<void>;
  addArtist: (artist: Omit<Artist, 'id'>) => void;
  moderateSubmission: (id: string, action: 'approve' | 'reject' | 'defer', reason?: string) => Promise<void>;
  updateSubmission: (id: string, data: Partial<Submission>) => void;
  blockUser: (id: string) => void;
  promoteUser: (id: string) => void;
  deleteUser: (id: string) => Promise<void>;

  heroTrackId: string;
  setHeroTrack: (id: string) => void;
  activeGenre: string;
  setActiveGenre: (g: string) => void;

  authModal: 'login' | 'register' | null;
  openAuthModal: (mode: 'login' | 'register') => void;
  closeAuthModal: () => void;

  // Listening room (global)
  roomActive: boolean;
  roomPublic: boolean; // true = public, false = invite-only
  roomInviteToken: string | null;
  roomLastSyncAt: number | null;
  roomListeners: { userId: string; name: string; avatar: string }[];
  setRoomActive: (active: boolean) => void;
  setRoomPublic: (isPublic: boolean) => void;
  setRoomInviteToken: (token: string | null) => void;
  setRoomLastSyncAt: (ts: number | null) => void;
  setRoomListeners: (listeners: { userId: string; name: string; avatar: string }[]) => void;
  toggleRoom: () => void;
  roomSuggestions: { trackId: string; trackTitle: string; trackArtist: string; trackCover: string; suggestedBy: string; suggestedByName: string }[];
  setRoomSuggestions: (suggestions: { trackId: string; trackTitle: string; trackArtist: string; trackCover: string; suggestedBy: string; suggestedByName: string }[]) => void;

  // Joined room (as listener — persists across navigation)
  joinedRoomHostId: string | null;
  joinedRoomInviteToken: string | null;
  joinedRoomDesync: boolean;
  joinedRoomState: { trackId: string; trackTitle: string; trackArtist: string; trackCover: string; progress: number; isPlaying: boolean; listenersCount: number; hostName: string } | null;
  setJoinedRoom: (hostId: string | null, inviteToken?: string | null, hostName?: string) => void;
  setJoinedRoomDesync: (desync: boolean) => void;
  setJoinedRoomState: (state: { trackId: string; trackTitle: string; trackArtist: string; trackCover: string; progress: number; isPlaying: boolean; listenersCount: number; hostName: string } | null) => void;
}

export const useStore = create<AppStore>((set, get) => ({
  currentUser: null,
  authLoading: true,
  dataReady: false,
  tracks: [],
  artists: [],
  users: [],
  submissions: [],
  adminStats: null,
  adminUsers: [],
  adminSubmissions: [],
  playlists: [],
  heroTrackId: '',
  activeGenre: 'Все',

  login: async (email, password) => {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, timezone }) });
      setToken(data.token);
      set({ currentUser: mapUser(data.user) });
      return true;
    } catch { return false; }
  },

  logout: () => { setToken(null); set({ currentUser: null }); },

  register: async (name, email, password, country, username, timezone) => {
    try {
      const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, country, username, timezone }) });
      setToken(data.token);
      set({ currentUser: mapUser(data.user) });
      return true;
    } catch (err: any) { return err?.message || 'Ошибка регистрации'; }
  },

  restoreSession: async () => {
    if (!getToken()) { set({ authLoading: false }); return; }
    try {
      const data = await apiFetch('/auth/me');
      set({ currentUser: mapUser(data.user), authLoading: false });
    } catch {
      setToken(null);
      set({ currentUser: null, authLoading: false });
    }
  },

  updateProfile: async (data) => {
    try {
      const res = await apiFetch('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
      set({ currentUser: mapUser(res.user) });
      return true;
    } catch { return false; }
  },

  fetchTracks: async (params = {}) => {
    try {
      // Default to loading all tracks so the UI has the full count
      if (!params.limit) params.limit = '9999';
      const qs = new URLSearchParams(params).toString();
      const data = await apiFetch(`/tracks${qs ? '?' + qs : ''}`);
      const tracks: Track[] = data.tracks || [];
      set({ tracks, dataReady: true });
      const featured = tracks.find(t => t.featured);
      if (featured) set({ heroTrackId: featured.id });
      else if (tracks.length) set({ heroTrackId: tracks[0].id });
    } catch (e) { console.error('fetchTracks:', e); set({ dataReady: true }); }
  },

  fetchArtists: async () => {
    try {
      const data = await apiFetch('/artists');
      set({ artists: Array.isArray(data) ? data : [] });
    } catch (e) { console.error('fetchArtists:', e); }
  },

  fetchAdminUsers: async () => {
    try {
      const data = await apiFetch('/admin/users');
      set({ adminUsers: Array.isArray(data) ? data : [] });
    } catch (e) { console.error('fetchAdminUsers:', e); }
  },

  fetchAdminStats: async () => {
    try {
      const data = await apiFetch('/admin/stats');
      set({ adminStats: data });
    } catch (e) { console.error('fetchAdminStats:', e); }
  },

  fetchAdminSubmissions: async () => {
    try {
      const data = await apiFetch('/admin/submissions');
      set({ adminSubmissions: Array.isArray(data) ? data : [] });
    } catch (e) { console.error('fetchAdminSubmissions:', e); }
  },

  fetchMySubmissions: async () => {
    try {
      const data = await apiFetch('/submissions/my');
      const subs: Submission[] = (Array.isArray(data) ? data : []).map((s: any) => ({
        id: s.id,
        userId: s.userId || '',
        releaseId: s.releaseId || undefined,
        title: s.title,
        artist: s.artist,
        genre: s.genre,
        year: s.year,
        comment: s.comment || '',
        status: s.status,
        rejectReason: s.rejectReason,
        albumName: s.albumName || undefined,
        coverUrl: s.coverUrl || undefined,
        createdAt: s.createdAt,
      }));
      set({ submissions: subs });
    } catch (e) { console.error('fetchMySubmissions:', e); }
  },

  player: {
    currentTrack: null, queue: [], isPlaying: false, isBuffering: false,
    volume: 0.8, progress: 0, shuffle: false,
    repeat: 'none', isFullscreen: false,
  },

  playTrack: (track, queue) => {
    const { currentUser } = get();
    if (!currentUser) {
      set({ authModal: 'login' });
      return;
    }
    set(s => ({
      player: { ...s.player, currentTrack: track, queue: queue || s.player.queue, isPlaying: true, progress: 0 },
    }));
  },
  togglePlay: () => set(s => ({ player: { ...s.player, isPlaying: !s.player.isPlaying } })),
  queueNext: (track) => {
    const { player } = get();
    // Record queue_next event for recommendation engine
    trackEvent('queue_next', { trackId: track.id });
    if (!player.currentTrack) {
      // Nothing playing — just play it
      set(s => ({ player: { ...s.player, currentTrack: track, queue: [track], isPlaying: true, progress: 0 } }));
      return;
    }
    const newQueue = [...player.queue];
    // Remove if already in queue to avoid duplicates
    const existIdx = newQueue.findIndex(t => t.id === track.id);
    if (existIdx > -1) newQueue.splice(existIdx, 1);
    // Insert right after current track
    const insertIdx = newQueue.findIndex(t => t.id === player.currentTrack!.id);
    newQueue.splice(insertIdx + 1, 0, track);
    set(s => ({ player: { ...s.player, queue: newQueue } }));
  },
  nextTrack: () => {
    const { player } = get();
    if (!player.currentTrack) return;
    const idx = player.queue.findIndex(t => t.id === player.currentTrack!.id);
    const next = player.queue[idx + 1] || player.queue[0];
    if (next) set(s => ({ player: { ...s.player, currentTrack: next, progress: 0 } }));
  },
  prevTrack: () => {
    const { player } = get();
    if (!player.currentTrack) return;
    const idx = player.queue.findIndex(t => t.id === player.currentTrack!.id);
    const prev = player.queue[idx - 1] || player.queue[player.queue.length - 1];
    if (prev) set(s => ({ player: { ...s.player, currentTrack: prev, progress: 0 } }));
  },
  setVolume: (v) => set(s => ({ player: { ...s.player, volume: v } })),
  setProgress: (p) => set(s => ({ player: { ...s.player, progress: p } })),
  toggleShuffle: () => set(s => ({ player: { ...s.player, shuffle: !s.player.shuffle } })),
  toggleRepeat: () => set(s => ({
    player: { ...s.player, repeat: s.player.repeat === 'none' ? 'all' : s.player.repeat === 'all' ? 'one' : 'none' },
  })),
  toggleFullscreen: () => set(s => ({ player: { ...s.player, isFullscreen: !s.player.isFullscreen } })),

  toggleLike: async (trackId) => {
    const { currentUser } = get();
    if (!currentUser) return;

    // Optimistic update — instant UI response
    const wasLiked = currentUser.likedTracks.includes(trackId);
    set(s => ({
      currentUser: s.currentUser ? {
        ...s.currentUser,
        likedTracks: wasLiked
          ? s.currentUser.likedTracks.filter((id: string) => id !== trackId)
          : [...s.currentUser.likedTracks, trackId],
      } : null,
      tracks: s.tracks.map(t => t.id === trackId ? { ...t, likes: t.likes + (wasLiked ? -1 : 1) } : t),
    }));

    try {
      const data = await apiFetch(`/tracks/${trackId}/like`, { method: 'POST' });
      // Reconcile with server response (in case of mismatch)
      set(s => ({
        currentUser: s.currentUser ? {
          ...s.currentUser,
          likedTracks: data.liked
            ? (s.currentUser.likedTracks.includes(trackId) ? s.currentUser.likedTracks : [...s.currentUser.likedTracks, trackId])
            : s.currentUser.likedTracks.filter((id: string) => id !== trackId),
        } : null,
      }));
    } catch (e) {
      console.error('toggleLike:', e);
      // Revert optimistic update on error
      set(s => ({
        currentUser: s.currentUser ? {
          ...s.currentUser,
          likedTracks: wasLiked
            ? [...s.currentUser.likedTracks, trackId]
            : s.currentUser.likedTracks.filter((id: string) => id !== trackId),
        } : null,
        tracks: s.tracks.map(t => t.id === trackId ? { ...t, likes: t.likes + (wasLiked ? 1 : -1) } : t),
      }));
    }
  },

  toggleAlbumLike: async (albumName) => {
    const { currentUser } = get();
    if (!currentUser) return;
    try {
      const data = await apiFetch(`/albums/${encodeURIComponent(albumName)}/like`, { method: 'POST' });
      set(s => ({
        currentUser: s.currentUser ? {
          ...s.currentUser,
          likedAlbums: data.liked
            ? [...s.currentUser.likedAlbums, albumName]
            : s.currentUser.likedAlbums.filter((n: string) => n !== albumName),
        } : null,
      }));
    } catch (e) { console.error('toggleAlbumLike:', e); }
  },

  toggleArtistLike: async (artistSlug) => {
    const { currentUser } = get();
    if (!currentUser) return;
    try {
      const data = await apiFetch(`/artists/${artistSlug}/like`, { method: 'POST' });
      set(s => ({
        currentUser: s.currentUser ? {
          ...s.currentUser,
          likedArtists: data.liked
            ? [...s.currentUser.likedArtists, artistSlug]
            : s.currentUser.likedArtists.filter((sl: string) => sl !== artistSlug),
        } : null,
      }));
    } catch (e) { console.error('toggleArtistLike:', e); }
  },

  addPlaylist: async (title, trackIds, description, isPublic) => {
    const { currentUser } = get();
    if (!currentUser) return null;
    try {
      const pl = await apiFetch('/playlists', {
        method: 'POST',
        body: JSON.stringify({ title, trackIds, description: description || '', isPublic: !!isPublic }),
      });
      set(s => ({ playlists: [pl, ...s.playlists] }));
      return pl as Playlist;
    } catch (e) { console.error('addPlaylist:', e); return null; }
  },

  updatePlaylist: async (id, data) => {
    try {
      const updated = await apiFetch(`/playlists/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      set(s => ({ playlists: s.playlists.map(p => p.id === id ? { ...p, ...updated } : p) }));
    } catch (e) { console.error('updatePlaylist:', e); }
  },

  deletePlaylist: async (id) => {
    try {
      await apiFetch(`/playlists/${id}`, { method: 'DELETE' });
      set(s => ({ playlists: s.playlists.filter(p => p.id !== id) }));
    } catch (e) { console.error('deletePlaylist:', e); }
  },

  addTrackToPlaylist: async (playlistId, trackId) => {
    try {
      await apiFetch(`/playlists/${playlistId}/tracks`, { method: 'POST', body: JSON.stringify({ trackId }) });
      set(s => ({
        playlists: s.playlists.map(p =>
          p.id === playlistId ? { ...p, trackIds: [...p.trackIds, trackId], tracksCount: p.tracksCount + 1 } : p
        ),
      }));
    } catch (e) { console.error('addTrackToPlaylist:', e); }
  },

  removeTrackFromPlaylist: async (playlistId, trackId) => {
    try {
      await apiFetch(`/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' });
      set(s => ({
        playlists: s.playlists.map(p =>
          p.id === playlistId ? { ...p, trackIds: p.trackIds.filter(id => id !== trackId), tracksCount: Math.max(0, p.tracksCount - 1) } : p
        ),
      }));
    } catch (e) { console.error('removeTrackFromPlaylist:', e); }
  },

  fetchMyPlaylists: async () => {
    try {
      const data = await apiFetch('/playlists/my');
      set({ playlists: Array.isArray(data) ? data : [] });
    } catch (e) { console.error('fetchMyPlaylists:', e); }
  },

  toggleFollow: async (userId) => {
    try {
      const data = await apiFetch(`/users/${userId}/follow`, { method: 'POST' });
      return data.following as boolean;
    } catch (e) { console.error('toggleFollow:', e); return false; }
  },

  submitTrack: (sub) => {
    const s: Submission = { ...sub, id: `s${Date.now()}`, status: 'pending', createdAt: new Date().toISOString().split('T')[0] };
    set(st => ({ submissions: [...st.submissions, s] }));
  },

  updateTrack: async (id, data) => {
    try {
      const updated = await apiFetch(`/admin/tracks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      set(s => ({ tracks: s.tracks.map(t => t.id === id ? { ...t, ...updated } : t) }));
    } catch (e) {
      console.error('updateTrack:', e);
      // Fallback to local update
      set(s => ({ tracks: s.tracks.map(t => t.id === id ? { ...t, ...data } : t) }));
    }
  },
  deleteTrack: async (id) => {
    try {
      await apiFetch(`/admin/tracks/${id}`, { method: 'DELETE' });
      set(s => ({ tracks: s.tracks.filter(t => t.id !== id) }));
    } catch (e) { console.error('deleteTrack:', e); }
  },
  addTrack: (track) => set(s => ({ tracks: [...s.tracks, { ...track, id: `t${Date.now()}` }] })),
  updateArtist: async (id, data) => {
    try {
      const updated = await apiFetch(`/admin/artists/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      set(s => ({ artists: s.artists.map(a => a.id === id ? { ...a, ...updated } : a) }));
    } catch (e) {
      console.error('updateArtist:', e);
      set(s => ({ artists: s.artists.map(a => a.id === id ? { ...a, ...data } : a) }));
    }
  },
  deleteArtist: async (id) => {
    try {
      await apiFetch(`/admin/artists/${id}`, { method: 'DELETE' });
      set(s => ({ artists: s.artists.filter(a => a.id !== id) }));
    } catch (e) { console.error('deleteArtist:', e); }
  },
  addArtist: (artist) => set(s => ({ artists: [...s.artists, { ...artist, id: `a${Date.now()}` }] })),

  moderateSubmission: async (id, action, reason) => {
    try {
      if (action === 'approve') {
        await apiFetch(`/admin/submissions/${id}/approve`, { method: 'PUT' });
      } else if (action === 'reject') {
        await apiFetch(`/admin/submissions/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) });
      } else {
        await apiFetch(`/admin/submissions/${id}/defer`, { method: 'PUT' });
      }
      // Refresh submissions list
      get().fetchAdminSubmissions();
    } catch (e) { console.error('moderateSubmission:', e); }
  },
  updateSubmission: (id, data) => set(s => ({ submissions: s.submissions.map(sub => sub.id === id ? { ...sub, ...data } : sub) })),

  blockUser: async (id) => {
    try {
      await apiFetch(`/admin/users/${id}/block`, { method: 'PUT' });
      set(s => ({ adminUsers: s.adminUsers.map(u => u.id === id ? { ...u, isBlocked: !u.isBlocked } : u) }));
    } catch (e) { console.error('blockUser:', e); }
  },

  promoteUser: async (id) => {
    const user = get().adminUsers.find(u => u.id === id);
    if (!user) return;
    const newRole = user.role === 'user' ? 'admin' : 'user';
    try {
      await apiFetch(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
      set(s => ({ adminUsers: s.adminUsers.map(u => u.id === id ? { ...u, role: newRole } : u) }));
    } catch (e) { console.error('promoteUser:', e); }
  },

  deleteUser: async (id) => {
    try {
      await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
      set(s => ({ adminUsers: s.adminUsers.filter(u => u.id !== id) }));
    } catch (e) { console.error('deleteUser:', e); }
  },

  setHeroTrack: (id) => set({ heroTrackId: id }),
  setActiveGenre: (g) => set({ activeGenre: g }),

  authModal: null,
  openAuthModal: (mode) => set({ authModal: mode }),
  closeAuthModal: () => set({ authModal: null }),

  // Listening room (global)
  roomActive: false,
  roomPublic: true,
  roomInviteToken: null,
  roomLastSyncAt: null,
  roomListeners: [],
  setRoomActive: (active) => set({ roomActive: active }),
  setRoomPublic: (isPublic) => set({ roomPublic: isPublic }),
  setRoomInviteToken: (token) => set({ roomInviteToken: token }),
  setRoomLastSyncAt: (ts) => set({ roomLastSyncAt: ts }),
  setRoomListeners: (listeners) => set({ roomListeners: listeners }),
  roomSuggestions: [],
  setRoomSuggestions: (suggestions) => set({ roomSuggestions: suggestions }),
  toggleRoom: () => {
    const { roomActive } = get();
    if (roomActive) {
      // Close room
      const token = localStorage.getItem('gromko_token');
      if (token) {
        fetch(apiUrl('/listening-room'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      set({ roomActive: false, roomPublic: true, roomInviteToken: null, roomLastSyncAt: null, roomListeners: [], roomSuggestions: [] });
    } else {
      set({ roomActive: true, roomInviteToken: null, roomLastSyncAt: null });
    }
  },

  // Joined room (as listener)
  joinedRoomHostId: null,
  joinedRoomInviteToken: null,
  joinedRoomDesync: false,
  joinedRoomState: null,
  setJoinedRoom: (hostId, inviteToken, _hostName) => {
    if (hostId) {
      set({ joinedRoomHostId: hostId, joinedRoomInviteToken: inviteToken || null, joinedRoomDesync: false });
    } else {
      set({ joinedRoomHostId: null, joinedRoomInviteToken: null, joinedRoomDesync: false, joinedRoomState: null });
    }
  },
  setJoinedRoomDesync: (desync) => set({ joinedRoomDesync: desync }),
  setJoinedRoomState: (state) => set({ joinedRoomState: state }),
}));
