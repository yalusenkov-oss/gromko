import { useSearchParams, Link } from 'react-router-dom';
import { useStore, GENRES } from '../store';
import { useState, useEffect } from 'react';
import TrackCard from '../components/TrackCard';
import { formatPlays } from '../utils/format';
import { Search } from 'lucide-react';

export default function SearchPage() {
  const [params] = useSearchParams();
  const { tracks, artists } = useStore();
  const [query, setQuery] = useState(params.get('q') || '');
  const [genre, setGenre] = useState('Все');

  useEffect(() => {
    setQuery(params.get('q') || '');
  }, [params]);

  const q = query.toLowerCase().trim();

  const matchedTracks = q
    ? tracks.filter(t =>
        (genre === 'Все' || t.genre === genre) &&
        (t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
      )
    : [];

  const matchedArtists = q
    ? artists.filter(a => a.name.toLowerCase().includes(q))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <h1 className="text-3xl font-black mb-6">Поиск</h1>

        {/* Search bar */}
        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              autoFocus
              type="text"
              placeholder="Введите название трека или артиста..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 text-base"
            />
          </div>
          <select value={genre} onChange={e => setGenre(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white focus:outline-none">
            <option value="Все">Все жанры</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {!q && (
          <p className="text-zinc-600 text-center py-16">Начните вводить запрос для поиска</p>
        )}

        {q && (
          <div className="grid md:grid-cols-3 gap-8">
            {/* Tracks */}
            <div className="md:col-span-2">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4">
                Треки ({matchedTracks.length})
              </h2>
              {matchedTracks.length === 0 ? (
                <p className="text-zinc-700">Ничего не найдено</p>
              ) : (
                <div className="space-y-1">
                  {matchedTracks.map(t => <TrackCard key={t.id} track={t} queue={matchedTracks} />)}
                </div>
              )}
            </div>

            {/* Artists */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4">
                Артисты ({matchedArtists.length})
              </h2>
              <div className="space-y-3">
                {matchedArtists.map(a => (
                  <Link key={a.id} to={`/artist/${a.slug}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                    <img src={a.photo} alt={a.name} className="w-12 h-12 rounded-full object-cover" />
                    <div>
                      <p className="text-white text-sm font-medium">{a.name}</p>
                      <p className="text-zinc-500 text-xs">{a.genre} · {formatPlays(a.totalPlays)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
