import { Link } from 'react-router-dom';
import { useStore, GENRES } from '../store';
import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

const GENRE_COLORS: Record<string, string> = {
  'Хип-хоп': 'from-yellow-500 to-orange-600',
  'Рэп': 'from-red-500 to-rose-700',
  'Trap': 'from-purple-500 to-indigo-700',
  'R&B': 'from-pink-500 to-rose-600',
  'Drill': 'from-zinc-600 to-zinc-900',
  'Phonk': 'from-red-700 to-black',
  'Pop': 'from-blue-400 to-cyan-600',
  'Rock': 'from-zinc-700 to-zinc-950',
  'Electronic': 'from-cyan-500 to-blue-700',
};

interface GenreInfo { genre: string; count: number; totalPlays: number }

export default function GenresPage() {
  const { tracks } = useStore();
  const [genreCounts, setGenreCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(apiUrl('/genres'))
      .then(r => r.json())
      .then((data: GenreInfo[]) => {
        const map: Record<string, number> = {};
        data.forEach(g => { map[g.genre] = Number(g.count); });
        setGenreCounts(map);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-24">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <h1 className="text-3xl font-black mb-2">Жанры</h1>
        <p className="text-zinc-500 mb-8">Выберите жанр, чтобы увидеть все треки</p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {GENRES.map(genre => {
            const count = genreCounts[genre] || 0;
            const cover = tracks.find(t => t.genre === genre)?.cover;
            return (
              <Link key={genre} to={`/tracks?genre=${encodeURIComponent(genre)}`} className="group relative aspect-square rounded-2xl overflow-hidden">
                {cover && <img src={cover} alt={genre} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                <div className={`absolute inset-0 bg-gradient-to-br ${GENRE_COLORS[genre] || 'from-zinc-700 to-zinc-900'} opacity-80 group-hover:opacity-70 transition-opacity`} />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <h2 className="text-white font-black text-xl drop-shadow">{genre}</h2>
                  <p className="text-white/70 text-sm mt-1">{count} треков</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
