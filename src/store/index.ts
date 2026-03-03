import { create } from 'zustand';

export type Role = 'guest' | 'user' | 'admin';

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistSlug: string;
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
}

export interface Artist {
  id: string;
  name: string;
  slug: string;
  photo: string;
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
  title: string;
  artist: string;
  genre: string;
  year: number;
  comment: string;
  status: 'pending' | 'approved' | 'rejected' | 'deferred';
  rejectReason?: string;
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
}

export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  volume: number;
  progress: number;
  shuffle: boolean;
  repeat: 'none' | 'one' | 'all';
  isFullscreen: boolean;
}

export const GENRES = ['Хип-хоп', 'Рэп', 'Trap', 'R&B', 'Drill', 'Phonk', 'Pop', 'Rock', 'Electronic'];

const API = '/api';

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
  const res = await fetch(`${API}${path}`, { ...opts, headers });
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
  };
}

interface AppStore {
  currentUser: User | null;
  authLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  restoreSession: () => Promise<void>;

  tracks: Track[];
  artists: Artist[];
  users: User[];
  submissions: Submission[];
  playlists: Playlist[];

  fetchTracks: (params?: Record<string, string>) => Promise<void>;
  fetchArtists: () => Promise<void>;
  fetchAdminUsers: () => Promise<void>;

  player: PlayerState;
  playTrack: (track: Track, queue?: Track[]) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setVolume: (v: number) => void;
  setProgress: (p: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleFullscreen: () => void;

  toggleLike: (trackId: string) => void;
  addPlaylist: (title: string, trackIds: string[]) => void;
  submitTrack: (sub: Omit<Submission, 'id' | 'status' | 'createdAt'>) => void;

  updateTrack: (id: string, data: Partial<Track>) => void;
  deleteTrack: (id: string) => void;
  addTrack: (track: Omit<Track, 'id'>) => void;
  updateArtist: (id: string, data: Partial<Artist>) => void;
  deleteArtist: (id: string) => void;
  addArtist: (artist: Omit<Artist, 'id'>) => void;
  moderateSubmission: (id: string, action: 'approve' | 'reject' | 'defer', reason?: string) => void;
  updateSubmission: (id: string, data: Partial<Submission>) => void;
  blockUser: (id: string) => void;
  promoteUser: (id: string) => void;

  heroTrackId: string;
  setHeroTrack: (id: string) => void;
  activeGenre: string;
  setActiveGenre: (g: string) => void;
}

export const useStore = create<AppStore>((set, get) => ({
  currentUser: null,
  authLoading: true,
  tracks: [],
  artists: [],
  users: [],
  submissions: [],
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

  register: async (name, email, password) => {
    try {
      const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
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

  fetchTracks: async (params = {}) => {
    try {
      const qs = new URLSearchParams(params).toString();
      const data = await apiFetch(`/tracks${qs ? '?' + qs : ''}`);
      const tracks: Track[] = data.tracks || [];
      set({ tracks });
      const featured = tracks.find(t => t.featured);
      if (featured) set({ heroTrackId: featured.id });
      else if (tracks.length) set({ heroTrackId: tracks[0].id });
    } catch (e) { console.error('fetchTracks:', e); }
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
      set({ users: Array.isArray(data) ? data.map(mapUser) : [] });
    } catch (e) { console.error('fetchAdminUsers:', e); }
  },

  player: {
    currentTrack: null, queue: [], isPlaying: false,
    volume: 0.8, progress: 0, shuffle: false,
    repeat: 'none', isFullscreen: false,
  },

  playTrack: (track, queue) => set(s => ({
    player: { ...s.player, currentTrack: track, queue: queue || s.player.queue, isPlaying: true, progress: 0 },
  })),
  togglePlay: () => set(s => ({ player: { ...s.player, isPlaying: !s.player.isPlaying } })),
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

  updateTrack: (id, data) => set(s => ({ tracks: s.tracks.map(t => t.id === id ? { ...t, ...data } : t) })),
  deleteTrack: (id) => set(s => ({ tracks: s.tracks.filter(t => t.id !== id) })),
  addTrack: (track) => set(s => ({ tracks: [...s.tracks, { ...track, id: `t${Date.now()}` }] })),
  updateArtist: (id, data) => set(s => ({ artists: s.artists.map(a => a.id === id ? { ...a, ...data } : a) })),
  deleteArtist: (id) => set(s => ({ artists: s.artists.filter(a => a.id !== id) })),
  addArtist: (artist) => set(s => ({ artists: [...s.artists, { ...artist, id: `a${Date.now()}` }] })),

  moderateSubmission: (id, action, reason) => set(s => ({
    submissions: s.submissions.map(sub => sub.id === id ? {
      ...sub,
      status: action === 'approve' ? 'approved' as const : action === 'reject' ? 'rejected' as const : 'deferred' as const,
      rejectReason: reason,
    } : sub),
  })),
  updateSubmission: (id, data) => set(s => ({ submissions: s.submissions.map(sub => sub.id === id ? { ...sub, ...data } : sub) })),

  blockUser: async (id) => {
    try {
      await apiFetch(`/admin/users/${id}/block`, { method: 'PUT' });
      set(s => ({ users: s.users.map(u => u.id === id ? { ...u, isBlocked: !u.isBlocked } : u) }));
    } catch (e) { console.error('blockUser:', e); }
  },

  promoteUser: async (id) => {
    const user = get().users.find(u => u.id === id);
    if (!user) return;
    const newRole = user.role === 'user' ? 'admin' : 'user';
    try {
      await apiFetch(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
      set(s => ({ users: s.users.map(u => u.id === id ? { ...u, role: newRole as Role } : u) }));
    } catch (e) { console.error('promoteUser:', e); }
  },

  setHeroTrack: (id) => set({ heroTrackId: id }),
  setActiveGenre: (g) => set({ activeGenre: g }),
}));
