import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useStore, type Track, type Playlist } from '../store';
import { apiUrl } from '../lib/api';
import { formatDuration } from '../utils/format';
import {
  Plus, Play, Heart, Music, Clock, ListMusic, Share2, Edit3, LogOut, Moon,
  ChevronRight, Star, Sparkles, RefreshCw, Shuffle, Radio,
} from 'lucide-react';
import { ToastContainer, type ToastItem } from '../components/lk/Toast';
import {
  CreatePlaylistModal, ListenTogetherModal, ShareModal,
  PlaylistDetailModal, EditProfileModal, PickTrackModal,
  type ModalType,
} from '../components/lk/Modals';

interface TasteSummary {
  topGenres: { genre: string; count: number }[];
  topArtists: { slug: string; name?: string; count: number }[];
  timePreferences?: Record<string, number>;
}
interface ProfileStats {
  totalPlays: number; monthPlays: number; totalTimeSeconds: number; monthTimeSeconds: number;
  topListenedArtists: { name: string; slug: string; photo: string; plays: number }[];
  playlistsCount: number; lastActive: string | null;
}
interface ActivityItem {
  type: string; trackId?: string; trackTitle?: string; trackArtist?: string;
  trackCover?: string; artistSlug?: string; artistName?: string; createdAt: string;
}
interface HistoryTrack extends Track { playedAt?: string; }
interface RecPicks { trackOfWeek: Track | null; discovery: Track | null; }
type TabKey = 'playlists' | 'tracks' | 'activity';

function getToken(): string | null { return localStorage.getItem('gromko_token'); }

async function apiFetchJson(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { ...opts, headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function coverUrl(src: string) {
  if (!src) return '';
  return src.startsWith('http') ? src : apiUrl(src);
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, playlists, fetchMyPlaylists, tracks, logout, playTrack, roomActive, roomListeners, toggleRoom } = useStore();
  const [tab, setTab] = useState<TabKey>('playlists');

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const tidRef = useRef(0);
  const addToast = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    const id = ++tidRef.current;
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [pickTarget, setPickTarget] = useState<'trackOfWeek' | 'discovery' | null>(null);

  const [tasteSummary, setTasteSummary] = useState<TasteSummary | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [historyTracks, setHistoryTracks] = useState<HistoryTrack[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [recPicks, setRecPicks] = useState<RecPicks>({ trackOfWeek: null, discovery: null });

  useEffect(() => { if (!currentUser) navigate('/', { replace: true }); }, [currentUser, navigate]);

  useEffect(() => {
    if (!currentUser) return;
    fetchMyPlaylists();
    apiFetchJson('/profile/taste-summary').then(setTasteSummary).catch(() => {});
    apiFetchJson('/profile/stats').then(setProfileStats).catch(() => {});
    apiFetchJson('/profile/activity').then(d => setActivityFeed(d.feed || d || [])).catch(() => {});
    apiFetchJson('/profile/history').then(d => setHistoryTracks(d.tracks || d || [])).catch(() => {});
    apiFetchJson('/profile/followers-stats').then(d => setFollowersCount(d.followersCount || 0)).catch(() => {});
    apiFetchJson('/profile/recommendation-picks').then(d => {
      if (d?.trackOfWeekId) { const t = tracks.find(tr => tr.id === d.trackOfWeekId); if (t) setRecPicks(p => ({ ...p, trackOfWeek: t })); }
      if (d?.discoveryId) { const t = tracks.find(tr => tr.id === d.discoveryId); if (t) setRecPicks(p => ({ ...p, discovery: t })); }
    }).catch(() => {});
  }, [currentUser, location.key]);

  const nightPercent = useMemo(() => {
    if (!tasteSummary?.timePreferences) return 0;
    const tp = tasteSummary.timePreferences;
    const total = Object.values(tp).reduce((s, v) => s + v, 0) || 1;
    if ('night' in tp) return Math.round(((tp['night'] || 0) / total) * 100);
    const nightHrs = ['0','1','2','3','4','5','22','23'];
    return Math.round((nightHrs.reduce((s, h) => s + (tp[h] || 0), 0) / total) * 100);
  }, [tasteSummary]);

  const likedTracks = useMemo(() => {
    if (!currentUser) return [];
    return currentUser.likedTracks.map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[];
  }, [currentUser, tracks]);

  const topArtists = profileStats?.topListenedArtists || [];

  const handleToggleRoom = useCallback(() => {
    if (roomActive) { toggleRoom(); addToast('Комната закрыта'); } else setActiveModal('listen-together');
  }, [roomActive, toggleRoom, addToast]);

  const handleLogout = useCallback(() => {
    if (roomActive) toggleRoom();
    logout(); navigate('/', { replace: true });
  }, [logout, navigate, roomActive, toggleRoom]);

  const handlePickTrack = useCallback((track: Track) => {
    if (pickTarget === 'trackOfWeek') {
      setRecPicks(p => ({ ...p, trackOfWeek: track }));
      apiFetchJson('/profile/recommendation-picks', { method: 'PUT', body: JSON.stringify({ trackOfWeekId: track.id, discoveryId: recPicks.discovery?.id || null }) }).catch(() => {});
      addToast(`Трек недели: ${track.title}`);
    } else if (pickTarget === 'discovery') {
      setRecPicks(p => ({ ...p, discovery: track }));
      apiFetchJson('/profile/recommendation-picks', { method: 'PUT', body: JSON.stringify({ trackOfWeekId: recPicks.trackOfWeek?.id || null, discoveryId: track.id }) }).catch(() => {});
      addToast(`Находка: ${track.title}`);
    }
    setPickTarget(null);
  }, [pickTarget, recPicks, addToast]);

  if (!currentUser) return null;

  const avatar = currentUser.avatar
    ? (currentUser.avatar.startsWith('http') ? currentUser.avatar : apiUrl(`/uploads/${currentUser.avatar.replace(/^\/uploads\//, '')}`))
    : '';
  const maxGenre = tasteSummary?.topGenres?.[0]?.count || 1;
  const tabItems: { key: TabKey; label: string }[] = [
    { key: 'playlists', label: 'Плейлисты' },
    { key: 'tracks', label: 'Треки' },
    { key: 'activity', label: 'Активность' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6">

        {/* Profile Header */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 sm:p-5 mb-4">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {avatar ? (
                <img src={avatar} alt={currentUser.name} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-white/10" />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-white/10 bg-red-500 flex items-center justify-center">
                  <span className="text-white text-xl sm:text-2xl font-black">{currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                </div>
              )}
              <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-zinc-900" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">{currentUser.name}</h1>
              <p className="text-sm text-zinc-500 truncate">@{currentUser.username || currentUser.name.toLowerCase().replace(/\s+/g, '')}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setActiveModal('edit-profile')} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg text-zinc-300 transition-colors flex items-center gap-1"><Edit3 size={12} /> Редактировать</button>
                <button onClick={() => setActiveModal('share')} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1.5 rounded-lg text-zinc-400 transition-colors"><Share2 size={12} /></button>
                <button onClick={handleLogout} className="text-xs bg-white/5 hover:bg-red-500/10 hover:border-red-500/20 border border-white/10 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-red-400 transition-colors ml-auto"><LogOut size={12} /></button>
              </div>
            </div>
          </div>
          <div className="flex justify-around mt-4 pt-3 border-t border-white/5">
            <div className="text-center"><p className="text-sm font-semibold">{followersCount}</p><p className="text-[10px] text-zinc-500 uppercase tracking-wider">Подписчики</p></div>
            <div className="text-center"><p className="text-sm font-semibold">{profileStats?.totalPlays?.toLocaleString() || '0'}</p><p className="text-[10px] text-zinc-500 uppercase tracking-wider">Прослушивания</p></div>
            <div className="text-center"><p className="text-sm font-semibold">{playlists.length}</p><p className="text-[10px] text-zinc-500 uppercase tracking-wider">Плейлисты</p></div>
          </div>
          {tasteSummary?.topGenres && tasteSummary.topGenres.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
              {tasteSummary.topGenres.slice(0, 4).map(g => {
                const pct = Math.round((g.count / maxGenre) * 100);
                return (
                  <div key={g.genre} className="flex items-center gap-3">
                    <span className="text-[11px] text-zinc-400 w-20 truncate text-right">{g.genre}</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-zinc-500 w-8">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
          {nightPercent > 40 && (
            <div className="mt-3 flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
              <Moon size={14} className="text-red-400" />
              <span className="text-xs text-zinc-300">Ночной слушатель</span>
              <span className="text-[10px] text-zinc-500 ml-auto">{nightPercent}% после полуночи</span>
            </div>
          )}
        </div>

        {/* Rec Picks */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {recPicks.trackOfWeek ? (
            <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 group">
              <div className="flex items-center gap-1.5 mb-2">
                <Star size={11} className="text-amber-400" fill="currentColor" />
                <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Трек недели</span>
                <button onClick={() => { setPickTarget('trackOfWeek'); setActiveModal('pick-track'); }} className="ml-auto w-5 h-5 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"><RefreshCw size={10} /></button>
              </div>
              <div className="flex gap-2.5 cursor-pointer" onClick={() => playTrack(recPicks.trackOfWeek!)}>
                <img src={coverUrl(recPicks.trackOfWeek.cover)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                <div className="min-w-0"><p className="text-xs text-white font-medium truncate">{recPicks.trackOfWeek.title}</p><p className="text-[10px] text-zinc-500 truncate">{recPicks.trackOfWeek.artist}</p></div>
              </div>
            </div>
          ) : (
            <button onClick={() => { setPickTarget('trackOfWeek'); setActiveModal('pick-track'); }} className="bg-zinc-900/60 border border-dashed border-white/10 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 hover:border-red-500/30 transition-colors"><Star size={18} className="text-amber-400" /><span className="text-[10px] text-zinc-500">Трек недели</span></button>
          )}
          {recPicks.discovery ? (
            <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 group">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={11} className="text-red-400" />
                <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Находка</span>
                <button onClick={() => { setPickTarget('discovery'); setActiveModal('pick-track'); }} className="ml-auto w-5 h-5 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"><RefreshCw size={10} /></button>
              </div>
              <div className="flex gap-2.5 cursor-pointer" onClick={() => playTrack(recPicks.discovery!)}>
                <img src={coverUrl(recPicks.discovery.cover)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                <div className="min-w-0"><p className="text-xs text-white font-medium truncate">{recPicks.discovery.title}</p><p className="text-[10px] text-zinc-500 truncate">{recPicks.discovery.artist}</p></div>
              </div>
            </div>
          ) : (
            <button onClick={() => { setPickTarget('discovery'); setActiveModal('pick-track'); }} className="bg-zinc-900/60 border border-dashed border-white/10 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 hover:border-red-500/30 transition-colors"><Sparkles size={18} className="text-red-400" /><span className="text-[10px] text-zinc-500">Моя находка</span></button>
          )}
        </div>

        {/* Live Room */}
        {roomActive && (
          <div className="bg-zinc-900/60 border border-red-500/20 rounded-xl p-3 mb-4 flex items-center gap-3">
            <div className="relative shrink-0"><Radio size={16} className="text-red-400" /><div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping" /></div>
            <div className="min-w-0 flex-1"><p className="text-xs text-red-400 font-medium">Live-комната активна</p><p className="text-[10px] text-zinc-500">{roomListeners.length} слушателей</p></div>
            <button onClick={handleToggleRoom} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg text-zinc-300 transition-colors">Закрыть</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-white/5 mb-4">
          {tabItems.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {t.label}
              {tab === t.key && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-red-500 rounded-full" />}
            </button>
          ))}
        </div>

        {/* Playlists Tab */}
        {tab === 'playlists' && (
          <div className="space-y-3">
            <button onClick={() => setActiveModal('create-playlist')} className="w-full bg-zinc-900/60 border border-dashed border-white/10 rounded-xl py-4 flex items-center justify-center gap-2 text-zinc-400 hover:text-white hover:border-red-500/30 transition-colors active:scale-[0.98]">
              <Plus size={18} /><span className="text-sm font-medium">Создать плейлист</span>
            </button>
            {playlists.length === 0 ? (
              <div className="py-8 text-center"><ListMusic size={32} className="text-zinc-700 mx-auto mb-3" /><p className="text-sm text-zinc-500">У вас пока нет плейлистов</p></div>
            ) : playlists.map(pl => (
              <div key={pl.id} onClick={() => { setSelectedPlaylist(pl); setActiveModal('playlist-detail'); }}
                className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-zinc-800/60 active:scale-[0.99] transition-all">
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-zinc-800 flex items-center justify-center">
                  {pl.coverUrl ? <img src={coverUrl(pl.coverUrl)} alt="" className="w-full h-full object-cover" /> : <Music size={18} className="text-zinc-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{pl.title}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-zinc-500">{pl.tracksCount} треков</span>
                    <span className="text-[11px] text-zinc-500 flex items-center gap-0.5"><Heart size={9} className="text-red-400" fill="currentColor" /> {pl.likesCount}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-600 shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Tracks Tab */}
        {tab === 'tracks' && (
          <div className="space-y-6">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <Heart size={13} className="text-red-400" fill="currentColor" /> Любимое ({likedTracks.length})
                </h3>
                {likedTracks.length > 0 && (
                  <button onClick={() => { const s = [...likedTracks].sort(() => Math.random() - 0.5); playTrack(s[0], s); }}
                    className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"><Shuffle size={12} /> Перемешать</button>
                )}
              </div>
              {likedTracks.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4 text-center">Лайкните треки, чтобы они появились здесь</p>
              ) : (
                <div className="space-y-0.5">
                  {likedTracks.slice(0, 15).map((t, i) => (
                    <div key={t.id} onClick={() => playTrack(t, likedTracks)}
                      className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors active:bg-white/5">
                      <span className="text-[11px] text-zinc-600 w-5 text-right tabular-nums">{i + 1}</span>
                      <img src={coverUrl(t.cover)} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-0"><p className="text-sm text-white font-medium truncate">{t.title}</p><p className="text-[11px] text-zinc-500 truncate">{t.artist}</p></div>
                      <span className="text-[11px] text-zinc-600 tabular-nums shrink-0">{formatDuration(t.duration)}</span>
                    </div>
                  ))}
                  {likedTracks.length > 15 && <Link to="/liked" className="block text-center text-xs text-red-400 hover:text-red-300 py-2 transition-colors">Показать все ({likedTracks.length}) →</Link>}
                </div>
              )}
            </section>
            {topArtists.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 mb-3">Любимые артисты</h3>
                <div className="space-y-1">
                  {topArtists.slice(0, 5).map((a, i) => (
                    <Link key={a.slug} to={`/artist/${a.slug}`} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <span className="text-[11px] text-zinc-600 w-5 text-right">{i + 1}</span>
                      <img src={a.photo ? (a.photo.startsWith('http') ? a.photo : apiUrl(a.photo)) : `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=2a2a2a&color=fff&size=64`} alt={a.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      <div className="flex-1 min-w-0"><p className="text-sm text-white font-medium truncate">{a.name}</p><p className="text-[11px] text-zinc-500">{a.plays.toLocaleString()} прослушиваний</p></div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {historyTracks.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-2"><Clock size={13} className="text-zinc-500" /> Недавно слушал</h3>
                <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 -mx-1 px-1">
                  {historyTracks.slice(0, 10).map((t, i) => (
                    <div key={i} className="shrink-0 w-24 group cursor-pointer active:scale-[0.96] transition-transform" onClick={() => playTrack(t)}>
                      <div className="relative rounded-xl overflow-hidden mb-1.5">
                        <img src={coverUrl(t.cover)} alt="" className="w-24 h-24 object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                          <Play size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="white" />
                        </div>
                      </div>
                      <p className="text-[11px] text-white font-medium truncate">{t.title}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{t.artist}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {tab === 'activity' && (
          <div>
            {activityFeed.length === 0 ? (
              <div className="py-12 text-center"><Clock size={32} className="text-zinc-700 mx-auto mb-3" /><p className="text-sm text-zinc-500">Пока нет активности</p></div>
            ) : (
              <div className="space-y-0">
                {activityFeed.slice(0, 30).map((item, i) => {
                  const iconMap: Record<string, typeof Music> = { play: Music, like: Heart, finish: Music, follow_artist: Heart, add_to_playlist: ListMusic, share: Share2, playlist_create: ListMusic, playlist_add: ListMusic };
                  const colorMap: Record<string, string> = { play: 'text-red-400', like: 'text-pink-400', finish: 'text-green-400', follow_artist: 'text-purple-400', add_to_playlist: 'text-blue-400', share: 'text-amber-400', playlist_create: 'text-blue-400', playlist_add: 'text-blue-400' };
                  const Icon = iconMap[item.type] || Music;
                  const color = colorMap[item.type] || 'text-zinc-500';
                  function desc(it: ActivityItem) {
                    switch (it.type) {
                      case 'play': return `Слушал «${it.trackTitle || ''}» — ${it.trackArtist || ''}`;
                      case 'like': return `Лайкнул «${it.trackTitle || ''}» — ${it.trackArtist || ''}`;
                      case 'finish': return `Дослушал «${it.trackTitle || ''}» — ${it.trackArtist || ''}`;
                      case 'follow_artist': return `Подписался на ${it.artistName || 'артиста'}`;
                      case 'add_to_playlist': return `Добавил «${it.trackTitle || ''}» в плейлист`;
                      case 'playlist_create': return 'Создал новый плейлист';
                      default: return it.type;
                    }
                  }
                  const diff = Date.now() - new Date(item.createdAt).getTime();
                  const mins = Math.floor(diff / 60000);
                  let timeAgo = 'Сейчас';
                  if (mins >= 1 && mins < 60) timeAgo = `${mins} мин`;
                  else if (mins >= 60 && mins < 1440) timeAgo = `${Math.floor(mins / 60)} ч`;
                  else if (mins >= 1440) timeAgo = `${Math.floor(mins / 1440)} дн`;
                  return (
                    <div key={i} className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
                      <div className={`w-7 h-7 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5 ${color}`}><Icon size={12} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white leading-snug">{desc(item)}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1"><Clock size={9} /> {timeAgo}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {activeModal === 'create-playlist' && <CreatePlaylistModal onClose={() => { setActiveModal(null); fetchMyPlaylists(); }} addToast={addToast} />}
      {activeModal === 'listen-together' && <ListenTogetherModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'share' && <ShareModal onClose={() => setActiveModal(null)} addToast={addToast} />}
      {activeModal === 'playlist-detail' && selectedPlaylist && <PlaylistDetailModal playlist={selectedPlaylist} onClose={() => { setActiveModal(null); setSelectedPlaylist(null); }} addToast={addToast} />}
      {activeModal === 'edit-profile' && <EditProfileModal onClose={() => setActiveModal(null)} addToast={addToast} />}
      {activeModal === 'pick-track' && pickTarget && <PickTrackModal title={pickTarget === 'trackOfWeek' ? 'Выберите трек недели' : 'Выберите находку'} onClose={() => { setActiveModal(null); setPickTarget(null); }} onPick={handlePickTrack} />}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
