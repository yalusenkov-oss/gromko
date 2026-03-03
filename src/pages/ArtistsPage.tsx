import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, GENRES } from '../store';
import { formatPlays } from '../utils/format';
import { Search } from 'lucide-react';

export default function ArtistsPage() {
  const { artists } = useStore();
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('Все');

  const filtered = artists
    .filter(a => genre === 'Все' || a.genre === genre)
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-24">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <h1 className="text-3xl font-black mb-6">Артисты</h1>

        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder="Поиск артистов..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50" />
          </div>
          <select value={genre} onChange={e => setGenre(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none">
            <option value="Все">Все жанры</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {filtered.map(artist => (
            <Link key={artist.id} to={`/artist/${artist.slug}`} className="group text-center">
              <div className="aspect-square rounded-full overflow-hidden mb-3 ring-2 ring-transparent group-hover:ring-red-500 transition-all">
                <img src={artist.photo} alt={artist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
              <p className="text-white text-sm font-semibold truncate">{artist.name}</p>
              <p className="text-zinc-500 text-xs">{artist.genre}</p>
              <p className="text-zinc-600 text-xs">{formatPlays(artist.totalPlays)}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
