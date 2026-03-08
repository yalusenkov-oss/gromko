import { create } from 'zustand';
import { apiUrl } from '../lib/api';

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
  meta?: { album?: string; bpm?: number; loudness?: number };
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
  userId: string;
  trackIds: string[];
  isPublic: boolean;
  createdAt: string;
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
  email: string;
  role: Role;
  avatar: string;
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
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(apiUrl(path), { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function mapUser(u: any): User {
  return {
    id: u.id, name: u.name, email: u.email,
    role: u.role || 'user',
    avatar: u.avatar || '',
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
  register: (name: string, email: string, password: string, country?: string) => Promise<boolean>;
  restoreSession: () => Promise<void>;
  updateProfile: (data: { name?: string; avatar?: string }) => Promise<boolean>;

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
  addPlaylist: (title: string, trackIds: string[]) => void;
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
      const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(data.token);
      set({ currentUser: mapUser(data.user) });
      return true;
    } catch { return false; }
  },

  logout: () => { setToken(null); set({ currentUser: null }); },

  register: async (name, email, password, country) => {
    try {
      const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, country }) });
      setToken(data.token);
      set({ currentUser: mapUser(data.user) });
      return true;
    } catch { return false; }
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
    try {
      const data = await apiFetch(`/tracks/${trackId}/like`, { method: 'POST' });
      set(s => ({
        currentUser: s.currentUser ? {
          ...s.currentUser,
          likedTracks: data.liked
            ? [...s.currentUser.likedTracks, trackId]
            : s.currentUser.likedTracks.filter((id: string) => id !== trackId),
        } : null,
        tracks: s.tracks.map(t => t.id === trackId ? { ...t, likes: t.likes + (data.liked ? 1 : -1) } : t),
      }));
    } catch (e) { console.error('toggleLike:', e); }
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

  addPlaylist: (title, trackIds) => {
    const { currentUser } = get();
    if (!currentUser) return;
    const pl: Playlist = { id: `p${Date.now()}`, title, userId: currentUser.id, trackIds, isPublic: false, createdAt: new Date().toISOString().split('T')[0] };
    set(s => ({ playlists: [...s.playlists, pl] }));
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
}));
