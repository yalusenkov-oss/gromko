import { useStore } from '../store';
import { Link } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import TrackCard from '../components/TrackCard';
import { Heart, Play, Shuffle, Share2, Check, Music, Disc3, Mic2 } from 'lucide-react';
import { formatPlays } from '../utils/format';

type TabKey = 'tracks' | 'albums' | 'artists';

function pluralizeTracks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'трек';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'трека';
  return 'треков';
}

export default function LikedPage() {
  const { currentUser, tracks, artists, playTrack, fetchTracks, toggleAlbumLike, toggleArtistLike } = useStore();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('tracks');

  useEffect(() => {
    fetchTracks({ limit: '9999' });
  }, []);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white pt-16 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Для просмотра любимого необходимо войти</p>
          <Link to="/login" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">Войти</Link>
        </div>
      </div>
    );
  }

  const likedTracks = tracks.filter(t => currentUser.likedTracks.includes(t.id));

  // Build album data for liked album names
  const likedAlbums = useMemo(() => {
    if (!currentUser.likedAlbums.length) return [];
    const albumMap = new Map<string, { name: string; cover: string; artist: string; artistSlug: string; trackCount: number; totalPlays: number }>();
    for (const t of tracks) {
      const albumName = t.meta?.album;
      if (!albumName || !currentUser.likedAlbums.includes(albumName)) continue;
      if (!albumMap.has(albumName)) {
        albumMap.set(albumName, { name: albumName, cover: t.cover, artist: t.artist, artistSlug: t.artistSlug, trackCount: 0, totalPlays: 0 });
      }
      const a = albumMap.get(albumName)!;
      a.trackCount++;
      a.totalPlays += t.plays;
    }
    return [...albumMap.values()];
  }, [tracks, currentUser.likedAlbums]);

  // Get artist objects for liked artist slugs
  const likedArtists = useMemo(() => {
    if (!currentUser.likedArtists.length) return [];
    return artists.filter(a => currentUser.likedArtists.includes(a.slug));
  }, [artists, currentUser.likedArtists]);

  const playAll = (shuffle = false) => {
    if (likedTracks.length === 0) return;
    const queue = shuffle ? [...likedTracks].sort(() => Math.random() - 0.5) : likedTracks;
    playTrack(queue[0], queue);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/liked`;
    const shareData = {
      title: 'GROMKO — Любимое',
      text: `🎵 Моё любимое на GROMKO (${likedTracks.length} ${pluralizeTracks(likedTracks.length)})`,
      url: shareUrl,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tabs: { key: TabKey; label: string; icon: typeof Music; count: number }[] = [
    { key: 'tracks', label: 'Треки', icon: Music, count: likedTracks.length },
    { key: 'albums', label: 'Альбомы', icon: Disc3, count: likedAlbums.length },
    { key: 'artists', label: 'Исполнители', icon: Mic2, count: likedArtists.length },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col items-center md:flex-row md:items-end gap-5 md:gap-6 mb-8">
          <div className="w-40 h-40 md:w-48 md:h-48 rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center shadow-2xl shadow-red-500/20 shrink-0">
            <Heart size={56} className="text-white" fill="currentColor" />
          </div>
          <div className="flex-1 min-w-0 text-center md:text-left">
            <p className="text-sm text-zinc-400 uppercase tracking-widest font-medium mb-1">Коллекция</p>
            <h1 className="text-3xl md:text-5xl font-black mb-2">Любимое</h1>
            <p className="text-zinc-400 text-sm">
              {currentUser.name} · {likedTracks.length} {pluralizeTracks(likedTracks.length)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        {likedTracks.length > 0 && (
          <div className="flex items-center justify-center md:justify-start gap-2 mb-6">
            <button onClick={() => playAll(false)} className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-full text-sm font-medium transition-colors">
              <Play size={16} fill="currentColor" /> Играть
            </button>
            <button onClick={() => playAll(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white rounded-full text-sm font-medium transition-colors">
              <Shuffle size={15} /> Перемешать
            </button>
            <button onClick={handleShare} className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white rounded-full text-sm font-medium transition-colors">
              {copied ? <Check size={15} className="text-green-400" /> : <Share2 size={15} />}
              {copied ? 'Ок' : 'Поделиться'}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center justify-center gap-1 mb-6 border-b border-white/5 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 shrink-0 ${
                  isActive
                    ? 'text-white border-red-500'
                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                }`}
              >
                <Icon size={16} />
                {isActive && tab.label}
                {isActive && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'tracks' && (
          <div className="space-y-1">
            {likedTracks.length === 0 ? (
              <div className="text-center py-20">
                <Heart size={48} className="text-zinc-700 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-zinc-400 mb-2">Здесь пока пусто</h2>
                <p className="text-zinc-600 text-sm mb-6">Нажимайте ❤️ на треках, чтобы добавить их в «Любимое»</p>
                <Link to="/tracks" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">
                  Перейти к трекам
                </Link>
              </div>
            ) : (
              likedTracks.map((t, i) => (
                <TrackCard key={t.id} track={t} queue={likedTracks} showRank={i + 1} />
              ))
            )}
          </div>
        )}

        {activeTab === 'albums' && (
          <div>
            {likedAlbums.length === 0 ? (
              <div className="text-center py-20">
                <Disc3 size={48} className="text-zinc-700 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-zinc-400 mb-2">Нет любимых альбомов</h2>
                <p className="text-zinc-600 text-sm">Лайкните треки из альбомов, и они появятся здесь</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {likedAlbums.map(album => (
                  <div key={album.name} className="group relative block rounded-xl overflow-hidden">
                    <Link to={`/artist/${album.artistSlug}`}>
                      <div className="aspect-square">
                        <img src={album.cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-white text-sm font-semibold truncate">{album.name}</p>
                        <p className="text-zinc-400 text-xs truncate">{album.artist} · {album.trackCount} {pluralizeTracks(album.trackCount)}</p>
                      </div>
                    </Link>
                    <button
                      onClick={() => toggleAlbumLike(album.name)}
                      className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Heart size={16} fill="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'artists' && (
          <div>
            {likedArtists.length === 0 ? (
              <div className="text-center py-20">
                <Mic2 size={48} className="text-zinc-700 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-zinc-400 mb-2">Нет любимых исполнителей</h2>
                <p className="text-zinc-600 text-sm">Лайкните треки, и исполнители появятся здесь</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {likedArtists.map(artist => {
                  const needsFallback = !artist.photo || artist.photo.includes('default') || artist.photo.includes('placeholder');
                  const fallbackPhoto = needsFallback
                    ? tracks.find(t => t.artists?.some(a => a.slug === artist.slug) || t.artistSlug === artist.slug)?.cover
                    : null;
                  return (
                    <div key={artist.id} className="group flex flex-col items-center relative">
                      <Link to={`/artist/${artist.slug}`} className="flex flex-col items-center">
                        <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden mb-3 ring-2 ring-transparent group-hover:ring-red-500 transition-all">
                          <img src={fallbackPhoto || artist.photo} alt={artist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        </div>
                        <p className="text-white text-sm font-medium truncate max-w-full">{artist.name}</p>
                        <p className="text-zinc-500 text-xs">{formatPlays(artist.totalPlays)} прослушиваний</p>
                      </Link>
                      <button
                        onClick={() => toggleArtistLike(artist.slug)}
                        className="mt-2 flex items-center gap-1 px-3 py-1 bg-red-500/15 rounded-full text-red-400 text-xs hover:bg-red-500/25 transition-colors"
                      >
                        <Heart size={12} fill="currentColor" /> Убрать
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
