import { useState, useMemo, useEffect } from 'react';
import { useStore, GENRES, Track } from '../store';
import TrackCard from '../components/TrackCard';
import { Search, Disc3, Play, Pause, X, Heart, MoreHorizontal, Music, Shuffle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatPlays } from '../utils/format';

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
type View = 'tracks' | 'albums';

export default function TracksPage() {
  const { tracks, player, playTrack, togglePlay, toggleFullscreen, toggleLike, currentUser, toggleAlbumLike } = useStore();
  const [searchParams] = useSearchParams();
  const [sort, setSort] = useState<Sort>('popular');
  const [genre, setGenre] = useState(searchParams.get('genre') || 'Все');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>((searchParams.get('view') as View) || 'tracks');
  const [mobileAlbum, setMobileAlbum] = useState<Album | null>(null);
  const PER_PAGE = 50;

  // Sync genre and view from URL params
  useEffect(() => {
    const g = searchParams.get('genre');
    if (g && GENRES.includes(g)) setGenre(g);
    const v = searchParams.get('view');
    if (v === 'albums' || v === 'tracks') setView(v);
  }, [searchParams]);

  const filtered = tracks
    .filter(t => genre === 'Все' || t.genre === genre)
    .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.artist.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'popular') return b.plays - a.plays;
      if (sort === 'new') return b.year - a.year;
      return a.title.localeCompare(b.title);
    });

  const paged = filtered.slice(0, page * PER_PAGE);

  // Build albums from all tracks (with meta.album)
  const albums = useMemo(() => {
    const albumMap = new Map<string, Album>();
    const src = genre === 'Все' ? tracks : tracks.filter(t => t.genre === genre);

    for (const track of src) {
      const albumName = track.meta?.album;
      if (!albumName) continue;

      if (!albumMap.has(albumName)) {
        albumMap.set(albumName, {
          name: albumName,
          cover: track.cover,
          year: track.year,
          artist: track.artist,
          artistSlug: track.artistSlug,
          tracks: [],
          totalPlays: 0,
        });
      }
      const album = albumMap.get(albumName)!;
      album.tracks.push(track);
      album.totalPlays += track.plays;
    }

    let result = [...albumMap.values()].filter(a => a.tracks.length > 1);

    // Apply search filter to albums too
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q));
    }

    return result.sort((a, b) => {
      if (sort === 'popular') return b.totalPlays - a.totalPlays;
      if (sort === 'new') return b.year - a.year;
      return a.name.localeCompare(b.name);
    });
  }, [tracks, genre, search, sort]);

  const handlePlayAlbum = (album: Album) => {
    const firstTrack = album.tracks[0];
    if (firstTrack) playTrack(firstTrack, album.tracks);
  };

  const handleShuffleAll = () => {
    const source = view === 'tracks' ? filtered : tracks.filter(t => genre === 'Все' || t.genre === genre);
    if (source.length === 0) return;
    const shuffled = [...source].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-black">Музыка</h1>
          <button
            onClick={handleShuffleAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-full text-sm font-medium transition-colors"
          >
            <Shuffle size={16} />
            Перемешать всё
          </button>
        </div>

        {/* View toggle: Tracks / Albums */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
          <button
            onClick={() => { setView('tracks'); setPage(1); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${view === 'tracks' ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            <Music size={16} />
            Треки
          </button>
          <button
            onClick={() => { setView('albums'); setPage(1); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${view === 'albums' ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            <Disc3 size={16} />
            Альбомы
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder={view === 'tracks' ? 'Поиск треков...' : 'Поиск альбомов...'} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50" />
          </div>

          <select value={genre} onChange={e => { setGenre(e.target.value); setPage(1); }}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none">
            <option value="Все">Все жанры</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-full md:w-auto">
            {(['popular', 'new', 'alpha'] as Sort[]).map(s => (
              <button key={s} onClick={() => { setSort(s); setPage(1); }}
                className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-sm transition-all ${sort === s ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
                {s === 'popular' ? 'Популярные' : s === 'new' ? 'Новые' : 'А-Я'}
              </button>
            ))}
          </div>
        </div>

        {/* === TRACKS VIEW === */}
        {view === 'tracks' && (
          <>
            <p className="text-zinc-600 text-sm mb-4">{filtered.length} треков</p>
            <div className="space-y-1">
              {paged.map((t, i) => <TrackCard key={t.id} track={t} queue={filtered} showRank={i + 1} />)}
            </div>
            {paged.length < filtered.length && (
              <button onClick={() => setPage(p => p + 1)}
                className="w-full mt-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-zinc-400 hover:text-white transition-all">
                Загрузить ещё
              </button>
            )}
            {filtered.length === 0 && (
              <div className="text-center py-16">
                <Music size={40} className="text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">Треков не найдено</p>
              </div>
            )}
          </>
        )}

        {/* === ALBUMS VIEW === */}
        {view === 'albums' && (
          <>
            <p className="text-zinc-600 text-sm mb-4">{albums.length} альбомов</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {albums.map(album => {
                const isAlbumPlaying = album.tracks.some(t => t.id === player.currentTrack?.id) && player.isPlaying;
                return (
                  <div key={album.name} className="col-span-1">
                    <div
                      className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer mb-2"
                      onClick={() => setMobileAlbum(album)}
                    >
                      <img src={album.cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePlayAlbum(album); }}
                        className={`absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${isAlbumPlaying ? 'bg-red-500 opacity-100' : 'bg-black/60 opacity-0 group-hover:opacity-100'}`}
                      >
                        {isAlbumPlaying ? <Pause size={16} fill="white" className="text-white" /> : <Play size={16} fill="white" className="text-white" />}
                      </button>
                    </div>
                    <p className="text-white text-sm font-semibold truncate">{album.name}</p>
                    <Link to={`/artist/${album.artistSlug}`} className="text-zinc-500 text-xs hover:text-white transition-colors truncate block">{album.artist}</Link>
                    <p className="text-zinc-600 text-xs">{album.year} · {album.tracks.length} треков</p>
                  </div>
                );
              })}
            </div>
            {albums.length === 0 && (
              <div className="text-center py-16">
                <Disc3 size={40} className="text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">Альбомов не найдено</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fullscreen album overlay */}
      {mobileAlbum && (
        <div className="fixed inset-0 z-[60] bg-zinc-950 overflow-y-auto">
          {/* Blurred background from album cover */}
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: `url(${mobileAlbum.cover})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) saturate(1.5)' }} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/80 to-zinc-950" />

          <div className="relative z-10 flex flex-col items-center pt-12 px-4 max-w-2xl mx-auto" style={{ paddingBottom: player.currentTrack ? '140px' : '80px' }}>
            {/* Close button */}
            <button
              onClick={() => setMobileAlbum(null)}
              className="absolute top-4 left-4 w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition"
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

            {/* Action buttons: more, play, heart */}
            <div className="flex items-center gap-5 mt-5">
              <button className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                <MoreHorizontal size={20} className="text-white" />
              </button>
              <button
                onClick={() => handlePlayAlbum(mobileAlbum)}
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
                      {isPlaying ? '▸' : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isCurrent ? 'text-red-400' : 'text-white'}`}>{t.title}</p>
                    </div>
                    <span className="text-zinc-600 text-xs tabular-nums">
                      {t.duration ? `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, '0')}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Album stats */}
            <p className="text-zinc-600 text-xs mt-4">{formatPlays(mobileAlbum.totalPlays)} прослушиваний</p>
          </div>

          {/* Bottom bar: mini player + nav inside album overlay */}
          <div className="fixed bottom-0 left-0 right-0 z-[61] md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            {/* Mini player — tap opens fullscreen (only when track playing) */}
            {player.currentTrack && (
              <div className="bg-zinc-950 border-t border-white/5">
                <div className="flex flex-col" onClick={toggleFullscreen}>
                  {/* Thin red progress bar at top */}
                  <div className="h-[2px] bg-zinc-800 w-full">
                    <div className="h-full bg-red-500 transition-all duration-200" style={{ width: `${player.progress * 100}%` }} />
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                      <img src={player.currentTrack.cover} alt={player.currentTrack.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate leading-snug">{player.currentTrack.title}</p>
                      <p className="text-zinc-400 text-xs truncate leading-snug">{player.currentTrack.artist}</p>
                    </div>
                    {(() => {
                      const isTrackLiked = currentUser?.likedTracks?.includes(player.currentTrack!.id) ?? false;
                      return (
                        <button onClick={(e) => { e.stopPropagation(); toggleLike(player.currentTrack!.id); }} className={`w-10 h-10 flex items-center justify-center transition-colors ${isTrackLiked ? 'text-red-500' : 'text-zinc-500'}`}>
                          <Heart size={22} fill={isTrackLiked ? 'currentColor' : 'none'} />
                        </button>
                      );
                    })()}
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                      className="w-10 h-10 flex items-center justify-center text-white"
                    >
                      {player.isPlaying
                        ? <Pause size={24} fill="white" />
                        : <Play size={24} fill="white" />
                      }
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Bottom nav — always visible */}
            <div className="bg-zinc-950/95 backdrop-blur-xl border-t border-white/5" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              <div className="flex items-center justify-around px-4 py-2">
                {[
                  { to: '/', icon: 'home' },
                  { to: '/tracks', icon: 'music' },
                  { to: '/artists', icon: 'mic' },
                  ...(currentUser ? [{ to: '/liked', icon: 'heart' }] : []),
                ].map(({ to, icon }) => (
                  <a key={to} href={to} className="flex items-center justify-center w-12 h-10 rounded-xl text-zinc-500 active:text-zinc-300 transition-colors">
                    {icon === 'home' && <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
                    {icon === 'music' && <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>}
                    {icon === 'mic' && <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 8-9.04 9.06a2.82 2.82 0 1 0 3.98 3.98L16 12"/><circle cx="17" cy="7" r="5"/></svg>}
                    {icon === 'heart' && <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
