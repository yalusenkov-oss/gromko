import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStore, Track } from '../store';
import { Link, useNavigate } from 'react-router-dom';
import {
  Send, Clock, CheckCircle, XCircle, Heart, LogOut,
  Settings, ChevronRight, Shield, Edit3, Camera, Save, X,
  Play, Pause, Music, Disc3, Radio,
  Activity, History, ListMusic, TrendingUp, Headphones,
  Sparkles, Share2, UserPlus, Calendar
} from 'lucide-react';
import { apiUrl } from '../lib/api';
import { formatDuration, formatPlays } from '../utils/format';

/* ─── Types ─── */

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

type Tab = 'tracks' | 'albums' | 'history' | 'activity';

/* ─── Helpers ─── */

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
      return { text: 'подписался на', icon: <UserPlus size={14} />, color: 'text-cyan-400' };
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

/* ─── Component ─── */

export default function ProfilePage() {
  const {
    currentUser, submissions, fetchMySubmissions, logout,
    updateProfile, tracks, player, playTrack, togglePlay
  } = useStore();

  const [tab, setTab] = useState<Tab>('tracks');
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tasteSummary, setTasteSummary] = useState<TasteSummary | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [historyTracks, setHistoryTracks] = useState<HistoryTrack[]>([]);

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
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchMySubmissions();
      setEditName(currentUser.name);
      fetchProfileData();
    }
  }, [currentUser, fetchProfileData, fetchMySubmissions]);

  useEffect(() => {
    if (!currentUser) navigate('/');
  }, [currentUser, navigate]);

  if (!currentUser) return null;

  /* ─── Computed data ─── */

  const likedAlbumsCount = currentUser.likedAlbums ? currentUser.likedAlbums.length : 0;
  const likedArtistsCount = currentUser.likedArtists ? currentUser.likedArtists.length : 0;

  const recentlyLiked = tracks.filter(t => currentUser.likedTracks.includes(t.id)).slice(0, 5);

  const featuredTracks = useMemo(() => {
    const liked = new Set(currentUser.likedTracks);
    return tracks
      .filter(t => liked.has(t.id))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 6);
  }, [tracks, currentUser.likedTracks]);

  const likedAlbums = useMemo(() => {
    if (!currentUser.likedAlbums || currentUser.likedAlbums.length === 0) {
      // Also build from liked tracks
      const albumMap = new Map<string, { name: string; cover: string; artist: string; artistSlug: string; year: number; tracks: Track[] }>();
      const likedSet = new Set(currentUser.likedTracks);
      for (const t of tracks) {
        if (!likedSet.has(t.id)) continue;
        const albumName = t.meta?.album;
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
      const albumName = t.meta?.album;
      if (!albumName || !currentUser.likedAlbums.includes(albumName)) continue;
      if (!albumMap.has(albumName)) {
        albumMap.set(albumName, { name: albumName, cover: t.cover, artist: t.artist, artistSlug: t.artistSlug, year: t.year, tracks: [] });
      }
      albumMap.get(albumName)!.tracks.push(t);
    }
    return Array.from(albumMap.values()).slice(0, 4);
  }, [tracks, currentUser.likedTracks, currentUser.likedAlbums]);

  const genreBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    const likedSet = new Set(currentUser.likedTracks);
    for (const t of tracks) {
      if (!likedSet.has(t.id) || !t.genre) continue;
      map.set(t.genre, (map.get(t.genre) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [tracks, currentUser.likedTracks]);

  const genreList = genreBreakdown.map(([g]) => g);

  const songsCount = useMemo(() => {
    return tracks.filter(t => currentUser.likedTracks.includes(t.id)).length;
  }, [tracks, currentUser.likedTracks]);

  const albumsCount = likedAlbums.length || likedAlbumsCount;

  /* ─── Handlers ─── */

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
    await updateProfile({ name: editName.trim() });
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

  /* ─── Track row helper ─── */
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
          <p className="text-zinc-500 text-[11px] truncate">{t.artist}{t.meta?.album ? ` \u2022 ${t.meta.album}` : ''}</p>
        </div>
        {showHeart && (
          <Heart size={14} className={isLiked ? 'text-red-400' : 'text-zinc-700'} fill={isLiked ? 'currentColor' : 'none'} />
        )}
      </button>
    );
  };

  /* ─── Render ─── */

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-14 pb-28">
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-6">
        {/* ═══ Two-column layout ═══ */}
        <div className="flex flex-col md:flex-row gap-8">

          {/* ─── LEFT SIDEBAR ─── */}
          <aside className="w-full md:w-72 shrink-0">
            {/* Avatar */}
            <div className="flex flex-col items-center md:items-start">
              <div className="relative group mb-4">
                <img
                  src={currentUser.avatar || '/default-avatar.png'}
                  alt={currentUser.name}
                  className="w-36 h-36 md:w-44 md:h-44 rounded-full object-cover ring-4 ring-zinc-900"
                />
                {currentUser.role === 'admin' && (
                  <div className="absolute bottom-2 right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-zinc-950">
                    <Shield size={15} className="text-white" />
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  <Camera size={24} className="text-white" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </div>

              {/* Name */}
              {editing ? (
                <div className="flex items-center gap-2 mb-2 w-full">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-xl font-bold text-white focus:outline-none focus:border-red-500/50 flex-1"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveProfile(); }}
                  />
                  <button onClick={handleSaveProfile} disabled={saving} className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors">
                    <Save size={16} />
                  </button>
                  <button onClick={() => { setEditing(false); setEditName(currentUser.name); }} className="p-2 bg-white/10 hover:bg-white/15 text-zinc-400 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-black">{currentUser.name}</h1>
                  <button onClick={() => setEditing(true)} className="p-1 text-zinc-600 hover:text-white transition-colors">
                    <Edit3 size={14} />
                  </button>
                </div>
              )}

              {/* Role / email */}
              <p className="text-zinc-500 text-sm mb-4 text-center md:text-left">{currentUser.email}</p>

              {/* Buttons */}
              <div className="flex flex-col gap-2 w-full mb-5">
                <Link to="/submit" className="flex items-center justify-center gap-2 px-4 py-2 border border-white/10 rounded-full text-sm font-medium text-white hover:bg-white/5 transition-colors">
                  <Send size={14} />
                  Предложить трек
                </Link>
                {currentUser.role === 'admin' && (
                  <Link to="/admin" className="flex items-center justify-center gap-2 px-4 py-2 border border-white/10 rounded-full text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-colors">
                    <Settings size={14} />
                    Админ-панель
                  </Link>
                )}
              </div>

              {/* Bio / taste description */}
              {tasteSummary && tasteSummary.eventsProcessed > 0 && (
                <div className="mb-5 text-sm text-zinc-400 leading-relaxed">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-1.5">
                      <Headphones size={13} className="text-green-400" />
                      <span className="text-white font-medium">{tasteSummary.avgListenRatio}%</span>
                      <span className="text-zinc-600 text-xs">досл.</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={13} className="text-purple-400" />
                      <span className="text-white font-medium">{tasteSummary.explorationScore}%</span>
                      <span className="text-zinc-600 text-xs">иссл.</span>
                    </div>
                  </div>
                  {tasteSummary.preferredBpm.min > 0 && (
                    <p className="text-zinc-600 text-xs">BPM: {tasteSummary.preferredBpm.min}–{tasteSummary.preferredBpm.max} · {tasteSummary.eventsProcessed} событий</p>
                  )}
                </div>
              )}

              {/* Stats rows */}
              <div className="w-full space-y-0 border-t border-white/5 pt-4 mb-5">
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-zinc-400">Треки</span>
                  <span className="text-white font-semibold">{songsCount}</span>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-zinc-400">Альбомы</span>
                  <span className="text-white font-semibold">{albumsCount}</span>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-zinc-400">Артисты</span>
                  <span className="text-white font-semibold">{likedArtistsCount}</span>
                </div>
                {profileStats && (
                  <>
                    <div className="flex justify-between py-1.5 text-sm">
                      <span className="text-zinc-400">Прослушивания</span>
                      <span className="text-white font-semibold">{formatPlays(profileStats.totalPlays)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 text-sm">
                      <span className="text-zinc-400">Время</span>
                      <span className="text-white font-semibold">{formatTime(profileStats.totalTimeSeconds)}</span>
                    </div>
                    {profileStats.playlistsCount > 0 && (
                      <div className="flex justify-between py-1.5 text-sm">
                        <span className="text-zinc-400">Плейлисты</span>
                        <span className="text-white font-semibold">{profileStats.playlistsCount}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Genres */}
              {genreList.length > 0 && (
                <div className="w-full mb-5">
                  <h4 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Жанры</h4>
                  <p className="text-zinc-300 text-sm leading-relaxed">{genreList.join(', ')}</p>
                </div>
              )}

              {/* Member since */}
              <div className="w-full text-zinc-600 text-xs flex items-center gap-1.5 mb-5">
                <Calendar size={12} />
                с {new Date(currentUser.joinedAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
              </div>

              {/* Logout */}
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="flex items-center gap-2 text-zinc-600 hover:text-red-400 transition-colors text-sm w-full"
              >
                <LogOut size={14} />
                <span>Выйти</span>
              </button>
            </div>
          </aside>

          {/* ─── RIGHT CONTENT ─── */}
          <main className="flex-1 min-w-0">
            {/* Top section: Featured Tracks + Recently Liked side-by-side */}
            <div className="flex flex-col lg:flex-row gap-6 mb-8">
              {/* Featured Tracks */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold">Любимые треки</h2>
                  {featuredTracks.length > 0 && (
                    <Link to="/liked" className="text-zinc-500 hover:text-white text-xs flex items-center gap-1 transition-colors">
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
                  <div className="py-10 text-center">
                    <Heart size={28} className="text-zinc-800 mx-auto mb-2" />
                    <p className="text-zinc-600 text-sm">Лайкайте треки, они появятся здесь</p>
                  </div>
                )}
              </div>

              {/* Recently Liked */}
              <div className="w-full lg:w-64 shrink-0">
                <h2 className="text-lg font-bold mb-3">Недавние лайки</h2>
                {recentlyLiked.length > 0 ? (
                  <div className="space-y-2">
                    {recentlyLiked.map(t => (
                      <button
                        key={t.id}
                        onClick={() => player.currentTrack?.id === t.id ? togglePlay() : playTrack(t, recentlyLiked)}
                        className="flex items-center gap-2.5 w-full text-left group hover:bg-white/[0.04] rounded-lg p-1.5 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 relative">
                          <img src={t.cover} alt="" className="w-full h-full object-cover" />
                          <div className={`absolute inset-0 bg-black/50 flex items-center justify-center ${player.currentTrack?.id === t.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                            {player.currentTrack?.id === t.id && player.isPlaying
                              ? <Pause size={10} fill="white" className="text-white" />
                              : <Play size={10} fill="white" className="text-white ml-0.5" />}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[12px] font-medium truncate ${player.currentTrack?.id === t.id ? 'text-red-400' : 'text-white'}`}>{t.title}</p>
                          <p className="text-zinc-600 text-[10px] truncate">{t.artist}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-700 text-sm">Пока пусто</p>
                )}
                {recentlyLiked.length > 0 && (
                  <Link to="/liked" className="flex items-center gap-1 text-zinc-500 hover:text-white text-xs mt-3 transition-colors">
                    Все лайки <ChevronRight size={14} />
                  </Link>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-white/5 mb-6">
              <div className="flex gap-0 overflow-x-auto scrollbar-hide">
                {([
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
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
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

            {/* ═══ Tab Content ═══ */}

            {/* Tracks tab — all liked tracks */}
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

            {/* Albums tab */}
            {tab === 'albums' && (
              <div>
                {likedAlbums.length > 0 ? (
                  <div className="space-y-8">
                    {likedAlbums.map(album => (
                      <div key={album.name} className="flex flex-col sm:flex-row gap-5">
                        {/* Album cover */}
                        <Link to={`/artist/${album.artistSlug}`} className="shrink-0 group">
                          <div className="w-36 h-36 rounded-lg overflow-hidden">
                            <img src={album.cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          </div>
                          <div className="mt-2 flex items-center gap-1.5">
                            <Heart size={12} className="text-red-400" fill="currentColor" />
                            <span className="text-zinc-600 text-xs">...</span>
                          </div>
                        </Link>
                        {/* Album info + tracks */}
                        <div className="flex-1 min-w-0">
                          <Link to={`/artist/${album.artistSlug}`} className="hover:text-red-400 transition-colors">
                            <h3 className="text-lg font-bold mb-0.5">{album.name}</h3>
                          </Link>
                          <p className="text-zinc-500 text-sm mb-3">{album.year}</p>
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
                                    {isCurrent ? (isPlaying ? '▸' : '❚❚') : (i + 1)}
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

            {/* History tab */}
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

            {/* Activity tab */}
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

            {/* Submissions section (always visible at bottom if has any) */}
            {submissions.length > 0 && (
              <div className="mt-10 border-t border-white/5 pt-6">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Send size={14} />
                  Мои заявки
                  <span className="bg-white/5 text-zinc-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{submissions.length}</span>
                </h3>
                <div className="space-y-2">
                  {submissions.map(sub => (
                    <div key={sub.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02]">
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

            {/* Algorithmic profile section (bottom of right column) */}
            {tasteSummary && tasteSummary.eventsProcessed > 0 && (
              <div className="mt-10 border-t border-white/5 pt-6">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Radio size={14} />
                  Музыкальный профиль
                </h3>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-white">{tasteSummary.avgListenRatio}<span className="text-xs text-zinc-500">%</span></p>
                    <p className="text-zinc-500 text-[10px]">Дослушивание</p>
                    <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${tasteSummary.avgListenRatio}%` }} />
                    </div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-white">{tasteSummary.skipRate}<span className="text-xs text-zinc-500">%</span></p>
                    <p className="text-zinc-500 text-[10px]">Пропуски</p>
                    <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${tasteSummary.skipRate}%` }} />
                    </div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-white">{tasteSummary.explorationScore}<span className="text-xs text-zinc-500">%</span></p>
                    <p className="text-zinc-500 text-[10px]">Исследование</p>
                    <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${tasteSummary.explorationScore}%` }} />
                    </div>
                  </div>
                </div>
                {tasteSummary.topGenres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {tasteSummary.topGenres.slice(0, 6).map(g => (
                      <span key={g.genre} className="px-2.5 py-1 bg-white/5 rounded-full text-xs text-zinc-300 border border-white/5">
                        {g.genre}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-zinc-700 text-[10px]">Рассчитано на основе {tasteSummary.eventsProcessed} событий</p>
              </div>
            )}

            {/* Listening stats at bottom */}
            {profileStats && (
              <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                  <Headphones size={18} className="text-green-400 mx-auto mb-1.5" />
                  <p className="text-lg font-black text-white">{formatPlays(profileStats.monthPlays)}</p>
                  <p className="text-zinc-600 text-[10px]">За месяц</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                  <Music size={18} className="text-blue-400 mx-auto mb-1.5" />
                  <p className="text-lg font-black text-white">{formatPlays(profileStats.totalPlays)}</p>
                  <p className="text-zinc-600 text-[10px]">Всего</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                  <Clock size={18} className="text-amber-400 mx-auto mb-1.5" />
                  <p className="text-lg font-black text-white">{formatTime(profileStats.monthTimeSeconds)}</p>
                  <p className="text-zinc-600 text-[10px]">Время/месяц</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                  <TrendingUp size={18} className="text-red-400 mx-auto mb-1.5" />
                  <p className="text-lg font-black text-white">{formatTime(profileStats.totalTimeSeconds)}</p>
                  <p className="text-zinc-600 text-[10px]">Всего времени</p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
