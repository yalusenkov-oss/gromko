import { useState } from 'react';
import { useStore, GENRES } from '../store';
import TrackCard from '../components/TrackCard';
import { Search } from 'lucide-react';

type Sort = 'new' | 'popular' | 'alpha';

export default function TracksPage() {
  const { tracks } = useStore();
  const [sort, setSort] = useState<Sort>('popular');
  const [genre, setGenre] = useState('Все');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const filtered = tracks
    .filter(t => genre === 'Все' || t.genre === genre)
    .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.artist.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'popular') return b.plays - a.plays;
      if (sort === 'new') return b.year - a.year;
      return a.title.localeCompare(b.title);
    });

  const paged = filtered.slice(0, page * PER_PAGE);

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
