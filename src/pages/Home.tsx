import { useStore, GENRES, Track } from '../store';
import { Play, Pause, TrendingUp, Clock, Users, ChevronRight, Flame } from 'lucide-react';
import { formatPlays } from '../utils/format';
import TrackCard from '../components/TrackCard';
import { Link } from 'react-router-dom';

export default function Home() {
  const { tracks, artists, heroTrackId, activeGenre, setActiveGenre, player, playTrack, togglePlay } = useStore();

  const heroTrack = tracks.find(t => t.id === heroTrackId) || tracks[0];
  const isHeroPlaying = player.currentTrack?.id === heroTrack?.id && player.isPlaying;

  const allGenres = ['Все', ...GENRES];

  const filteredTracks = activeGenre === 'Все' ? tracks : tracks.filter(t => t.genre === activeGenre);
  const popularTracks = [...tracks].sort((a, b) => b.plays - a.plays).slice(0, 10);
  const newTracks = tracks.filter(t => t.isNew).slice(0, 6);

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
          {/* Blurred background cover */}
          <div className="absolute inset-0" style={{ backgroundImage: `url(${heroTrack.cover})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(20px) saturate(1.2)', transform: 'scale(1.1)' }} />
          {/* RF Warning Banner — overlay inside hero */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-red-950/70 backdrop-blur-sm px-3 py-1 flex items-center justify-center gap-2 text-center">
            <span className="text-red-400 text-[9px] md:text-xs font-bold uppercase tracking-widest">
              ⚠️ САЙТ НЕ РАБОТАЕТ НА ТЕРРИТОРИИ РОССИЙСКОЙ ФЕДЕРАЦИИ
            </span>
          </div>
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
        {/* Genre filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {allGenres.map(g => (
            <button
              key={g}
              onClick={() => setActiveGenre(g)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeGenre === g ? 'bg-red-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'}`}
            >
              {g}
            </button>
          ))}
        </div>

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

          {/* Carousel */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {popularTracks.slice(0, 5).map(track => (
              <PopularCard key={track.id} track={track} allTracks={tracks} />
            ))}
          </div>

          {/* List */}
          <div className="space-y-1">
            {(activeGenre === 'Все' ? popularTracks : filteredTracks.sort((a,b) => b.plays - a.plays)).slice(0, 8).map((track, i) => (
              <TrackCard key={track.id} track={track} queue={filteredTracks} showRank={i + 1} />
            ))}
          </div>
        </section>

        {/* New tracks */}
        {(activeGenre === 'Все' || newTracks.some(t => t.genre === activeGenre)) && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Clock size={20} className="text-red-400" />
                <h2 className="text-xl font-bold">Новинки</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {(activeGenre === 'Все' ? newTracks : newTracks.filter(t => t.genre === activeGenre)).map(track => (
                <TrackCard key={track.id} track={track} queue={newTracks} />
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {artists.map(artist => (
              <Link key={artist.id} to={`/artist/${artist.slug}`} className="group text-center">
                <div className="aspect-square rounded-full overflow-hidden mb-3 ring-2 ring-transparent group-hover:ring-red-500 transition-all">
                  <img src={artist.photo} alt={artist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <p className="text-white text-sm font-medium truncate">{artist.name}</p>
                <p className="text-zinc-500 text-xs">{formatPlays(artist.totalPlays)} прослушиваний</p>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="pb-24" />
    </div>
  );
}

function PopularCard({ track, allTracks }: { track: Track; allTracks: Track[] }) {
  const { player, playTrack, togglePlay } = useStore();
  const isActive = player.currentTrack?.id === track.id;
  const isPlaying = isActive && player.isPlaying;

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isActive) togglePlay();
    else playTrack(track, allTracks);
  };

  return (
    <Link to={`/track/${track.id}`} className="group relative block rounded-xl overflow-hidden">
      <div className="aspect-square">
        <img src={track.cover} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white text-sm font-semibold truncate">{track.title}</p>
        <p className="text-zinc-400 text-xs truncate">{track.artist}</p>
      </div>
      <button
        onClick={handlePlay}
        className={`absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-lg ${isActive ? 'bg-red-500 opacity-100' : 'bg-black/50 opacity-0 group-hover:opacity-100'}`}
      >
        {isPlaying ? <Pause size={14} fill="white" className="text-white" /> : <Play size={14} fill="white" className="text-white ml-0.5" />}
      </button>
      {isActive && (
        <div className="absolute top-2 left-2 flex gap-0.5 items-end h-5">
          {[1,2,3].map(i => (
            <div key={i} className="w-1 bg-red-500 rounded-full animate-bounce" style={{ height: `${40 + i * 20}%`, animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}
    </Link>
  );
}
