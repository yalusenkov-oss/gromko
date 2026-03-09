import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Search, Users } from 'lucide-react';
import { formatPlays } from '../utils/format';

export default function ArtistsPage() {
  const { artists, tracks, currentUser } = useStore();
  const [search, setSearch] = useState('');

  // Build a fallback photo map: artist slug -> cover of their most popular track
  const artistPhotoMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artists) {
      const needsFallback = !a.photo || a.photo.includes('default') || a.photo.includes('placeholder');
      if (needsFallback) {
        const best = [...tracks]
          .filter(t => t.artists?.some(ar => ar.slug === a.slug) || t.artistSlug === a.slug)
          .sort((x, y) => y.plays - x.plays)[0];
        if (best) map.set(a.slug, best.cover);
      }
    }
    return map;
  }, [artists, tracks]);

  // Liked artist slugs from user preferences
  const likedSlugs = useMemo(() => new Set(currentUser?.likedArtists || []), [currentUser]);

  // Genre map from liked artists for "similar" boost
  const likedGenres = useMemo(() => {
    const genres = new Map<string, number>();
    for (const a of artists) {
      if (likedSlugs.has(a.slug) && a.genre) {
        genres.set(a.genre, (genres.get(a.genre) || 0) + 1);
      }
    }
    return genres;
  }, [artists, likedSlugs]);

  const sorted = useMemo(() => {
    let list = [...artists];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q));
    }
    // Score: liked=1000, similar genre=500, then by totalPlays
    list.sort((a, b) => {
      const aLiked = likedSlugs.has(a.slug) ? 1000 : 0;
      const bLiked = likedSlugs.has(b.slug) ? 1000 : 0;
      const aSimilar = (!likedSlugs.has(a.slug) && likedGenres.has(a.genre)) ? 500 * (likedGenres.get(a.genre) || 1) : 0;
      const bSimilar = (!likedSlugs.has(b.slug) && likedGenres.has(b.genre)) ? 500 * (likedGenres.get(b.genre) || 1) : 0;
      const aScore = aLiked + aSimilar + a.totalPlays;
      const bScore = bLiked + bSimilar + b.totalPlays;
      return bScore - aScore;
    });
    return list;
  }, [artists, search, likedSlugs, likedGenres]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <h1 className="text-3xl font-black mb-6">Артисты</h1>

        <div className="mb-8">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder="Поиск артистов..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {sorted.map(artist => {
            const photo = artistPhotoMap.get(artist.slug) || artist.photo;
            const isLiked = likedSlugs.has(artist.slug);
            return (
              <Link key={artist.id} to={`/artist/${artist.slug}`} className="group text-center">
                <div className={`aspect-square rounded-full overflow-hidden mb-3 ring-2 transition-all ${isLiked ? 'ring-red-500' : 'ring-transparent group-hover:ring-red-500'}`}>
                  {photo ? (
                    <img src={photo} alt={artist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                      <Users size={32} className="text-zinc-600" />
                    </div>
                  )}
                </div>
                <p className="text-white text-sm font-semibold truncate">{artist.name}</p>
                <p className="text-zinc-500 text-xs">{formatPlays(artist.totalPlays)} прослушиваний</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
