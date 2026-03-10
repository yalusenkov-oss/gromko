import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore, Track, Playlist } from '../store';
import { Link, useNavigate } from 'react-router-dom';
import {
  Send, Clock, CheckCircle, XCircle, Heart, LogOut,
  Settings, ChevronRight, Shield, Edit3, Camera, Save,
  Play, Pause, Music, Disc3,
  Activity, History, ListMusic, Headphones,
  Share2, Calendar, Plus, Globe, Lock, Trash2,
  Copy, MapPin, ExternalLink,
} from 'lucide-react';
import { apiUrl } from '../lib/api';
import { formatDuration, formatPlays } from '../utils/format';

/* --- Types --- */

interface TasteSummary {
  topGenres: { genre: string; score: number }[];
  topArtists: { slug: string; score: number; name?: string }[];
  preferredBpm: { min: number; max: number };
  avgListenRatio: number;
  skipRate: number;
  explorationScore: number;
  eventsProcessed: number;
  timePreferences: Record<string, number>;
}

interface ProfileStats {
  totalPlays: number;
  monthPlays: number;
  totalTimeSeconds: number;
  monthTimeSeconds: number;
  topListenedArtists: { name: string; slug: string; photo: string; plays: number }[];
  playlistsCount: number;
  lastActive: string | null;
}

interface ActivityItem {
  type: string;
  trackId: string | null;
  trackTitle: string | null;
  trackArtist: string | null;
  trackCover: string | null;
  artistSlug: string | null;
  artistName: string | null;
  artistPhoto: string | null;
  createdAt: string;
}

interface HistoryTrack extends Track {
  playedAt: string;
}

type Tab = 'playlists' | 'tracks' | 'albums' | 'history' | 'activity';

/* --- Helpers --- */

function getToken() {
  return localStorage.getItem('gromko_token');
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function activityLabel(type: string): { text: string; icon: React.ReactNode; color: string } {
  switch (type) {
    case 'like':
      return { text: 'поставил лайк', icon: <Heart size={14} fill="currentColor" />, color: 'text-red-400' };
    case 'follow_artist':
      return { text: 'подписался на', icon: <ExternalLink size={14} />, color: 'text-cyan-400' };
    case 'add_to_playlist':
      return { text: 'добавил в плейлист', icon: <ListMusic size={14} />, color: 'text-purple-400' };
    case 'share':
      return { text: 'поделился', icon: <Share2 size={14} />, color: 'text-green-400' };
    case 'finish':
      return { text: 'дослушал', icon: <Headphones size={14} />, color: 'text-blue-400' };
    default:
      return { text: type, icon: <Activity size={14} />, color: 'text-zinc-400' };
  }
}

/* --- Component --- */

export default function ProfilePage() {
  const {
    currentUser, submissions, fetchMySubmissions, logout,
    updateProfile, tracks, player, playTrack, togglePlay, artists,
    playlists, fetchMyPlaylists, addPlaylist, updatePlaylist, deletePlaylist,
  } = useStore();

  const [tab, setTab] = useState<Tab>('playlists');
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tasteSummary, setTasteSummary] = useState<TasteSummary | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [historyTracks, setHistoryTracks] = useState<HistoryTrack[]>([]);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlTitle, setNewPlTitle] = useState('');
  const [newPlDesc, setNewPlDesc] = useState('');
  const [newPlPublic, setNewPlPublic] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchProfileData = useCallback(() => {
    const token = getToken();
    if (!token || !currentUser) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(apiUrl('/recommendations/taste'), { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.topGenres) setTasteSummary(d); })
      .catch(() => {});

    fetch(apiUrl('/profile/stats'), { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProfileStats(d); })
      .catch(() => {});

    fetch(apiUrl('/profile/activity?limit=30'), { headers })
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setActivityFeed(d); else setActivityFeed([]); })
      .catch(() => {});

    fetch(apiUrl('/profile/history?limit=50'), { headers })
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setHistoryTracks(d); else setHistoryTracks([]); })
      .catch(() => {});

    fetch(apiUrl('/profile/followers-stats'), { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setFollowersCount(d.followersCount || 0);
          setFollowingCount(d.followingCount || 0);
        }
      })
      .catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchMySubmissions();
      fetchMyPlaylists();
      setEditName(currentUser.name);
      setEditBio(currentUser.bio || '');
      fetchProfileData();
    }
  }, [currentUser, fetchProfileData, fetchMySubmissions, fetchMyPlaylists]);

  useEffect(() => {
    if (!currentUser) navigate('/');
  }, [currentUser, navigate]);

  if (!currentUser) return null;

  /* Computed data */

  const likedAlbumsCount = currentUser.likedAlbums ? currentUser.likedAlbums.length : 0;
  const likedArtistsCount = currentUser.likedArtists ? currentUser.likedArtists.length : 0;

  const recentlyLiked = tracks.filter(t => currentUser.likedTracks.includes(t.id)).slice(0, 5);

  const featuredTracks = (() => {
    const liked = new Set(currentUser.likedTracks);
    return tracks
      .filter(t => liked.has(t.id))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 5);
  })();

  const likedAlbums = (() => {
    if (!currentUser.likedAlbums || currentUser.likedAlbums.length === 0) {
      const albumMap = new Map<string, { name: string; cover: string; artist: string; artistSlug: string; year: number; tracks: Track[] }>();
      const likedSet = new Set(currentUser.likedTracks);
      for (const t of tracks) {
        if (!likedSet.has(t.id)) continue;
        const albumName = (t as any).meta?.album;
        if (!albumName) continue;
        if (!albumMap.has(albumName)) {
          albumMap.set(albumName, { name: albumName, cover: t.cover, artist: t.artist, artistSlug: t.artistSlug, year: t.year, tracks: [] });
        }
        albumMap.get(albumName)!.tracks.push(t);
      }
      return Array.from(albumMap.values()).filter(a => a.tracks.length > 1).slice(0, 4);
    }
    const albumMap = new Map<string, { name: string; cover: string; artist: string; artistSlug: string; year: number; tracks: Track[] }>();
    for (const t of tracks) {
      const albumName = (t as any).meta?.album;
      if (!albumName || !currentUser.likedAlbums.includes(albumName)) continue;
      if (!albumMap.has(albumName)) {
        albumMap.set(albumName, { name: albumName, cover: t.cover, artist: t.artist, artistSlug: t.artistSlug, year: t.year, tracks: [] });
      }
      albumMap.get(albumName)!.tracks.push(t);
    }
    return Array.from(albumMap.values()).slice(0, 4);
  })();

  const genreBreakdown = (() => {
    const map = new Map<string, number>();
    const likedSet = new Set(currentUser.likedTracks);
    let total = 0;
    for (const t of tracks) {
      if (!likedSet.has(t.id) || !t.genre) continue;
      map.set(t.genre, (map.get(t.genre) || 0) + 1);
      total++;
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre, count]) => ({ genre, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));
  })();

  const genreList = genreBreakdown.map(g => g.genre);

  const songsCount = tracks.filter(t => currentUser.likedTracks.includes(t.id)).length;
  const albumsCount = likedAlbums.length || likedAlbumsCount;

  const favoriteArtists = (() => {
    if (tasteSummary?.topArtists && tasteSummary.topArtists.length > 0) {
      return tasteSummary.topArtists.slice(0, 5).map(ta => {
        const found = artists.find(a => a.slug === ta.slug);
        return found ? { name: found.name, slug: found.slug, photo: found.photo } : { name: ta.name || ta.slug, slug: ta.slug, photo: '' };
      });
    }
    if (profileStats?.topListenedArtists) {
      return profileStats.topListenedArtists.slice(0, 5).map(a => ({ name: a.name, slug: a.slug, photo: a.photo }));
    }
    return [];
  })();

  const recentlyListened = historyTracks.slice(0, 6);

  const genreColors: Record<string, string> = {
    'Rap': 'bg-red-500', 'Хип-хоп': 'bg-red-500', 'Рэп': 'bg-red-500',
    'Electronic': 'bg-purple-500', 'Pop': 'bg-pink-500', 'Rock': 'bg-blue-500',
    'R&B': 'bg-indigo-500', 'Trap': 'bg-orange-500', 'Drill': 'bg-emerald-500',
    'Phonk': 'bg-violet-500', 'Другое': 'bg-zinc-500',
  };

  const heroCover = featuredTracks[0]?.cover || recentlyLiked[0]?.cover || '';

  /* Handlers */

  const statusIcon = (status: string) => {
    if (status === 'pending') return <Clock size={14} className="text-yellow-400" />;
    if (status === 'approved') return <CheckCircle size={14} className="text-green-400" />;
    if (status === 'rejected') return <XCircle size={14} className="text-red-400" />;
    return <Clock size={14} className="text-zinc-400" />;
  };

  const statusLabel = (status: string) => {
    if (status === 'pending') return 'На проверке';
    if (status === 'approved') return 'Опубликован';
    if (status === 'rejected') return 'Отклонён';
    return 'Отложен';
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    await updateProfile({ name: editName.trim(), bio: editBio.trim() });
    setSaving(false);
    setEditing(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = getToken();
      const res = await fetch(apiUrl('/upload/avatar'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        await updateProfile({ avatar: data.url });
      }
    } catch {
      // ignore
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlTitle.trim() || creating) return;
    setCreating(true);
    await addPlaylist(newPlTitle.trim(), [], newPlDesc.trim(), newPlPublic);
    setNewPlTitle('');
    setNewPlDesc('');
    setNewPlPublic(false);
    setShowCreatePlaylist(false);
    setCreating(false);
  };

  const handleDeletePlaylist = async (plId: string) => {
    if (!confirm('Удалить плейлист?')) return;
    await deletePlaylist(plId);
  };

  const handleTogglePlaylistVisibility = async (pl: Playlist) => {
    await updatePlaylist(pl.id, { isPublic: !pl.isPublic });
  };

  const handleShareProfile = () => {
    const url = `${window.location.origin}/user/${currentUser!.id}`;
    if (navigator.share) {
      navigator.share({ title: currentUser!.name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  /* Track row helper */
  const TrackRow = ({ t, queue, showHeart = true }: { t: Track; queue: Track[]; showHeart?: boolean }) => {
    const isCurrent = player.currentTrack?.id === t.id;
    const isPlaying = isCurrent && player.isPlaying;
    const isLiked = currentUser!.likedTracks.includes(t.id);
    return (
      <button
        onClick={() => isCurrent ? togglePlay() : playTrack(t, queue)}
        className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors group ${isCurrent ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
      >
        <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 relative">
          <img src={t.cover} alt="" className="w-full h-full object-cover" />
          <div className={`absolute inset-0 bg-black/50 flex items-center justify-center ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
            {isPlaying ? <Pause size={14} fill="white" className="text-white" /> : <Play size={14} fill="white" className="text-white ml-0.5" />}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-medium truncate ${isCurrent ? 'text-red-400' : 'text-white'}`}>{t.title}</p>
          <p className="text-zinc-500 text-[11px] truncate">{t.artist}{(t as any).meta?.album ? ` · ${(t as any).meta.album}` : ''}</p>
        </div>
        {showHeart && (
          <Heart size={14} className={isLiked ? 'text-red-400' : 'text-zinc-700'} fill={isLiked ? 'currentColor' : 'none'} />
        )}
      </button>
    );
  };

  /* RENDER */

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">

      {/* HERO HEADER */}
      <div className="relative w-full overflow-hidden" style={{ minHeight: 280 }}>
        {heroCover && (
          <img
            src={heroCover}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/20 via-[#0b0b0b]/70 to-[#0b0b0b]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b0b]/80 via-transparent to-[#0b0b0b]/60" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-20 pb-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
            <div className="relative group shrink-0">
              <img
                src={currentUser.avatar || '/default-avatar.png'}
                alt={currentUser.name}
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover ring-4 ring-[#0b0b0b] shadow-2xl shadow-black/50"
              />
              {currentUser.role === 'admin' && (
                <div className="absolute bottom-1 right-1 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-[#0b0b0b]">
                  <Shield size={13} className="text-white" />
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              >
                <Camera size={22} className="text-white" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>

            <div className="flex-1 text-center sm:text-left pb-1">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-0.5">{currentUser.name}</h1>
              <p className="text-zinc-400 text-sm mb-3">@{currentUser.name.toLowerCase().replace(/\s+/g, '')}</p>
              <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                <button
                  onClick={handleShareProfile}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 backdrop-blur-sm rounded-full text-sm font-medium transition-all"
                >
                  <Share2 size={14} />
                  Поделиться
                </button>
                <button
                  onClick={() => setEditing(!editing)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm text-red-400 rounded-full text-sm font-medium transition-all"
                >
                  <Edit3 size={14} />
                  Редактировать
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit profile panel */}
      {editing && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 mb-6">
          <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 max-w-lg">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Редактировать профиль</h3>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-red-500/30 mb-3"
              placeholder="Имя"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveProfile(); }}
            />
            <textarea
              value={editBio}
              onChange={e => setEditBio(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-red-500/30 mb-4 resize-none"
              rows={2}
              placeholder="О себе — статус, настроение, что слушаете..."
            />
            <div className="flex gap-2">
              <button onClick={handleSaveProfile} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                <Save size={14} />
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button onClick={() => { setEditing(false); setEditName(currentUser.name); setEditBio(currentUser.bio || ''); }} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-400 text-sm rounded-xl transition-colors">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN 3-COLUMN LAYOUT */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-32">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* LEFT SIDEBAR */}
          <aside className="w-full lg:w-64 shrink-0 space-y-5">

            <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-5">
              <h2 className="text-lg font-bold mb-1">{currentUser.name}</h2>
              {currentUser.bio && (
                <p className="text-zinc-400 text-sm mb-3 leading-relaxed">{currentUser.bio}</p>
              )}
              <p className="text-zinc-600 text-xs mb-3">{currentUser.email}</p>

              <div className="flex items-center gap-4 text-sm mb-4">
                <Link to={`/user/${currentUser.id}`} className="hover:text-white transition-colors">
                  <span className="text-white font-bold">{followersCount}</span>{' '}
                  <span className="text-zinc-500 text-xs">подписчиков</span>
                </Link>
                <Link to={`/user/${currentUser.id}`} className="hover:text-white transition-colors">
                  <span className="text-white font-bold">{followingCount}</span>{' '}
                  <span className="text-zinc-500 text-xs">подписок</span>
                </Link>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleShareProfile}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium text-white transition-colors"
                >
                  <Share2 size={14} />
                  Поделиться профилем
                </button>
                <Link to="/submit" className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                  <Send size={14} />
                  Предложить трек
                </Link>
                {currentUser.role === 'admin' && (
                  <Link to="/admin" className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                    <Settings size={14} />
                    Панель
                  </Link>
                )}
              </div>
            </div>

            <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Музыкальный профиль</h3>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-zinc-400">
                    <Music size={14} className="text-red-400" />
                    Треки
                  </span>
                  <span className="text-white font-bold">{songsCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-zinc-400">
                    <Disc3 size={14} className="text-blue-400" />
                    Альбомы
                  </span>
                  <span className="text-white font-bold">{albumsCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-zinc-400">
                    <Heart size={14} className="text-pink-400" />
                    Артисты
                  </span>
                  <span className="text-white font-bold">{likedArtistsCount}</span>
                </div>
              </div>

              {genreList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {genreList.map(g => (
                    <span key={g} className="px-2.5 py-1 bg-white/5 border border-white/[0.06] rounded-full text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-1.5 text-xs text-zinc-600">
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} />
                  На платформе с {new Date(currentUser.joinedAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                </div>
                {profileStats?.lastActive && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} />
                    Был {timeAgo(profileStats.lastActive)}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => { logout(); navigate('/'); }}
              className="flex items-center gap-2 text-zinc-600 hover:text-red-400 transition-colors text-sm w-full px-2"
            >
              <LogOut size={14} />
              <span>Выйти из аккаунта</span>
            </button>
          </aside>

          {/* CENTER CONTENT */}
          <main className="flex-1 min-w-0 space-y-6">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold">Любимые треки</h2>
                  {featuredTracks.length > 0 && (
                    <Link to="/liked" className="text-zinc-500 hover:text-white text-xs flex items-center gap-0.5 transition-colors">
                      Все <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
                {featuredTracks.length > 0 ? (
                  <div className="space-y-0.5">
                    {featuredTracks.map(t => (
                      <TrackRow key={t.id} t={t} queue={featuredTracks} />
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Heart size={24} className="text-zinc-800 mx-auto mb-2" />
                    <p className="text-zinc-600 text-xs">Лайкайте треки, чтобы они появились здесь</p>
                  </div>
                )}
              </div>

              <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold">Недавние лайки</h2>
                  {recentlyLiked.length > 0 && (
                    <Link to="/liked" className="text-zinc-500 hover:text-white text-xs flex items-center gap-0.5 transition-colors">
                      Все <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
                {recentlyLiked.length > 0 ? (
                  <div className="space-y-0.5">
                    {recentlyLiked.map(t => (
                      <TrackRow key={t.id} t={t} queue={recentlyLiked} showHeart />
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Heart size={24} className="text-zinc-800 mx-auto mb-2" />
                    <p className="text-zinc-600 text-xs">Пока пусто</p>
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-white/[0.04]">
              <div className="flex gap-0 overflow-x-auto scrollbar-hide">
                {([
                  { key: 'playlists' as Tab, label: 'Плейлисты', icon: ListMusic },
                  { key: 'tracks' as Tab, label: 'Треки', icon: Music },
                  { key: 'albums' as Tab, label: 'Альбомы', icon: Disc3 },
                  { key: 'history' as Tab, label: 'История', icon: History },
                  { key: 'activity' as Tab, label: 'Активность', icon: Activity },
                ] as const).map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                        tab === t.key
                          ? 'text-white border-red-500'
                          : 'text-zinc-500 border-transparent hover:text-zinc-300'
                      }`}
                    >
                      <Icon size={14} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}

            {tab === 'playlists' && (
              <div>
                {showCreatePlaylist ? (
                  <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-5 mb-5">
                    <h3 className="text-sm font-semibold mb-3">Новый плейлист</h3>
                    <input
                      value={newPlTitle}
                      onChange={e => setNewPlTitle(e.target.value)}
                      placeholder="Название плейлиста"
                      className="w-full bg-white/5 border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/30 mb-2"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleCreatePlaylist(); }}
                    />
                    <textarea
                      value={newPlDesc}
                      onChange={e => setNewPlDesc(e.target.value)}
                      placeholder="Описание (необязательно)"
                      className="w-full bg-white/5 border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/30 mb-3 resize-none"
                      rows={2}
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newPlPublic}
                          onChange={e => setNewPlPublic(e.target.checked)}
                          className="rounded border-white/20 bg-white/5"
                        />
                        <Globe size={13} />
                        Публичный
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowCreatePlaylist(false); setNewPlTitle(''); setNewPlDesc(''); }}
                          className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={handleCreatePlaylist}
                          disabled={!newPlTitle.trim() || creating}
                          className="px-5 py-2 bg-red-500 hover:bg-red-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-xl transition-colors"
                        >
                          {creating ? 'Создание...' : 'Создать'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCreatePlaylist(true)}
                    className="flex items-center gap-2 w-full px-4 py-3 bg-[#121212] border border-dashed border-white/[0.06] rounded-2xl text-sm text-zinc-400 hover:text-white hover:border-white/10 transition-colors mb-5"
                  >
                    <Plus size={16} />
                    Создать плейлист
                  </button>
                )}

                {playlists.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {playlists.map(pl => (
                      <div key={pl.id} className="group relative">
                        <Link to={`/playlists/${pl.id}`} className="block">
                          <div className="aspect-square rounded-xl overflow-hidden bg-[#181818] mb-2.5 relative">
                            {pl.coverUrl ? (
                              <img src={apiUrl(pl.coverUrl)} alt={pl.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                                <ListMusic size={32} className="text-zinc-700" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center shadow-xl shadow-red-500/30 translate-y-2 group-hover:translate-y-0 transition-transform">
                                <Play size={20} fill="white" className="text-white ml-0.5" />
                              </div>
                            </div>
                            {!pl.isPublic && (
                              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5">
                                <Lock size={10} className="text-zinc-400" />
                              </div>
                            )}
                          </div>
                          <p className="text-sm font-semibold truncate group-hover:text-red-400 transition-colors">{pl.title}</p>
                          <p className="text-zinc-600 text-xs">{pl.tracksCount} Треков</p>
                        </Link>
                        <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button
                            onClick={(e) => { e.preventDefault(); handleTogglePlaylistVisibility(pl); }}
                            className="p-1.5 bg-black/60 backdrop-blur-sm rounded-lg text-zinc-300 hover:text-white transition-colors"
                            title={pl.isPublic ? 'Сделать приватным' : 'Сделать публичным'}
                          >
                            {pl.isPublic ? <Lock size={12} /> : <Globe size={12} />}
                          </button>
                          <button
                            onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(`${window.location.origin}/playlists/${pl.id}`).catch(() => {}); }}
                            className="p-1.5 bg-black/60 backdrop-blur-sm rounded-lg text-zinc-300 hover:text-white transition-colors"
                            title="Скопировать ссылку"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={(e) => { e.preventDefault(); handleDeletePlaylist(pl.id); }}
                            className="p-1.5 bg-black/60 backdrop-blur-sm rounded-lg text-zinc-300 hover:text-red-400 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !showCreatePlaylist ? (
                  <div className="py-14 text-center">
                    <ListMusic size={36} className="text-zinc-800 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm mb-1">У вас пока нет плейлистов</p>
                    <p className="text-zinc-700 text-xs">Создайте первый плейлист и добавьте треки</p>
                  </div>
                ) : null}
              </div>
            )}

            {tab === 'tracks' && (
              <div>
                {(() => {
                  const likedTracks = tracks.filter(t => currentUser!.likedTracks.includes(t.id));
                  return likedTracks.length > 0 ? (
                    <div className="space-y-0.5">
                      {likedTracks.map(t => (
                        <TrackRow key={t.id} t={t} queue={likedTracks} />
                      ))}
                    </div>
                  ) : (
                    <div className="py-16 text-center">
                      <Music size={36} className="text-zinc-800 mx-auto mb-3" />
                      <p className="text-zinc-500 text-sm">Нет сохранённых треков</p>
                    </div>
                  );
                })()}
              </div>
            )}

            {tab === 'albums' && (
              <div>
                {likedAlbums.length > 0 ? (
                  <div className="space-y-4">
                    {likedAlbums.map(album => (
                      <div key={album.name} className="bg-[#121212] border border-white/[0.04] rounded-2xl p-5">
                        <div className="flex flex-col sm:flex-row gap-5">
                          <Link to={`/artist/${album.artistSlug}`} className="shrink-0 group">
                            <div className="w-32 h-32 rounded-xl overflow-hidden">
                              <img src={album.cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            </div>
                          </Link>
                          <div className="flex-1 min-w-0">
                            <Link to={`/artist/${album.artistSlug}`} className="hover:text-red-400 transition-colors">
                              <h3 className="text-lg font-bold mb-0.5">{album.name}</h3>
                            </Link>
                            <p className="text-zinc-500 text-sm mb-3">{album.artist} · {album.year}</p>
                            <div className="space-y-0">
                              {album.tracks.map((t, i) => {
                                const isCurrent = player.currentTrack?.id === t.id;
                                const isPlaying = isCurrent && player.isPlaying;
                                return (
                                  <button
                                    key={t.id}
                                    onClick={() => isCurrent ? togglePlay() : playTrack(t, album.tracks)}
                                    className={`flex items-center gap-3 w-full px-2 py-1.5 rounded text-left transition-colors group ${isCurrent ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
                                  >
                                    <span className={`w-5 text-center text-xs tabular-nums ${isCurrent ? 'text-red-400' : 'text-zinc-600'}`}>
                                      {isCurrent ? (isPlaying ? '\u25B8' : '\u275A\u275A') : (i + 1)}
                                    </span>
                                    <span className={`flex-1 text-sm truncate ${isCurrent ? 'text-red-400 font-medium' : 'text-white'}`}>{t.title}</span>
                                    <Heart size={12} className={currentUser!.likedTracks.includes(t.id) ? 'text-red-400' : 'text-zinc-700 opacity-0 group-hover:opacity-100'} fill={currentUser!.likedTracks.includes(t.id) ? 'currentColor' : 'none'} />
                                    <span className="text-zinc-600 text-xs tabular-nums w-10 text-right">{t.duration ? formatDuration(t.duration) : ''}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <Disc3 size={36} className="text-zinc-800 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">Нет сохранённых альбомов</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'history' && (
              <div>
                {historyTracks.length > 0 ? (
                  <div className="space-y-0.5">
                    {historyTracks.map((t, idx) => {
                      const isCurrent = player.currentTrack?.id === t.id;
                      const isPlaying = isCurrent && player.isPlaying;
                      return (
                        <button key={`${t.id}-${idx}`} onClick={() => isCurrent ? togglePlay() : playTrack(t, historyTracks)}
                          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors group ${isCurrent ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}>
                          <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 relative">
                            <img src={t.cover} alt="" className="w-full h-full object-cover" />
                            <div className={`absolute inset-0 bg-black/50 flex items-center justify-center ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                              {isPlaying ? <Pause size={14} fill="white" className="text-white" /> : <Play size={14} fill="white" className="text-white ml-0.5" />}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium truncate ${isCurrent ? 'text-red-400' : 'text-white'}`}>{t.title}</p>
                            <p className="text-zinc-500 text-[11px] truncate">{t.artist}</p>
                          </div>
                          <span className="text-zinc-700 text-[10px] shrink-0 whitespace-nowrap">{timeAgo(t.playedAt)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <History size={36} className="text-zinc-800 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">Здесь будет история прослушиваний</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'activity' && (
              <div>
                {activityFeed.length > 0 ? (
                  <div className="space-y-0.5">
                    {activityFeed.map((item, i) => {
                      const info = activityLabel(item.type);
                      return (
                        <div key={`${item.type}-${item.createdAt}-${i}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center bg-white/5 shrink-0 ${info.color}`}>
                            {info.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-zinc-300">
                              <span className={`font-medium ${info.color}`}>{info.text}</span>
                              {item.trackTitle && (
                                <>
                                  {' '}
                                  <Link to={`/track/${item.trackId}`} className="text-white font-medium hover:text-red-400 transition-colors">
                                    {item.trackArtist} — {item.trackTitle}
                                  </Link>
                                </>
                              )}
                              {item.type === 'follow_artist' && item.artistName && (
                                <>
                                  {' '}
                                  <Link to={`/artist/${item.artistSlug}`} className="text-white font-medium hover:text-red-400 transition-colors">
                                    {item.artistName}
                                  </Link>
                                </>
                              )}
                            </p>
                          </div>
                          {item.trackCover && (
                            <img src={item.trackCover} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                          )}
                          {item.type === 'follow_artist' && item.artistPhoto && !item.trackCover && (
                            <img src={item.artistPhoto} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          )}
                          <span className="text-zinc-700 text-[10px] shrink-0 whitespace-nowrap">{timeAgo(item.createdAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <Activity size={36} className="text-zinc-800 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">Слушайте музыку, здесь появится активность</p>
                  </div>
                )}
              </div>
            )}

            {/* Submissions */}
            {submissions.length > 0 && (
              <div className="mt-6 bg-[#121212] border border-white/[0.04] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Send size={14} />
                  Мои заявки
                  <span className="bg-white/5 text-zinc-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{submissions.length}</span>
                </h3>
                <div className="space-y-2">
                  {submissions.map(sub => (
                    <div key={sub.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                      {sub.coverUrl ? (
                        <img src={apiUrl(sub.coverUrl)} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-white/5 flex items-center justify-center shrink-0">
                          <Send size={14} className="text-zinc-700" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-white font-medium truncate">{sub.title}</p>
                        <p className="text-zinc-600 text-[11px] truncate">{sub.artist} · {sub.genre}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {statusIcon(sub.status)}
                        <span className={`text-xs font-medium ${
                          sub.status === 'pending' ? 'text-yellow-400' :
                          sub.status === 'approved' ? 'text-green-400' :
                          sub.status === 'rejected' ? 'text-red-400' : 'text-zinc-400'
                        }`}>{statusLabel(sub.status)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>

          {/* RIGHT SIDEBAR */}
          <aside className="w-full lg:w-72 shrink-0 space-y-5">

            {player.currentTrack && player.isPlaying && (
              <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-4">
                <p className="text-[10px] uppercase tracking-widest text-green-400 font-semibold mb-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Сейчас слушает
                </p>
                <button
                  onClick={() => navigate(`/track/${player.currentTrack!.id}`)}
                  className="flex items-center gap-3 w-full text-left hover:bg-white/[0.04] rounded-lg p-1 -m-1 transition-colors"
                >
                  <img src={player.currentTrack.cover} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{player.currentTrack.title}</p>
                    <p className="text-zinc-500 text-xs truncate">{player.currentTrack.artist}</p>
                  </div>
                </button>
              </div>
            )}

            <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Недавно слушал</h3>
                {recentlyListened.length > 0 && (
                  <button onClick={() => setTab('history')} className="text-zinc-500 hover:text-white text-xs flex items-center gap-0.5 transition-colors">
                    Все <ChevronRight size={14} />
                  </button>
                )}
              </div>
              {recentlyListened.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {recentlyListened.map((t, idx) => (
                    <button
                      key={`${t.id}-${idx}`}
                      onClick={() => player.currentTrack?.id === t.id ? togglePlay() : playTrack(t, recentlyListened)}
                      className="group"
                    >
                      <div className="aspect-square rounded-lg overflow-hidden relative mb-1">
                        <img src={t.cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play size={16} fill="white" className="text-white" />
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-400 truncate">{t.title}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-700 text-xs text-center py-4">Ещё нет истории</p>
              )}
            </div>

            {genreBreakdown.length > 0 && (
              <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Топ жанры</h3>
                  <span className="text-zinc-600 text-[10px]">Все жанры</span>
                </div>
                <div className="space-y-3">
                  {genreBreakdown.map(g => (
                    <div key={g.genre}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-300 font-medium">{g.genre}</span>
                        <span className="text-zinc-500">{g.pct}%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${genreColors[g.genre] || 'bg-zinc-500'}`}
                          style={{ width: `${g.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {favoriteArtists.length > 0 && (
              <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Любимые артисты</h3>
                  <Link to="/artists" className="text-zinc-500 hover:text-white text-xs flex items-center gap-0.5 transition-colors">
                    Все <ChevronRight size={14} />
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  {favoriteArtists.map(a => (
                    <Link
                      key={a.slug}
                      to={`/artist/${a.slug}`}
                      className="flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl px-3 py-2 transition-colors group"
                    >
                      {a.photo ? (
                        <img src={a.photo} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                          {a.name[0]}
                        </div>
                      )}
                      <span className="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">{a.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {profileStats && (
              <div className="bg-[#121212] border border-white/[0.04] rounded-2xl p-4">
                <h3 className="text-sm font-semibold mb-3">Статистика</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <Headphones size={16} className="text-green-400 mx-auto mb-1" />
                    <p className="text-lg font-black">{formatPlays(profileStats.monthPlays)}</p>
                    <p className="text-zinc-600 text-[10px]">За месяц</p>
                  </div>
                  <div className="text-center">
                    <Music size={16} className="text-blue-400 mx-auto mb-1" />
                    <p className="text-lg font-black">{formatPlays(profileStats.totalPlays)}</p>
                    <p className="text-zinc-600 text-[10px]">Всего</p>
                  </div>
                  <div className="text-center">
                    <Clock size={16} className="text-amber-400 mx-auto mb-1" />
                    <p className="text-lg font-black">{formatTime(profileStats.monthTimeSeconds)}</p>
                    <p className="text-zinc-600 text-[10px]">Время/мес</p>
                  </div>
                  <div className="text-center">
                    <Heart size={16} className="text-red-400 mx-auto mb-1" />
                    <p className="text-lg font-black">{currentUser.likedTracks.length}</p>
                    <p className="text-zinc-600 text-[10px]">Лайков</p>
                  </div>
                </div>
              </div>
            )}
          </aside>

        </div>
      </div>
    </div>
  );
}
