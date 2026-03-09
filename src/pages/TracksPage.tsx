import { useState, useMemo, useEffect } from 'react';
import { useStore, GENRES, Track } from '../store';
import { Search, Play, Pause, X, Heart, Music, Shuffle, Share2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatPlays, formatDuration } from '../utils/format';

interface Album {
  name: string;
  cover: string;
  year: number;
  artist: string;
  artistSlug: string;
  tracks: Track[];
  totalPlays: number;
}

type Sort = 'new' | 'popular' | 'alpha';

/* Unified card item — either a multi-track album or a single track */
interface CardItem {
  type: 'album' | 'single';
  key: string;
  name: string;
  artist: string;
  artistSlug: string;
  cover: string;
  year: number;
  plays: number;
  tracks: Track[];
  createdAt: number;
}

export default function TracksPage() {
  const { tracks, player, playTrack, currentUser, toggleAlbumLike } = useStore();
  const [searchParams] = useSearchParams();
  const [sort, setSort] = useState<Sort>('popular');
  const [genre, setGenre] = useState(searchParams.get('genre') || 'Все');
  const [search, setSearch] = useState('');
  const [mobileAlbum, setMobileAlbum] = useState<Album | null>(null);

  // Lock body scroll when album overlay is open
  useEffect(() => {
    if (mobileAlbum) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [mobileAlbum]);

  // Sync genre from URL params
  useEffect(() => {
    const g = searchParams.get('genre');
    if (g && GENRES.includes(g)) setGenre(g);
  }, [searchParams]);

  // Build unified card list: albums (grouped) + singles
  const cards = useMemo(() => {
    const src = genre === 'Все' ? tracks : tracks.filter(t => t.genre === genre);

    // Group tracks by album
    const albumMap = new Map<string, Track[]>();
    const singles: Track[] = [];

    for (const t of src) {
      const albumName = t.meta?.album;
      if (albumName) {
        if (!albumMap.has(albumName)) albumMap.set(albumName, []);
        albumMap.get(albumName)!.push(t);
      } else {
        singles.push(t);
      }
    }

    const items: CardItem[] = [];

    // Albums with 2+ tracks become album cards
    for (const [name, albumTracks] of albumMap) {
      if (albumTracks.length > 1) {
        const first = albumTracks[0];
        const totalPlays = albumTracks.reduce((s, t) => s + t.plays, 0);
        const latestDate = albumTracks.reduce((max, t) => {
          const d = new Date(t.createdAt || 0).getTime();
          return d > max ? d : max;
        }, 0);
        items.push({
          type: 'album',
          key: `album-${name}`,
          name,
          artist: first.artist,
          artistSlug: first.artistSlug,
          cover: first.cover,
          year: first.year,
          plays: totalPlays,
          tracks: albumTracks,
          createdAt: latestDate,
        });
      } else {
        // Solo album tracks become singles
        singles.push(...albumTracks);
      }
    }

    // Singles become individual cards
    for (const t of singles) {
      items.push({
        type: 'single',
        key: `track-${t.id}`,
        name: t.title,
        artist: t.artist,
        artistSlug: t.artistSlug,
        cover: t.cover,
        year: t.year,
        plays: t.plays,
        tracks: [t],
        createdAt: new Date(t.createdAt || 0).getTime(),
      });
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      return items
        .filter(c => c.name.toLowerCase().includes(q) || c.artist.toLowerCase().includes(q))
        .sort((a, b) => {
          if (sort === 'popular') return b.plays - a.plays;
          if (sort === 'new') return b.createdAt - a.createdAt;
          return a.name.localeCompare(b.name);
        });
    }

    // Sort
    items.sort((a, b) => {
      if (sort === 'popular') return b.plays - a.plays;
      if (sort === 'new') return b.createdAt - a.createdAt;
      return a.name.localeCompare(b.name);
    });

    return items;
  }, [tracks, genre, search, sort]);

  const handlePlayCard = (card: CardItem) => {
    if (card.tracks.length > 0) playTrack(card.tracks[0], card.tracks);
  };

  const handleShuffleAll = () => {
    const allTracks = cards.flatMap(c => c.tracks);
    if (allTracks.length === 0) return;
    const shuffled = [...allTracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const openAlbumOverlay = (card: CardItem) => {
    if (card.type === 'album') {
      setMobileAlbum({
        name: card.name,
        cover: card.cover,
        year: card.year,
        artist: card.artist,
        artistSlug: card.artistSlug,
        tracks: card.tracks,
        totalPlays: card.plays,
      });
    } else {
      // Single — just play it
      playTrack(card.tracks[0], cards.flatMap(c => c.tracks));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-black">Музыка</h1>
          <button
            onClick={handleShuffleAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-full text-sm font-medium transition-colors"
          >
            <Shuffle size={16} />
            <span className="hidden sm:inline">Перемешать всё</span>
          </button>
        </div>

        {/* Genre pills */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
          {['Все', ...GENRES].map(g => (
            <button key={g} onClick={() => setGenre(g)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${genre === g ? 'bg-red-500 text-white' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'}`}>
              {g}
            </button>
          ))}
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder="Поиск треков и альбомов..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50" />
          </div>

          <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-full md:w-auto">
            {(['popular', 'new', 'alpha'] as Sort[]).map(s => (
              <button key={s} onClick={() => setSort(s)}
                className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-sm transition-all ${sort === s ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
                {s === 'popular' ? 'Популярные' : s === 'new' ? 'Новые' : 'А-Я'}
              </button>
            ))}
          </div>
        </div>

        {/* Unified cards grid */}
        <p className="text-zinc-600 text-sm mb-4">{cards.length} релизов</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {cards.map(card => {
            const isCardPlaying = card.tracks.some(t => t.id === player.currentTrack?.id) && player.isPlaying;
            return (
              <div key={card.key} className="group cursor-pointer" onClick={() => openAlbumOverlay(card)}>
                <div className="relative aspect-square rounded-xl overflow-hidden mb-2">
                  <img src={card.cover} alt={card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  {card.type === 'album' && (
                    <div className="absolute top-2 left-2">
                      <span className="bg-white/15 backdrop-blur-md text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">{card.tracks.length} треков</span>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePlayCard(card); }}
                    className={`absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${isCardPlaying ? 'bg-red-500 opacity-100' : 'bg-black/60 opacity-0 group-hover:opacity-100'}`}
                  >
                    {isCardPlaying ? <Pause size={16} fill="white" className="text-white" /> : <Play size={16} fill="white" className="text-white" />}
                  </button>
                </div>
                <p className="text-white text-sm font-semibold truncate">{card.name}</p>
                <p className="text-zinc-500 text-xs truncate">{card.artist}</p>
                <p className="text-zinc-600 text-xs">{formatPlays(card.plays)} прослушиваний</p>
              </div>
            );
          })}
        </div>

        {cards.length === 0 && (
          <div className="text-center py-16">
            <Music size={40} className="text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">Ничего не найдено</p>
          </div>
        )}
      </div>

      {/* Fullscreen album overlay */}
      {mobileAlbum && (
        <div className="fixed inset-0 z-[60] bg-zinc-950 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          {/* Blurred background from album cover */}
          <div className="fixed inset-0 opacity-30" style={{ backgroundImage: `url(${mobileAlbum.cover})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) saturate(1.5)' }} />
          <div className="fixed inset-0 bg-gradient-to-b from-transparent via-zinc-950/80 to-zinc-950" />

          <div className="relative z-10 flex flex-col items-center pt-12 px-4 max-w-2xl mx-auto" style={{ paddingBottom: player.currentTrack ? '140px' : '80px' }}>
            {/* Close button */}
            <button
              onClick={() => setMobileAlbum(null)}
              className="absolute top-4 left-4 md:left-auto md:right-4 w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition"
            >
              <X size={18} className="text-white" />
            </button>

            {/* Album cover */}
            <img src={mobileAlbum.cover} alt={mobileAlbum.name} className="w-56 h-56 md:w-72 md:h-72 rounded-2xl object-cover shadow-2xl mb-5" />

            {/* Album title */}
            <h2 className="text-white font-bold text-xl text-center">{mobileAlbum.name}</h2>

            {/* Artist + year */}
            <div className="flex items-center gap-2 mt-2">
              <Link to={`/artist/${mobileAlbum.artistSlug}`} onClick={() => setMobileAlbum(null)} className="text-zinc-400 text-sm hover:text-white transition-colors">{mobileAlbum.artist}</Link>
              <span className="text-zinc-600 text-sm">·</span>
              <span className="text-zinc-400 text-sm">{mobileAlbum.year}</span>
            </div>

            {/* Action buttons: share, play, heart */}
            <div className="flex items-center gap-5 mt-5">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/artist/${mobileAlbum.artistSlug}?album=${encodeURIComponent(mobileAlbum.name)}`;
                  try {
                    if (navigator.share) navigator.share({ title: `${mobileAlbum.name} — ${mobileAlbum.artist}`, url }).catch(() => {});
                    else navigator.clipboard.writeText(url).catch(() => {});
                  } catch { navigator.clipboard.writeText(url).catch(() => {}); }
                }}
                className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center"
              >
                <Share2 size={20} className="text-white" />
              </button>
              <button
                onClick={() => { const first = mobileAlbum.tracks[0]; if (first) playTrack(first, mobileAlbum.tracks); }}
                className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30"
              >
                {mobileAlbum.tracks.some(t => t.id === player.currentTrack?.id) && player.isPlaying
                  ? <Pause size={24} fill="white" className="text-white" />
                  : <Play size={24} fill="white" className="text-white" />
                }
              </button>
              {(() => {
                const isAlbumLiked = currentUser?.likedAlbums?.includes(mobileAlbum.name) ?? false;
                return (
                  <button
                    onClick={() => toggleAlbumLike(mobileAlbum.name)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isAlbumLiked ? 'bg-red-500/20' : 'bg-white/10'}`}
                  >
                    <Heart size={20} className={isAlbumLiked ? 'text-red-500' : 'text-white'} fill={isAlbumLiked ? 'currentColor' : 'none'} />
                  </button>
                );
              })()}
            </div>

            {/* Track list */}
            <div className="w-full mt-7 space-y-0.5">
              {mobileAlbum.tracks.map((t, i) => {
                const isCurrent = player.currentTrack?.id === t.id;
                const isPlaying = isCurrent && player.isPlaying;
                return (
                  <button
                    key={t.id}
                    onClick={() => playTrack(t, mobileAlbum.tracks)}
                    className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left transition-colors ${isCurrent ? 'bg-white/5' : 'active:bg-white/5'}`}
                  >
                    <span className={`w-6 text-center text-sm tabular-nums ${isCurrent ? 'text-red-400 font-bold' : 'text-zinc-600'}`}>
                      {isCurrent
                        ? (isPlaying
                            ? <span className="inline-flex items-end gap-[2px] h-3 justify-center w-full"><span className="w-[2.5px] bg-red-400 rounded-full" style={{height:'40%',animation:'eqBar 0.5s ease-in-out infinite alternate'}}/><span className="w-[2.5px] bg-red-400 rounded-full" style={{height:'70%',animation:'eqBar 0.5s ease-in-out 0.2s infinite alternate'}}/><span className="w-[2.5px] bg-red-400 rounded-full" style={{height:'50%',animation:'eqBar 0.5s ease-in-out 0.4s infinite alternate'}}/></span>
                            : '‖')
                        : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isCurrent ? 'text-red-400' : 'text-white'}`}>{t.title}</p>
                    </div>
                    <span className="text-zinc-600 text-xs tabular-nums">
                      {t.duration ? formatDuration(t.duration) : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Album stats */}
            <p className="text-zinc-600 text-xs mt-4" style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))' }}>{formatPlays(mobileAlbum.totalPlays)} прослушиваний</p>
          </div>
        </div>
      )}
    </div>
  );
}
