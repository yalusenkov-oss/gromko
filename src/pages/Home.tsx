import { useStore, Track } from '../store';
import { Play, Pause, TrendingUp, Users, ChevronRight, Flame, Sparkles, Shuffle, Heart, Zap, Radio, Headphones, Lock } from 'lucide-react';
import { formatPlays } from '../utils/format';
import TrackCard from '../components/TrackCard';
import { Link } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

function useRecommendations(endpoint: string, enabled: boolean): { data: Track[]; loading: boolean } {
  const [data, setData] = useState<Track[]>([]);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    const token = localStorage.getItem('gromko_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(apiUrl(endpoint), { headers })
      .then(r => r.ok ? r.json() : [])
      .then(d => { Array.isArray(d) ? setData(d) : setData([]); setLoading(false); })
      .catch(() => setLoading(false));
  }, [endpoint, enabled]);
  return { data, loading };
}

interface PopularUser {
  id: string;
  name: string;
  avatar: string;
  followersCount: number;
}

interface PublicRoom {
  hostId: string;
  hostName: string;
  hostAvatar: string;
  trackTitle: string;
  trackArtist: string;
  trackCover: string;
  listenersCount: number;
  isPlaying: boolean;
}

export default function Home() {
  const { tracks, artists, heroTrackId, player, playTrack, togglePlay, toggleShuffle, currentUser, openAuthModal } = useStore();

  // Personal recommendations (only when logged in)
  const isLoggedIn = !!currentUser;
  const { data: forYouTracks, loading: forYouLoading } = useRecommendations('/recommendations/for-you?limit=5', isLoggedIn);
  const { data: newForYouTracks } = useRecommendations('/recommendations/new-for-you?limit=6', true);
  const { data: rediscoverTracks } = useRecommendations('/recommendations/rediscover?limit=6', isLoggedIn);

  // Popular users & public rooms
  const [popularUsers, setPopularUsers] = useState<PopularUser[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);

  useEffect(() => {
    fetch(apiUrl('/popular-users')).then(r => r.ok ? r.json() : []).then(d => setPopularUsers(d || [])).catch(() => {});
    fetch(apiUrl('/public-rooms')).then(r => r.ok ? r.json() : []).then(d => setPublicRooms(d || [])).catch(() => {});
  }, []);

  const heroTrack = tracks.find(t => t.id === heroTrackId) || tracks[0];
  const isHeroPlaying = player.currentTrack?.id === heroTrack?.id && player.isPlaying;

  const popularTracks = [...tracks].sort((a, b) => b.plays - a.plays).slice(0, 10);

  // Top 4 artists by plays, with fallback photo from most popular track cover
  const topArtists = useMemo(() => {
    const sorted = [...artists].sort((a, b) => b.totalPlays - a.totalPlays).slice(0, 4);
    return sorted.map(a => {
      const needsFallback = !a.photo || a.photo.includes('default') || a.photo.includes('placeholder');
      if (needsFallback) {
        const artistTrack = [...tracks]
          .filter(t => t.artists?.some(ar => ar.slug === a.slug) || t.artistSlug === a.slug)
          .sort((x, y) => y.plays - x.plays)[0];
        return { ...a, photo: artistTrack?.cover || a.photo };
      }
      return a;
    });
  }, [artists, tracks]);

  const handleHeroPlay = () => {
    if (!heroTrack) return;
    if (player.currentTrack?.id === heroTrack.id) togglePlay();
    else playTrack(heroTrack, tracks);
  };

  const handleShuffleAll = () => {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
    if (!player.shuffle) toggleShuffle();
  };

  function userAvatar(u: PopularUser) {
    if (u.avatar) {
      return u.avatar.startsWith('http') ? u.avatar : apiUrl(`/uploads/${u.avatar.replace(/^\/uploads\//, '')}`);
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=2a2a2a&color=fff&size=128`;
  }

  function roomHostAvatar(r: PublicRoom) {
    if (r.hostAvatar) {
      return r.hostAvatar.startsWith('http') ? r.hostAvatar : apiUrl(`/uploads/${r.hostAvatar.replace(/^\/uploads\//, '')}`);
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(r.hostName)}&background=2a2a2a&color=fff&size=64`;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-14">
      {/* Hero */}
      {heroTrack && (
        <div className="relative h-[320px] md:h-[560px] flex items-end overflow-hidden">
          <div className="absolute inset-0 md:hidden" style={{ backgroundImage: `url(${heroTrack.cover})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(2px)', transform: 'scale(1.02)' }} />
          <div className="absolute inset-0 hidden md:block" style={{ backgroundImage: `url(${heroTrack.cover})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(16px) saturate(1.2)', transform: 'scale(1.08)' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-zinc-950/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/80 to-transparent" />

          <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pb-6 md:pb-12 w-full">
            <div className="max-w-2xl">
              <div className="flex items-center gap-1.5 mb-2">
                <Flame size={12} className="text-red-400" />
                <span className="text-red-400 text-xs font-medium uppercase tracking-widest">Трек дня</span>
              </div>
              <h1 className="text-2xl md:text-6xl font-black tracking-tight mb-1">{heroTrack.title}</h1>
              <div className="text-zinc-300 text-base md:text-xl hover:text-white transition-colors mb-0.5 block">
                {heroTrack.artists && heroTrack.artists.length > 0
                  ? heroTrack.artists.map((a, i) => (
                      <span key={a.slug}>
                        {i > 0 && <span className="text-zinc-500">, </span>}
                        <Link to={`/artist/${a.slug}`} className="hover:text-white transition-colors">{a.name}</Link>
                      </span>
                    ))
                  : <Link to={`/artist/${heroTrack.artistSlug}`} className="hover:text-white transition-colors">{heroTrack.artist}</Link>
                }
              </div>
              <p className="text-zinc-500 text-xs md:text-sm mb-4 md:mb-6">{heroTrack.genre} · {heroTrack.year} · {formatPlays(heroTrack.plays)} прослушиваний</p>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleHeroPlay}
                  className="flex items-center gap-2 px-5 py-2.5 md:px-6 md:py-3 bg-red-500 hover:bg-red-400 rounded-full font-semibold text-sm transition-all shadow-lg shadow-red-500/30 active:scale-95"
                >
                  {isHeroPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" />}
                  {isHeroPlaying ? 'Пауза' : 'Слушать'}
                </button>
                <Link to={`/track/${heroTrack.id}`} className="flex items-center gap-2 px-4 py-2.5 md:px-5 md:py-3 bg-white/10 hover:bg-white/15 rounded-full font-medium text-sm transition-all">
                  Подробнее
                </Link>
                <button onClick={handleShuffleAll}
                  className="flex items-center gap-2 px-4 py-2.5 md:px-5 md:py-3 bg-white/10 hover:bg-white/15 rounded-full font-medium text-sm transition-all active:scale-95">
                  <Shuffle size={16} />
                  Перемешать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-12">

        {/* === Personalised sections === */}

        {/* For You — personal mix (limited to 5) */}
        {isLoggedIn && forYouLoading ? (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Sparkles size={20} className="text-purple-400" />
              <h2 className="text-xl font-bold">Для вас</h2>
              <span className="text-xs text-zinc-500 ml-1">персональный микс</span>
            </div>
            <div className="space-y-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl animate-pulse">
                  <div className="w-5 text-center text-sm text-zinc-700">{i + 1}</div>
                  <div className="w-10 h-10 rounded-md bg-zinc-800" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-32 bg-zinc-800 rounded" />
                    <div className="h-3 w-20 bg-zinc-800/60 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : isLoggedIn && forYouTracks.length > 0 ? (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Sparkles size={20} className="text-purple-400" />
              <h2 className="text-xl font-bold">Для вас</h2>
              <span className="text-xs text-zinc-500 ml-1">персональный микс</span>
            </div>
            <div className="space-y-1">
              {forYouTracks.slice(0, 5).map((track, i) => (
                <TrackCard key={track.id} track={track} queue={forYouTracks} showRank={i + 1} />
              ))}
            </div>
          </section>
        ) : !isLoggedIn && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={20} className="text-purple-400" />
              <h2 className="text-xl font-bold">Для вас</h2>
            </div>
            <button
              onClick={() => openAuthModal('login')}
              className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/60 transition-colors cursor-pointer"
            >
              <Lock size={18} className="text-purple-400" />
              <span className="text-zinc-400 text-sm text-center">Войдите, чтобы получить персональные рекомендации</span>
            </button>
          </section>
        )}

        {/* New For You — new releases (personalized when logged in, general otherwise) */}
        {newForYouTracks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Zap size={20} className="text-yellow-400" />
              <h2 className="text-xl font-bold">{isLoggedIn ? 'Новинки для вас' : 'Новинки'}</h2>
              <span className="text-xs text-zinc-500 ml-1">{isLoggedIn ? 'персональные новинки' : 'недавно добавленные'}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {newForYouTracks.map(track => (
                <div key={track.id} className="group relative block rounded-xl overflow-hidden cursor-pointer" onClick={() => playTrack(track, newForYouTracks)}>
                  <div className="aspect-square">
                    <img src={track.cover} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute top-2 right-2">
                    <span className="bg-yellow-500/90 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">New</span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center shadow-lg">
                      <Play size={18} fill="white" className="text-white ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-white text-sm font-semibold truncate">{track.title}</p>
                    <p className="text-zinc-400 text-xs truncate">{track.artist}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Rediscover — forgotten favorites */}
        {isLoggedIn && rediscoverTracks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Heart size={20} className="text-pink-400" />
              <h2 className="text-xl font-bold">Забытые хиты</h2>
              <span className="text-xs text-zinc-500 ml-1">треки, которые вы давно не слушали</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {rediscoverTracks.map(track => (
                <div key={track.id} className="group relative block rounded-xl overflow-hidden cursor-pointer" onClick={() => playTrack(track, rediscoverTracks)}>
                  <div className="aspect-square">
                    <img src={track.cover} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center shadow-lg">
                      <Play size={18} fill="white" className="text-white ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-white text-sm font-semibold truncate">{track.title}</p>
                    <p className="text-zinc-400 text-xs truncate">{track.artist}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Популярное — icon grid of popular tracks */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp size={20} className="text-red-400" />
              <h2 className="text-xl font-bold">Популярное</h2>
            </div>
            <Link to="/tracks" className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors">
              Все треки <ChevronRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {popularTracks.slice(0, 10).map((track, i) => (
              <div key={track.id} className={`group relative block rounded-xl overflow-hidden cursor-pointer ${i >= 6 ? 'hidden md:block' : ''}`} onClick={() => playTrack(track, popularTracks)}>
                <div className="aspect-square">
                  <img src={track.cover} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                {/* Rank badge */}
                <div className="absolute top-2 left-2">
                  <span className="bg-black/60 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">{i + 1}</span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                    <Play size={18} fill="white" className="text-white ml-0.5" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white text-sm font-semibold truncate">{track.title}</p>
                  <p className="text-zinc-400 text-xs truncate">{track.artist} · {formatPlays(track.plays)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Популярные пользователи (скрыть если < 4) */}
        {popularUsers.length >= 4 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Users size={20} className="text-blue-400" />
              <h2 className="text-xl font-bold">Популярные пользователи</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {popularUsers.slice(0, 8).map(u => (
                <Link key={u.id} to={`/user/${u.id}`} className="group flex flex-col items-center">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden mb-3 ring-2 ring-transparent group-hover:ring-blue-400 transition-all">
                    <img src={userAvatar(u)} alt={u.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <p className="text-white text-sm font-medium truncate max-w-full">{u.name}</p>
                  <p className="text-zinc-500 text-xs">{u.followersCount} {u.followersCount === 1 ? 'подписчик' : u.followersCount < 5 ? 'подписчика' : 'подписчиков'}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Популярные открытые комнаты */}
        {publicRooms.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Radio size={20} className="text-green-400" />
              <h2 className="text-xl font-bold">Слушают сейчас</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {publicRooms.slice(0, 8).map(room => (
                <Link key={room.hostId} to={`/user/${room.hostId}`} className="group bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-green-500/40 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative">
                      <img src={roomHostAvatar(room)} alt={room.hostName} className="w-10 h-10 rounded-full object-cover" />
                      {room.isPlaying && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-zinc-900 animate-pulse" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{room.hostName}</p>
                      <p className="text-zinc-500 text-xs flex items-center gap-1">
                        <Headphones size={10} />
                        {room.listenersCount} {room.listenersCount === 1 ? 'слушатель' : room.listenersCount < 5 ? 'слушателя' : 'слушателей'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <img src={room.trackCover} alt={room.trackTitle} className="w-10 h-10 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{room.trackTitle}</p>
                      <p className="text-zinc-500 text-xs truncate">{room.trackArtist}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Artists */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-red-400" />
              <h2 className="text-xl font-bold">Артисты</h2>
            </div>
            <Link to="/artists" className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors">
              Все артисты <ChevronRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {topArtists.map(artist => (
              <Link key={artist.id} to={`/artist/${artist.slug}`} className="group flex flex-col items-center">
                <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden mb-3 ring-2 ring-transparent group-hover:ring-red-500 transition-all">
                  {artist.photo ? (
                    <img src={artist.photo} alt={artist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                      <Users size={32} className="text-zinc-600" />
                    </div>
                  )}
                </div>
                <p className="text-white text-sm font-medium truncate max-w-full">{artist.name}</p>
                <p className="text-zinc-500 text-xs">{formatPlays(artist.totalPlays)} прослушиваний</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
