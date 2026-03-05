import { useStore, Track } from '../store';
import { Play, Pause, TrendingUp, Users, ChevronRight, Flame, Disc3 } from 'lucide-react';
import { formatPlays } from '../utils/format';
import TrackCard from '../components/TrackCard';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';

export default function Home() {
  const { tracks, artists, heroTrackId, player, playTrack, togglePlay } = useStore();

  const heroTrack = tracks.find(t => t.id === heroTrackId) || tracks[0];
  const isHeroPlaying = player.currentTrack?.id === heroTrack?.id && player.isPlaying;

  const popularTracks = [...tracks].sort((a, b) => b.plays - a.plays).slice(0, 10);

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
                  {isHeroPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
                  {isHeroPlaying ? 'Пауза' : 'Слушать'}
                </button>
                <Link to={`/track/${heroTrack.id}`} className="flex items-center gap-2 px-4 py-2.5 md:px-5 md:py-3 bg-white/10 hover:bg-white/15 rounded-full font-medium text-sm transition-all">
                  Подробнее
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-12">
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
                <Link to="/tracks?view=albums" className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors">
                  Все альбомы <ChevronRight size={16} />
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {popularAlbums.map(album => (
                  <Link key={album.name} to={`/artist/${album.artistSlug}?album=${encodeURIComponent(album.name)}`} className="group relative block rounded-xl overflow-hidden">
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
