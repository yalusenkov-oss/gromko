import { useState, useMemo, useEffect } from 'react';
import { useStore, GENRES, Track } from '../store';
import TrackCard from '../components/TrackCard';
import { Search, Disc3, Play, Pause } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiUrl } from '../lib/api';

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

export default function TracksPage() {
  const { tracks, player, playTrack } = useStore();
  const [sort, setSort] = useState<Sort>('popular');
  const [genre, setGenre] = useState('Все');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const PER_PAGE = 20;

  // Fetch all tracks with meta.album from API
  useEffect(() => {
    fetch(apiUrl('/tracks?limit=500'))
      .then(r => r.json())
      .then(data => { if (data.tracks) setAllTracks(data.tracks); })
      .catch(() => {});
  }, []);

  const tracksWithMeta = allTracks.length > 0 ? allTracks : tracks;

  const filtered = tracksWithMeta
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
    const src = genre === 'Все' ? tracksWithMeta : tracksWithMeta.filter(t => t.genre === genre);

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

    // Only keep albums with 2+ tracks
    return [...albumMap.values()]
      .filter(a => a.tracks.length > 1)
      .sort((a, b) => b.totalPlays - a.totalPlays)
      .slice(0, 12);
  }, [tracksWithMeta, genre]);

  const handlePlayAlbum = (album: Album) => {
    const firstTrack = album.tracks[0];
    if (firstTrack) playTrack(firstTrack, album.tracks);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-24">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <h1 className="text-3xl font-black mb-6">Все треки</h1>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder="Поиск треков..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50" />
          </div>

          <select value={genre} onChange={e => setGenre(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none">
            <option value="Все">Все жанры</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {(['popular', 'new', 'alpha'] as Sort[]).map(s => (
              <button key={s} onClick={() => setSort(s)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${sort === s ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
                {s === 'popular' ? 'Популярные' : s === 'new' ? 'Новые' : 'А-Я'}
              </button>
            ))}
          </div>
        </div>

        {/* Albums section */}
        {albums.length > 0 && !search && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <Disc3 size={18} className="text-red-400" />
              <h2 className="text-lg font-bold">Альбомы</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
              {albums.slice(0, expandedAlbum ? 12 : 8).map(album => {
                const isExpanded = expandedAlbum === album.name;
                const isAlbumPlaying = album.tracks.some(t => t.id === player.currentTrack?.id) && player.isPlaying;

                return (
                  <div key={album.name} className="col-span-1">
                    <div
                      className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer mb-2"
                      onClick={() => setExpandedAlbum(isExpanded ? null : album.name)}
                    >
                      <img src={album.cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePlayAlbum(album); }}
                        className={`absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${isAlbumPlaying ? 'bg-red-500 opacity-100' : 'bg-black/60 opacity-0 group-hover:opacity-100'}`}
                      >
                        {isAlbumPlaying ? <Pause size={16} fill="white" className="text-white" /> : <Play size={16} fill="white" className="text-white ml-0.5" />}
                      </button>
                    </div>
                    <p className="text-white text-sm font-semibold truncate">{album.name}</p>
                    <Link to={`/artist/${album.artistSlug}`} className="text-zinc-500 text-xs hover:text-white transition-colors truncate block">{album.artist}</Link>
                    <p className="text-zinc-600 text-xs">{album.year} · {album.tracks.length} треков</p>

                    {/* Expanded album tracks */}
                    {isExpanded && (
                      <div className="mt-2 bg-white/3 rounded-xl border border-white/5 overflow-hidden">
                        {album.tracks.sort((a, b) => b.plays - a.plays).map((t, i) => (
                          <TrackCard key={t.id} track={t} queue={album.tracks} showRank={i + 1} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Tracks list */}
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
      </div>
    </div>
  );
}
