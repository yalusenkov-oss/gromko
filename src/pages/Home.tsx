import { useStore, Track } from '../store';
import { Play, Pause, TrendingUp, Users, ChevronRight, Flame, Disc3, Sparkles, Shuffle, Heart, Clock, Zap } from 'lucide-react';
import { formatPlays } from '../utils/format';
import TrackCard from '../components/TrackCard';
import { Link } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

function useRecommendations(endpoint: string, enabled: boolean): Track[] {
  const [data, setData] = useState<Track[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const token = localStorage.getItem('gromko_token');
    if (!token) return;
    fetch(apiUrl(endpoint), {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => Array.isArray(d) ? setData(d) : setData([]))
      .catch(() => {});
  }, [endpoint, enabled]);
  return data;
}

export default function Home() {
  const { tracks, artists, heroTrackId, player, playTrack, togglePlay, toggleShuffle, currentUser, openAuthModal } = useStore();

  // Personal recommendations (only when logged in)
  const isLoggedIn = !!currentUser;
  const forYouTracks = useRecommendations('/recommendations/for-you?limit=10', isLoggedIn);
  const continueTracks = useRecommendations('/recommendations/continue?limit=6', isLoggedIn);
  const newForYouTracks = useRecommendations('/recommendations/new-for-you?limit=6', isLoggedIn);
  const rediscoverTracks = useRecommendations('/recommendations/rediscover?limit=6', isLoggedIn);

  const heroTrack = tracks.find(t => t.id === heroTrackId) || tracks[0];
  const isHeroPlaying = player.currentTrack?.id === heroTrack?.id && player.isPlaying;

  const popularTracks = [...tracks].sort((a, b) => b.plays - a.plays).slice(0, 10);

  // New releases — group by album (show album once, not each track), singles show individually
  const newReleases = useMemo(() => {
    const sorted = [...tracks]
      .filter(t => t.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    const seen = new Set<string>(); // album names already added
    const items: { type: 'track' | 'album'; track: Track; albumName?: string; albumTracks?: Track[] }[] = [];

    for (const t of sorted) {
      if (items.length >= 6) break;
      const albumName = t.meta?.album;
      if (albumName) {
        if (seen.has(albumName)) continue; // skip — album already shown
        seen.add(albumName);
        // Gather all tracks from this album
        const albumTracks = tracks.filter(at => at.meta?.album === albumName);
        if (albumTracks.length > 1) {
          items.push({ type: 'album', track: t, albumName, albumTracks });
        } else {
          items.push({ type: 'track', track: t });
        }
      } else {
        items.push({ type: 'track', track: t });
      }
    }
    return items;
  }, [tracks]);

  // Build popular albums from tracks
  const popularAlbums = useMemo(() => {
    const albumMap = new Map<string, { name: string; cover: string; artist: string; artistSlug: string; totalPlays: number; tracks: Track[] }>();
    for (const t of tracks) {
      const albumName = t.meta?.album;
      if (!albumName) continue;
      if (!albumMap.has(albumName)) {
        albumMap.set(albumName, { name: albumName, cover: t.cover, artist: t.artist, artistSlug: t.artistSlug, totalPlays: 0, tracks: [] });
      }
      const a = albumMap.get(albumName)!;
      a.tracks.push(t);
      a.totalPlays += t.plays;
    }
    return [...albumMap.values()]
      .filter(a => a.tracks.length > 1)
      .sort((a, b) => b.totalPlays - a.totalPlays)
      .slice(0, 6);
  }, [tracks]);

  // Top 4 artists by plays, with fallback photo from most popular track cover
  const topArtists = useMemo(() => {
    const sorted = [...artists].sort((a, b) => b.totalPlays - a.totalPlays).slice(0, 4);
    return sorted.map(a => {
      // If artist has no photo or it's a default placeholder, use cover from their most popular track
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
    // Pick a random starting track and enable shuffle
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
    // Enable shuffle mode
    if (!player.shuffle) toggleShuffle();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-14">
      {/* Hero */}
      {heroTrack && (
        <div
          className="relative h-[320px] md:h-[560px] flex items-end overflow-hidden"
        >
          {/* Blurred background cover — light blur mobile, stronger on desktop */}
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

        {/* === Personalised sections (logged in) === */}

        {/* Continue Listening */}
        {isLoggedIn && continueTracks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Clock size={20} className="text-red-400" />
              <h2 className="text-xl font-bold">Продолжить слушать</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {continueTracks.map(track => (
                <div key={track.id} className="group relative block rounded-xl overflow-hidden cursor-pointer" onClick={() => playTrack(track, continueTracks)}>
                  <div className="aspect-square">
                    <img src={track.cover} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
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

        {/* For You — personal mix */}
        {isLoggedIn && forYouTracks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Sparkles size={20} className="text-purple-400" />
              <h2 className="text-xl font-bold">Для вас</h2>
              <span className="text-xs text-zinc-500 ml-1">персональный микс</span>
            </div>
            <div className="space-y-1">
              {forYouTracks.map((track, i) => (
                <TrackCard key={track.id} track={track} queue={forYouTracks} showRank={i + 1} />
              ))}
            </div>
          </section>
        )}

        {/* New For You */}
        {isLoggedIn && newForYouTracks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Zap size={20} className="text-yellow-400" />
              <h2 className="text-xl font-bold">Новинки для вас</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {newForYouTracks.map(track => (
                <Link key={track.id} to={`/track/${track.id}`} className="group relative block rounded-xl overflow-hidden">
                  <div className="aspect-square">
                    <img src={track.cover} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute top-2 right-2">
                    <span className="bg-yellow-500/90 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">New</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-white text-sm font-semibold truncate">{track.title}</p>
                    <p className="text-zinc-400 text-xs truncate">{track.artist}</p>
                  </div>
                </Link>
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

        {/* Popular tracks */}
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

          {/* Top 5 tracks as list */}
          <div className="space-y-1 mb-8">
            {popularTracks.length > 0 ? (
              popularTracks.slice(0, 5).map((track, i) => (
                <TrackCard key={track.id} track={track} queue={tracks} showRank={i + 1} />
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-zinc-500 text-sm">Треки загружаются...</p>
              </div>
            )}
          </div>

          {/* Popular Albums */}
          {popularAlbums.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Disc3 size={18} className="text-red-400" />
                  <h3 className="text-lg font-semibold">Популярные альбомы</h3>
                </div>
                <Link to="/tracks" className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors">
                  Все альбомы <ChevronRight size={16} />
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {popularAlbums.map(album => (
                  <Link key={album.name} to={`/artist/${album.artistSlug}?album=${encodeURIComponent(album.name)}`} state={{ openAlbum: true, albumData: { name: album.name, cover: album.cover, artist: album.artist, tracks: album.tracks, totalPlays: album.totalPlays, year: album.tracks[0]?.year || 0 } }} className="group relative block rounded-xl overflow-hidden">
                    <div className="aspect-square">
                      <img src={album.cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white text-sm font-semibold truncate">{album.name}</p>
                      <p className="text-zinc-400 text-xs truncate">{album.artist} · {album.tracks.length} треков · {formatPlays(album.totalPlays)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* New releases */}
        {newReleases.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Sparkles size={20} className="text-red-400" />
                <h2 className="text-xl font-bold">Новинки</h2>
              </div>
              <Link to="/tracks?sort=new" className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors">
                Все новинки <ChevronRight size={16} />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {newReleases.map(item => {
                if (item.type === 'album' && item.albumName) {
                  // Album card — link to artist page with album overlay
                  return (
                    <Link key={`album-${item.albumName}`}
                      to={`/artist/${item.track.artistSlug}?album=${encodeURIComponent(item.albumName)}`}
                      state={{ openAlbum: true, albumData: { name: item.albumName, cover: item.track.cover, artist: item.track.artist, tracks: item.albumTracks, totalPlays: item.albumTracks?.reduce((s, t) => s + t.plays, 0) || 0, year: item.track.year } }}
                      className="group relative block rounded-xl overflow-hidden">
                      <div className="aspect-square">
                        <img src={item.track.cover} alt={item.albumName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute top-2 right-2">
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">New</span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-white text-sm font-semibold truncate">{item.albumName}</p>
                        <p className="text-zinc-400 text-xs truncate">{item.track.artist} · {item.albumTracks?.length} треков</p>
                      </div>
                    </Link>
                  );
                }
                // Single track card
                return (
                  <Link key={item.track.id} to={`/track/${item.track.id}`} className="group relative block rounded-xl overflow-hidden">
                    <div className="aspect-square">
                      <img src={item.track.cover} alt={item.track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute top-2 right-2">
                      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">New</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white text-sm font-semibold truncate">{item.track.title}</p>
                      <p className="text-zinc-400 text-xs truncate">{item.track.artist}</p>
                    </div>
                  </Link>
                );
              })}
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
