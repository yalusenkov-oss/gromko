import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStore, Track } from '../store';
import { Link, useNavigate } from 'react-router-dom';
import {
  Send, Clock, CheckCircle, XCircle, Heart, LogOut,
  Settings, ChevronRight, Shield, Edit3, Camera, Save, X,
  BarChart3, Play, Pause, Music, Users, Disc3, Radio,
  Activity, History, ListMusic, TrendingUp, Headphones,
  Sparkles, Share2, UserPlus, Calendar
} from 'lucide-react';
import { apiUrl } from '../lib/api';
import { formatDuration, formatPlays } from '../utils/format';

interface TasteSummary {
  topGenres: { genre: string; score: number }[];
  topArtists: { slug: string; score: number }[];
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

type Tab = 'music' | 'likes' | 'history' | 'stats' | 'activity' | 'submissions';

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

export default function ProfilePage() {
  const {
    currentUser, submissions, fetchMySubmissions, logout,
    updateProfile, tracks, artists, player, playTrack, togglePlay
  } = useStore();

  const [tab, setTab] = useState<Tab>('music');
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
  }, [currentUser, fetchProfileData]);

  useEffect(() => {
    if (!currentUser) navigate('/');
  }, [currentUser, navigate]);

  if (!currentUser) return null;

  const likedCount = currentUser.likedTracks.length;
  const likedAlbumsCount = currentUser.likedAlbums ? currentUser.likedAlbums.length : 0;
  const likedArtistsCount = currentUser.likedArtists ? currentUser.likedArtists.length : 0;

  const recentlyLiked = tracks.filter(t => currentUser.likedTracks.includes(t.id)).slice(0, 20);

  const likedAlbums = useMemo(() => {
    if (!currentUser.likedAlbums || currentUser.likedAlbums.length === 0) return [];
    const albumMap = new Map<string, { name: string; cover: string; artist: string; artistSlug: string; trackCount: number; totalPlays: number }>();
    for (const t of tracks) {
      const albumName = t.meta?.album;
      if (!albumName || !currentUser.likedAlbums.includes(albumName)) continue;
      if (!albumMap.has(albumName)) {
        albumMap.set(albumName, { name: albumName, cover: t.cover, artist: t.artist, artistSlug: t.artistSlug, trackCount: 0, totalPlays: 0 });
      }
      const a = albumMap.get(albumName)!;
      a.trackCount++;
      a.totalPlays += t.plays;
    }
    return Array.from(albumMap.values());
  }, [tracks, currentUser.likedAlbums]);

  const likedArtistsList = useMemo(() => {
    if (!currentUser.likedArtists || currentUser.likedArtists.length === 0) return [];
    return artists.filter(a => currentUser.likedArtists.includes(a.slug));
  }, [artists, currentUser.likedArtists]);

  const genreBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    const likedSet = new Set(currentUser.likedTracks);
    for (const t of tracks) {
      if (!likedSet.has(t.id) || !t.genre) continue;
      map.set(t.genre, (map.get(t.genre) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [tracks, currentUser.likedTracks]);

  const genreTotal = genreBreakdown.reduce((s, e) => s + e[1], 0);
  const genreColors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-purple-500', 'bg-cyan-500'];

  const artistPhotoMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artists) {
      if (a.photo && !a.photo.includes('default') && !a.photo.includes('placeholder')) {
        map.set(a.slug, a.photo);
      } else {
        const best = tracks
          .filter(t => (t.artists && t.artists.some(ar => ar.slug === a.slug)) || t.artistSlug === a.slug)
          .sort((x, y) => y.plays - x.plays)[0];
        if (best) map.set(a.slug, best.cover);
      }
    }
    return map;
  }, [artists, tracks]);

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

  const tabsDef: { key: Tab; label: string; icon: typeof Music; count?: number }[] = [
    { key: 'music', label: 'Музыка', icon: Music },
    { key: 'likes', label: 'Лайки', icon: Heart, count: likedCount },
    { key: 'history', label: 'История', icon: History },
    { key: 'stats', label: 'Статистика', icon: BarChart3 },
    { key: 'activity', label: 'Активность', icon: Activity },
    { key: 'submissions', label: 'Заявки', icon: Send, count: submissions.length },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-14">
      {/* Banner */}
      <div className="relative">
        <div className="h-36 md:h-52 bg-gradient-to-br from-red-600/30 via-zinc-900 to-zinc-950 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(239,68,68,0.25),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(147,51,234,0.15),transparent_60%)]" />
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-zinc-950 to-transparent" />
        </div>

        <div className="max-w-4xl mx-auto px-4 md:px-6 -mt-16 relative z-10">
          <div className="flex items-end gap-4 md:gap-6">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover ring-4 ring-zinc-950 shadow-2xl"
              />
              {currentUser.role === 'admin' && (
                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-zinc-950">
                  <Shield size={15} className="text-white" />
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

            {/* Name */}
            <div className="flex-1 min-w-0 pb-1">
              {editing ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-xl font-bold text-white focus:outline-none focus:border-red-500/50 w-full max-w-[240px]"
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
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-2xl md:text-3xl font-black truncate">{currentUser.name}</h1>
                  <button onClick={() => setEditing(true)} className="p-1 text-zinc-500 hover:text-white transition-colors shrink-0">
                    <Edit3 size={16} />
                  </button>
                </div>
              )}
              <p className="text-zinc-500 text-sm truncate">{currentUser.email}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-zinc-600">
                <span className="flex items-center gap-1">
                  {currentUser.role === 'admin' ? (
                    <><Shield size={11} /> Администратор</>
                  ) : (
                    'Пользователь'
                  )}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  {new Date(currentUser.joinedAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-4 md:gap-6 mt-5 pb-4 overflow-x-auto scrollbar-hide">
            <Link to="/liked" className="flex items-center gap-2 text-sm whitespace-nowrap group">
              <Heart size={15} className="text-red-400" fill="currentColor" />
              <span className="text-white font-semibold">{likedCount}</span>
              <span className="text-zinc-500 group-hover:text-zinc-300 transition-colors">лайков</span>
            </Link>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2 text-sm whitespace-nowrap">
              <Disc3 size={15} className="text-purple-400" />
              <span className="text-white font-semibold">{likedAlbumsCount}</span>
              <span className="text-zinc-500">альбомов</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2 text-sm whitespace-nowrap">
              <Users size={15} className="text-cyan-400" />
              <span className="text-white font-semibold">{likedArtistsCount}</span>
              <span className="text-zinc-500">артистов</span>
            </div>
            {profileStats && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <Headphones size={15} className="text-green-400" />
                  <span className="text-white font-semibold">{formatPlays(profileStats.totalPlays)}</span>
                  <span className="text-zinc-500">прослушиваний</span>
                </div>
              </>
            )}
            {profileStats && profileStats.playlistsCount > 0 && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <ListMusic size={15} className="text-amber-400" />
                  <span className="text-white font-semibold">{profileStats.playlistsCount}</span>
                  <span className="text-zinc-500">плейлистов</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-14 z-20 bg-zinc-950/95 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 md:px-6">
          <div className="flex gap-0.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {tabsDef.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                    tab === t.key
                      ? 'text-red-400 border-red-500'
                      : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  }`}
                >
                  <Icon size={15} />
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      tab === t.key ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-zinc-600'
                    }`}>{t.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">

        {/* Music Tab */}
        {tab === 'music' && (
          <div className="space-y-8">
            {profileStats && profileStats.topListenedArtists.length > 0 && (
              <section>
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                  <TrendingUp size={18} className="text-red-400" />
                  Самые прослушиваемые
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {profileStats.topListenedArtists.slice(0, 5).map((a, i) => {
                    const photo = a.photo || artistPhotoMap.get(a.slug);
                    return (
                      <Link key={a.slug} to={`/artist/${a.slug}`} className="group flex flex-col items-center">
                        <div className="relative">
                          <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden ring-2 ${i === 0 ? 'ring-red-500/50' : 'ring-transparent'} group-hover:ring-red-500 transition-all`}>
                            {photo ? (
                              <img src={photo} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            ) : (
                              <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                                <Users size={20} className="text-zinc-600" />
                              </div>
                            )}
                          </div>
                          {i < 3 && (
                            <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ring-2 ring-zinc-950 ${
                              i === 0 ? 'bg-amber-500 text-black' : i === 1 ? 'bg-zinc-400 text-black' : 'bg-amber-700 text-white'
                            }`}>{i + 1}</div>
                          )}
                        </div>
                        <p className="text-white text-xs font-medium mt-2 truncate max-w-full text-center">{a.name}</p>
                        <p className="text-zinc-600 text-[10px]">{a.plays} прослуш.</p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {genreBreakdown.length > 0 && (
              <section className="bg-white/[0.03] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <BarChart3 size={14} />
                  Любимые жанры
                </h3>
                <div className="flex rounded-full overflow-hidden h-3 mb-4 bg-white/5">
                  {genreBreakdown.map(([g, c], i) => (
                    <div key={g} className={`${genreColors[i]} transition-all`} style={{ width: `${(c / genreTotal) * 100}%` }} />
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {genreBreakdown.map(([g, c], i) => (
                    <div key={g} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${genreColors[i]} shrink-0`} />
                      <span className="text-white text-sm truncate">{g}</span>
                      <span className="text-zinc-600 text-xs ml-auto">{Math.round((c / genreTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tasteSummary && tasteSummary.eventsProcessed > 0 && (
              <section className="bg-white/[0.03] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Radio size={14} />
                  Музыкальный профиль
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-5">
                  <div className="text-center bg-white/[0.03] rounded-xl p-3">
                    <p className="text-2xl font-black text-white">{tasteSummary.avgListenRatio}<span className="text-sm text-zinc-500">%</span></p>
                    <p className="text-zinc-500 text-[10px] mt-0.5">Дослушивание</p>
                    <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${tasteSummary.avgListenRatio}%` }} />
                    </div>
                  </div>
                  <div className="text-center bg-white/[0.03] rounded-xl p-3">
                    <p className="text-2xl font-black text-white">{tasteSummary.skipRate}<span className="text-sm text-zinc-500">%</span></p>
                    <p className="text-zinc-500 text-[10px] mt-0.5">Пропуски</p>
                    <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${tasteSummary.skipRate}%` }} />
                    </div>
                  </div>
                  <div className="text-center bg-white/[0.03] rounded-xl p-3">
                    <p className="text-2xl font-black text-white">{tasteSummary.explorationScore}<span className="text-sm text-zinc-500">%</span></p>
                    <p className="text-zinc-500 text-[10px] mt-0.5">Исследование</p>
                    <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${tasteSummary.explorationScore}%` }} />
                    </div>
                  </div>
                </div>
                {tasteSummary.preferredBpm.min > 0 && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400 mb-3">
                    <Sparkles size={13} className="text-zinc-600" />
                    <span className="text-zinc-600">Любимый BPM:</span>
                    <span className="text-white font-medium">{tasteSummary.preferredBpm.min} — {tasteSummary.preferredBpm.max}</span>
                  </div>
                )}
                {tasteSummary.topGenres.length > 0 && (
                  <div className="mb-3">
                    <p className="text-zinc-600 text-xs mb-2">Топ жанры (по активности)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tasteSummary.topGenres.slice(0, 6).map(g => (
                        <span key={g.genre} className="px-2.5 py-1 bg-white/5 rounded-full text-xs text-zinc-300 border border-white/5">
                          {g.genre}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-zinc-700 text-[10px] mt-3">На основе {tasteSummary.eventsProcessed} событий</p>
              </section>
            )}

            {/* Quick links */}
            <div className="space-y-1.5">
              <Link to="/submit" className="flex items-center gap-4 px-4 py-3.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition-colors group">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shrink-0">
                  <Send size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm">Предложить трек</p>
                  <p className="text-zinc-500 text-xs">Отправить трек на модерацию</p>
                </div>
                <ChevronRight size={18} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              </Link>
              {currentUser.role === 'admin' && (
                <Link to="/admin" className="flex items-center gap-4 px-4 py-3.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition-colors group">
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shrink-0">
                    <Settings size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">Админ-панель</p>
                    <p className="text-zinc-500 text-xs">Управление контентом</p>
                  </div>
                  <ChevronRight size={18} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                </Link>
              )}
            </div>

            {/* Logout */}
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="flex items-center gap-3 w-full px-5 py-3.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-400 transition-colors"
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">Выйти из аккаунта</span>
            </button>
          </div>
        )}

        {/* Likes Tab */}
        {tab === 'likes' && (
          <div className="space-y-8">
            {recentlyLiked.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Heart size={16} className="text-red-400" fill="currentColor" />
                    Любимые треки
                    <span className="text-zinc-600 text-sm font-normal ml-1">{likedCount}</span>
                  </h3>
                  <Link to="/liked" className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs transition-colors">
                    Все <ChevronRight size={14} />
                  </Link>
                </div>
                <div className="space-y-0.5">
                  {recentlyLiked.map(t => {
                    const isCurrent = player.currentTrack?.id === t.id;
                    const isPlaying = isCurrent && player.isPlaying;
                    return (
                      <button key={t.id} onClick={() => isCurrent ? togglePlay() : playTrack(t, recentlyLiked)}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${isCurrent ? 'bg-white/5' : 'hover:bg-white/[0.03]'}`}>
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 relative">
                          <img src={t.cover} alt="" className="w-full h-full object-cover" />
                          {isCurrent && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              {isPlaying ? <Pause size={14} fill="white" className="text-white" /> : <Play size={14} fill="white" className="text-white" />}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isCurrent ? 'text-red-400' : 'text-white'}`}>{t.title}</p>
                          <p className="text-zinc-500 text-xs truncate">{t.artist}</p>
                        </div>
                        <span className="text-zinc-600 text-xs tabular-nums shrink-0">{t.duration ? formatDuration(t.duration) : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <div className="text-center py-16">
                <Heart size={40} className="text-zinc-700 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-zinc-400 mb-2">Нет лайков</h2>
                <p className="text-zinc-600 text-sm">Лайкайте треки, чтобы они появились здесь</p>
              </div>
            )}

            {likedAlbums.length > 0 && (
              <section>
                <h3 className="text-lg font-bold flex items-center gap-2 mb-3">
                  <Disc3 size={16} className="text-purple-400" />
                  Сохранённые альбомы
                  <span className="text-zinc-600 text-sm font-normal ml-1">{likedAlbumsCount}</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {likedAlbums.map(a => (
                    <Link key={a.name} to={`/artist/${a.artistSlug}`} className="group rounded-xl overflow-hidden bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                      <div className="aspect-square"><img src={a.cover} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" /></div>
                      <div className="p-2.5">
                        <p className="text-white text-sm font-semibold truncate">{a.name}</p>
                        <p className="text-zinc-500 text-xs truncate">{a.artist} · {a.trackCount} треков</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {likedArtistsList.length > 0 && (
              <section>
                <h3 className="text-lg font-bold flex items-center gap-2 mb-3">
                  <Users size={16} className="text-cyan-400" />
                  Любимые артисты
                  <span className="text-zinc-600 text-sm font-normal ml-1">{likedArtistsCount}</span>
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {likedArtistsList.map(a => {
                    const photo = artistPhotoMap.get(a.slug) || a.photo;
                    return (
                      <Link key={a.slug} to={`/artist/${a.slug}`} className="group text-center">
                        <div className="aspect-square rounded-full overflow-hidden mb-2 ring-2 ring-transparent group-hover:ring-red-500 transition-all mx-auto w-full max-w-[90px]">
                          {photo ? (
                            <img src={photo} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : (
                            <div className="w-full h-full bg-zinc-800 flex items-center justify-center"><Users size={20} className="text-zinc-600" /></div>
                          )}
                        </div>
                        <p className="text-white text-xs font-medium truncate">{a.name}</p>
                        <p className="text-zinc-600 text-[10px]">{a.genre || ''}</p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* History Tab */}
        {tab === 'history' && (
          <div>
            {historyTracks.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <History size={18} className="text-zinc-400" />
                    История прослушивания
                  </h3>
                  <span className="text-zinc-600 text-sm">{historyTracks.length} треков</span>
                </div>
                <div className="space-y-0.5">
                  {historyTracks.map((t, idx) => {
                    const isCurrent = player.currentTrack?.id === t.id;
                    const isPlaying = isCurrent && player.isPlaying;
                    return (
                      <button key={`${t.id}-${idx}`} onClick={() => isCurrent ? togglePlay() : playTrack(t, historyTracks)}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${isCurrent ? 'bg-white/5' : 'hover:bg-white/[0.03]'}`}>
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 relative">
                          <img src={t.cover} alt="" className="w-full h-full object-cover" />
                          {isCurrent && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              {isPlaying ? <Pause size={14} fill="white" className="text-white" /> : <Play size={14} fill="white" className="text-white" />}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isCurrent ? 'text-red-400' : 'text-white'}`}>{t.title}</p>
                          <p className="text-zinc-500 text-xs truncate">{t.artist}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-zinc-600 text-xs tabular-nums block">{t.duration ? formatDuration(t.duration) : ''}</span>
                          <span className="text-zinc-700 text-[10px]">{timeAgo(t.playedAt)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <History size={40} className="text-zinc-700 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-zinc-400 mb-2">Пока пусто</h2>
                <p className="text-zinc-600 text-sm">Здесь будет история ваших прослушиваний</p>
              </div>
            )}
          </div>
        )}

        {/* Stats Tab */}
        {tab === 'stats' && (
          <div className="space-y-6">
            {profileStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/[0.03] rounded-2xl p-4 text-center">
                  <Headphones size={22} className="text-green-400 mx-auto mb-2" />
                  <p className="text-2xl font-black text-white">{formatPlays(profileStats.monthPlays)}</p>
                  <p className="text-zinc-500 text-xs">За месяц</p>
                </div>
                <div className="bg-white/[0.03] rounded-2xl p-4 text-center">
                  <Music size={22} className="text-blue-400 mx-auto mb-2" />
                  <p className="text-2xl font-black text-white">{formatPlays(profileStats.totalPlays)}</p>
                  <p className="text-zinc-500 text-xs">Всего прослушиваний</p>
                </div>
                <div className="bg-white/[0.03] rounded-2xl p-4 text-center">
                  <Clock size={22} className="text-amber-400 mx-auto mb-2" />
                  <p className="text-2xl font-black text-white">{formatTime(profileStats.monthTimeSeconds)}</p>
                  <p className="text-zinc-500 text-xs">Время за месяц</p>
                </div>
                <div className="bg-white/[0.03] rounded-2xl p-4 text-center">
                  <TrendingUp size={22} className="text-red-400 mx-auto mb-2" />
                  <p className="text-2xl font-black text-white">{formatTime(profileStats.totalTimeSeconds)}</p>
                  <p className="text-zinc-500 text-xs">Всего времени</p>
                </div>
              </div>
            )}

            {profileStats && profileStats.topListenedArtists.length > 0 && (
              <section className="bg-white/[0.03] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Users size={14} />
                  Топ артисты по прослушиваниям
                </h3>
                <div className="space-y-2">
                  {profileStats.topListenedArtists.map((a, i) => {
                    const photo = a.photo || artistPhotoMap.get(a.slug);
                    return (
                      <Link key={a.slug} to={`/artist/${a.slug}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-colors group">
                        <span className={`w-6 text-center text-sm font-bold ${i < 3 ? 'text-amber-400' : 'text-zinc-600'}`}>{i + 1}</span>
                        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                          {photo ? (
                            <img src={photo} alt={a.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-zinc-800 flex items-center justify-center"><Users size={16} className="text-zinc-600" /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate group-hover:text-red-400 transition-colors">{a.name}</p>
                        </div>
                        <span className="text-zinc-500 text-xs tabular-nums">{a.plays} прослуш.</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {genreBreakdown.length > 0 && (
              <section className="bg-white/[0.03] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <BarChart3 size={14} />
                  Жанры
                </h3>
                <div className="space-y-3">
                  {genreBreakdown.map(([g, c], i) => {
                    const pct = Math.round((c / genreTotal) * 100);
                    return (
                      <div key={g} className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${genreColors[i]} shrink-0`} />
                        <span className="text-white text-sm w-28 truncate">{g}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full ${genreColors[i]} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-zinc-500 text-xs tabular-nums w-10 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {tasteSummary && tasteSummary.eventsProcessed > 0 && (
              <section className="bg-white/[0.03] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Radio size={14} />
                  Алгоритмический профиль
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-black text-green-400">{tasteSummary.avgListenRatio}%</p>
                    <p className="text-zinc-500 text-[10px]">Дослушивание</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-red-400">{tasteSummary.skipRate}%</p>
                    <p className="text-zinc-500 text-[10px]">Пропуски</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-purple-400">{tasteSummary.explorationScore}%</p>
                    <p className="text-zinc-500 text-[10px]">Исследование</p>
                  </div>
                </div>
                {tasteSummary.preferredBpm.min > 0 && (
                  <p className="text-zinc-600 text-xs text-center mt-3">
                    BPM: {tasteSummary.preferredBpm.min} — {tasteSummary.preferredBpm.max} · {tasteSummary.eventsProcessed} событий
                  </p>
                )}
              </section>
            )}

            {profileStats && profileStats.lastActive && (
              <p className="text-zinc-700 text-xs text-center">
                Последняя активность: {timeAgo(profileStats.lastActive)}
              </p>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {tab === 'activity' && (
          <div>
            {activityFeed.length > 0 ? (
              <>
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                  <Activity size={18} className="text-zinc-400" />
                  Активность
                </h3>
                <div className="space-y-1">
                  {activityFeed.map((item, i) => {
                    const info = activityLabel(item.type);
                    return (
                      <div key={`${item.type}-${item.createdAt}-${i}`} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-white/5 shrink-0 ${info.color}`}>
                          {info.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-300">
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
                          <img src={item.trackCover} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        )}
                        {item.type === 'follow_artist' && item.artistPhoto && !item.trackCover && (
                          <img src={item.artistPhoto} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        )}
                        <span className="text-zinc-700 text-[10px] shrink-0 whitespace-nowrap">{timeAgo(item.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <Activity size={40} className="text-zinc-700 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-zinc-400 mb-2">Нет активности</h2>
                <p className="text-zinc-600 text-sm">Слушайте музыку, и здесь появится ваша активность</p>
              </div>
            )}
          </div>
        )}

        {/* Submissions Tab */}
        {tab === 'submissions' && (
          <div className="space-y-3">
            {submissions.length === 0 ? (
              <div className="text-center py-16">
                <Send size={40} className="text-zinc-700 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-zinc-400 mb-2">Нет заявок</h2>
                <p className="text-zinc-600 text-sm mb-6">Предложите свой первый трек на модерацию</p>
                <Link to="/submit" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors inline-block">
                  Предложить трек
                </Link>
              </div>
            ) : (
              submissions.map(sub => (
                <div key={sub.id} className="p-4 bg-white/[0.03] rounded-xl">
                  <div className="flex items-start gap-3">
                    {sub.coverUrl ? (
                      <img src={apiUrl(sub.coverUrl)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <Send size={18} className="text-zinc-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-medium truncate">{sub.title}</p>
                            {sub.albumName && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">
                                {sub.albumName}
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-500 text-sm">{sub.artist} · {sub.genre} · {sub.year}</p>
                          <p className="text-zinc-600 text-xs mt-1">
                            {new Date(sub.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {statusIcon(sub.status)}
                          <span className={`text-sm font-medium ${
                            sub.status === 'pending' ? 'text-yellow-400' :
                            sub.status === 'approved' ? 'text-green-400' :
                            sub.status === 'rejected' ? 'text-red-400' : 'text-zinc-400'
                          }`}>{statusLabel(sub.status)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {sub.status === 'rejected' && sub.rejectReason && (
                    <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="text-red-400 text-sm">Причина: {sub.rejectReason}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
