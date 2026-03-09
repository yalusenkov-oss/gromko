import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { Link, useNavigate } from 'react-router-dom';
import {
  Send, Clock, CheckCircle, XCircle, Heart, LogOut,
  Settings, ChevronRight, Shield, Edit3, Camera, Save, X,
  BarChart3, Play, Pause, Music, Users, Disc3
} from 'lucide-react';
import { apiUrl } from '../lib/api';
import { formatDuration } from '../utils/format';

type Tab = 'music' | 'submissions';

export default function ProfilePage() {
  const { currentUser, submissions, fetchMySubmissions, logout, updateProfile, tracks, artists, player, playTrack } = useStore();
  const [tab, setTab] = useState<Tab>('music');
  const navigate = useNavigate();

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
      fetchMySubmissions();
      setEditName(currentUser.name);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) navigate('/login');
  }, [currentUser, navigate]);

  if (!currentUser) return null;

  const likedCount = currentUser.likedTracks.length;
  const likedAlbumsCount = currentUser.likedAlbums?.length || 0;
  const likedArtistsCount = currentUser.likedArtists?.length || 0;
  const userSubmissions = submissions;

  // Recently liked tracks (last 10, most recent first)
  const recentlyLiked = useMemo(() => {
    return tracks
      .filter(t => currentUser.likedTracks.includes(t.id))
      .slice(0, 10);
  }, [tracks, currentUser.likedTracks]);

  // Top artists by liked track count
  const topArtistStats = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; count: number; plays: number }>();
    const likedSet = new Set(currentUser.likedTracks);
    for (const t of tracks) {
      if (!likedSet.has(t.id)) continue;
      const name = t.artists?.[0]?.name || t.artist;
      const slug = t.artists?.[0]?.slug || t.artistSlug;
      if (!map.has(slug)) map.set(slug, { name, slug, count: 0, plays: 0 });
      const entry = map.get(slug)!;
      entry.count += 1;
      entry.plays += t.plays;
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [tracks, currentUser.likedTracks]);

  // Genre breakdown from liked tracks
  const genreBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    const likedSet = new Set(currentUser.likedTracks);
    for (const t of tracks) {
      if (!likedSet.has(t.id) || !t.genre) continue;
      map.set(t.genre, (map.get(t.genre) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [tracks, currentUser.likedTracks]);

  const genreTotal = genreBreakdown.reduce((s, [, c]) => s + c, 0);
  const genreColors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-purple-500', 'bg-cyan-500'];

  // Artist photo lookup
  const artistPhotoMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artists) {
      if (a.photo && !a.photo.includes('default') && !a.photo.includes('placeholder')) {
        map.set(a.slug, a.photo);
      } else {
        const best = [...tracks]
          .filter(t => t.artists?.some(ar => ar.slug === a.slug) || t.artistSlug === a.slug)
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
      const token = localStorage.getItem('gromko_token');
      const res = await fetch(apiUrl('/upload/avatar'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        await updateProfile({ avatar: data.url });
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Profile header */}
        <div className="relative bg-gradient-to-br from-red-500/20 via-zinc-900 to-zinc-950 rounded-2xl p-6 md:p-8 mb-6 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.15),transparent_60%)]" />
          <div className="relative flex items-center gap-5">
            <div className="relative group">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover ring-2 ring-red-500/40"
              />
              {currentUser.role === 'admin' && (
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-zinc-950">
                  <Shield size={14} className="text-white" />
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <Camera size={20} className="text-white" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-lg font-bold text-white focus:outline-none focus:border-red-500/50 w-full max-w-[200px]"
                    autoFocus
                  />
                  <button onClick={handleSaveProfile} disabled={saving} className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors">
                    <Save size={16} />
                  </button>
                  <button onClick={() => { setEditing(false); setEditName(currentUser.name); }} className="p-1.5 bg-white/10 hover:bg-white/15 text-zinc-400 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl md:text-3xl font-black truncate">{currentUser.name}</h1>
                  <button onClick={() => setEditing(true)} className="p-1 text-zinc-500 hover:text-white transition-colors shrink-0">
                    <Edit3 size={16} />
                  </button>
                </div>
              )}
              <p className="text-zinc-400 text-sm truncate">{currentUser.email}</p>
              <p className="text-zinc-600 text-xs mt-1">
                {currentUser.role === 'admin' ? 'Администратор' : 'Пользователь'} · {currentUser.joinedAt}
              </p>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Link to="/liked" className="bg-white/5 hover:bg-white/8 rounded-xl p-4 text-center transition-colors">
            <Heart size={20} className="text-red-400 mx-auto mb-1.5" fill="currentColor" />
            <p className="text-xl font-bold text-white">{likedCount}</p>
            <p className="text-zinc-500 text-[11px]">Треков</p>
          </Link>
          <Link to="/liked?tab=albums" className="bg-white/5 hover:bg-white/8 rounded-xl p-4 text-center transition-colors">
            <Disc3 size={20} className="text-purple-400 mx-auto mb-1.5" />
            <p className="text-xl font-bold text-white">{likedAlbumsCount}</p>
            <p className="text-zinc-500 text-[11px]">Альбомов</p>
          </Link>
          <Link to="/liked?tab=artists" className="bg-white/5 hover:bg-white/8 rounded-xl p-4 text-center transition-colors">
            <Users size={20} className="text-cyan-400 mx-auto mb-1.5" />
            <p className="text-xl font-bold text-white">{likedArtistsCount}</p>
            <p className="text-zinc-500 text-[11px]">Артистов</p>
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-6">
          <button onClick={() => setTab('music')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'music' ? 'bg-red-500 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <Music size={15} /> Моя музыка
          </button>
          <button onClick={() => setTab('submissions')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'submissions' ? 'bg-red-500 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <Send size={15} /> Заявки ({userSubmissions.length})
          </button>
        </div>

        {/* Music tab */}
        {tab === 'music' && (
          <div className="space-y-6">
            {/* Recently liked tracks */}
            {recentlyLiked.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Heart size={16} className="text-red-400" fill="currentColor" />
                    Любимые треки
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
                      <button key={t.id} onClick={() => playTrack(t, recentlyLiked)}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${isCurrent ? 'bg-white/5' : 'hover:bg-white/5'}`}>
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
                        <span className="text-zinc-600 text-xs tabular-nums shrink-0">
                          {t.duration ? formatDuration(t.duration) : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top artists */}
            {topArtistStats.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
                  <Users size={16} className="text-cyan-400" />
                  Топ артисты
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {topArtistStats.map(a => {
                    const photo = artistPhotoMap.get(a.slug);
                    return (
                      <Link key={a.slug} to={`/artist/${a.slug}`} className="group text-center">
                        <div className="aspect-square rounded-full overflow-hidden mb-2 ring-2 ring-transparent group-hover:ring-red-500 transition-all mx-auto w-full max-w-[100px]">
                          {photo ? (
                            <img src={photo} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : (
                            <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                              <Users size={20} className="text-zinc-600" />
                            </div>
                          )}
                        </div>
                        <p className="text-white text-xs font-medium truncate">{a.name}</p>
                        <p className="text-zinc-600 text-[10px]">{a.count} ❤️</p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Genre breakdown */}
            {genreBreakdown.length > 0 && (
              <div className="bg-white/5 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <BarChart3 size={14} />
                  Жанры
                </h3>
                {/* Visual bar */}
                <div className="flex rounded-full overflow-hidden h-2.5 mb-4">
                  {genreBreakdown.map(([g, c], i) => (
                    <div key={g} className={`${genreColors[i]} transition-all`} style={{ width: `${(c / genreTotal) * 100}%` }} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {genreBreakdown.map(([g, c], i) => (
                    <div key={g} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${genreColors[i]} shrink-0`} />
                      <span className="text-white text-sm truncate">{g}</span>
                      <span className="text-zinc-600 text-xs ml-auto">{Math.round((c / genreTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="space-y-1.5">
              <Link to="/submit" className="flex items-center gap-4 px-4 py-3.5 bg-white/5 hover:bg-white/8 rounded-xl transition-colors group">
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
                <Link to="/admin" className="flex items-center gap-4 px-4 py-3.5 bg-white/5 hover:bg-white/8 rounded-xl transition-colors group">
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

        {/* Submissions tab */}
        {tab === 'submissions' && (
          <div className="space-y-3">
            {userSubmissions.length === 0 ? (
              <div className="text-center py-16">
                <Send size={40} className="text-zinc-700 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-zinc-400 mb-2">Нет заявок</h2>
                <p className="text-zinc-600 text-sm mb-6">Предложите свой первый трек на модерацию</p>
                <Link to="/submit" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">
                  Предложить трек
                </Link>
              </div>
            ) : userSubmissions.map(sub => (
              <div key={sub.id} className="p-4 bg-white/5 rounded-xl">
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
                          {sub.albumName && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">💿 {sub.albumName}</span>}
                        </div>
                        <p className="text-zinc-500 text-sm">{sub.artist} · {sub.genre} · {sub.year}</p>
                        <p className="text-zinc-600 text-xs mt-1">{new Date(sub.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
