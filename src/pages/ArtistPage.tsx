import { useParams } from 'react-router-dom';
import { useStore, Track } from '../store';
import { Play, Pause, Music, Disc3, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { formatPlays } from '../utils/format';
import TrackCard from '../components/TrackCard';
import { useState, useEffect, useMemo } from 'react';
import { apiUrl } from '../lib/api';

interface Album {
  name: string;
  cover: string;
  year: number;
  tracks: Track[];
  totalPlays: number;
}

export default function ArtistPage() {
  const { slug } = useParams();
  const { artists, player, playTrack, togglePlay } = useStore();
  const [artistTracks, setArtistTracks] = useState<Track[]>([]);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null);

  const artist = artists.find(a => a.slug === slug);

  // Fetch tracks directly from API for this artist (includes meta.album)
  useEffect(() => {
    if (!slug) return;
    fetch(apiUrl(`/artists/${slug}`))
      .then(r => r.json())
      .then(data => {
        if (data.tracks) setArtistTracks(data.tracks);
      })
      .catch(() => {});
  }, [slug]);

  // Top 5 popular tracks (sorted by plays)
  const popularTracks = useMemo(() =>
    [...artistTracks].sort((a, b) => b.plays - a.plays).slice(0, 5),
    [artistTracks]
  );

  // Group tracks into albums (by meta.album, falling back to cover-based grouping)
  const { albums, singles } = useMemo(() => {
    const albumMap = new Map<string, Album>();
    const singlesList: Track[] = [];

    for (const track of artistTracks) {
      const albumName = track.meta?.album;

      if (albumName) {
        if (!albumMap.has(albumName)) {
          albumMap.set(albumName, {
            name: albumName,
            cover: track.cover,
            year: track.year,
            tracks: [],
            totalPlays: 0,
          });
        }
        const album = albumMap.get(albumName)!;
        album.tracks.push(track);
        album.totalPlays += track.plays;
      } else {
        // No album — group by cover (same cover = same release)
        const coverKey = track.cover || '';
        const existingAlbum = [...albumMap.values()].find(a => a.cover === coverKey && a.tracks.length > 0 && !a.tracks[0].meta?.album);

        if (existingAlbum && coverKey) {
          existingAlbum.tracks.push(track);
          existingAlbum.totalPlays += track.plays;
        } else {
          singlesList.push(track);
        }
      }
    }

    // Filter albums with more than 1 track, move single-track "albums" to singles
    const realAlbums: Album[] = [];
    for (const album of albumMap.values()) {
      if (album.tracks.length > 1) {
        // Sort tracks within album by plays desc
        album.tracks.sort((a, b) => b.plays - a.plays);
        realAlbums.push(album);
      } else {
        singlesList.push(...album.tracks);
      }
    }

    // Sort albums by total plays
    realAlbums.sort((a, b) => b.totalPlays - a.totalPlays);

    return { albums: realAlbums, singles: singlesList.sort((a, b) => b.plays - a.plays) };
  }, [artistTracks]);

  if (!artist) return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center pt-16">
      <p className="text-zinc-500">Артист не найден</p>
    </div>
  );

  const isAnyPlaying = artistTracks.some(t => t.id === player.currentTrack?.id) && player.isPlaying;

  const handlePlayAll = () => {
    if (isAnyPlaying) togglePlay();
    else if (artistTracks[0]) playTrack(artistTracks[0], artistTracks);
  };

  const handlePlayAlbum = (album: Album) => {
    const firstTrack = album.tracks[0];
    if (firstTrack) playTrack(firstTrack, album.tracks);
  };

  const displayedTracks = showAllTracks ? [...artistTracks].sort((a, b) => b.plays - a.plays) : popularTracks;

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-24">
      {/* Banner */}
      <div className="relative h-72 md:h-96 overflow-hidden"
        style={{ backgroundImage: `url(${artist.photo})`, backgroundSize: 'cover', backgroundPosition: 'center top' }}>
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 max-w-5xl mx-auto flex items-end gap-6">
          <img src={artist.photo} alt={artist.name}
            className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-4 border-zinc-950 shadow-xl" />
          <div>
            <p className="text-zinc-400 text-sm mb-1">{artist.genre}</p>
            <h1 className="text-3xl md:text-5xl font-black">{artist.name}</h1>
            <p className="text-zinc-400 text-sm mt-1">{formatPlays(artist.totalPlays)} прослушиваний · {artist.tracksCount} треков</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-10">
        {/* Bio */}
        {artist.bio && (
          <p className="text-zinc-400 max-w-2xl">{artist.bio}</p>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button onClick={handlePlayAll}
            className="flex items-center gap-2.5 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-full font-semibold text-sm transition-all shadow-lg shadow-red-500/30">
            {isAnyPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" className="ml-0.5" />}
            {isAnyPlaying ? 'Пауза' : 'Слушать всё'}
          </button>
        </div>

        {/* Popular Tracks */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Music size={18} className="text-red-400" />
              <h2 className="text-lg font-bold">{showAllTracks ? `Все треки (${artistTracks.length})` : 'Популярные треки'}</h2>
            </div>
          </div>
          {artistTracks.length === 0 ? (
            <p className="text-zinc-600">У артиста пока нет треков</p>
          ) : (
            <>
              <div className="space-y-1">
                {displayedTracks.map((t, i) => <TrackCard key={t.id} track={t} queue={showAllTracks ? artistTracks : popularTracks} showRank={i + 1} />)}
              </div>
              {artistTracks.length > 5 && (
                <button
                  onClick={() => setShowAllTracks(!showAllTracks)}
                  className="mt-3 flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm font-medium transition-colors mx-auto"
                >
                  {showAllTracks ? (
                    <><ChevronUp size={16} /> Показать меньше</>
                  ) : (
                    <><ChevronDown size={16} /> Показать все ({artistTracks.length})</>
                  )}
                </button>
              )}
            </>
          )}
        </section>

        {/* Albums */}
        {albums.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Disc3 size={18} className="text-red-400" />
              <h2 className="text-lg font-bold">Альбомы ({albums.length})</h2>
            </div>
            <div className="space-y-4">
              {albums.map(album => {
                const isExpanded = expandedAlbum === album.name;
                const isAlbumPlaying = album.tracks.some(t => t.id === player.currentTrack?.id) && player.isPlaying;

                return (
                  <div key={album.name} className="bg-white/3 rounded-2xl overflow-hidden border border-white/5">
                    {/* Album header — desktop */}
                    <div className="hidden md:flex items-center gap-4 p-4">
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 group cursor-pointer"
                        onClick={() => handlePlayAlbum(album)}>
                        <img src={album.cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {isAlbumPlaying ? <Pause size={24} fill="white" className="text-white" /> : <Play size={24} fill="white" className="text-white ml-1" />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-lg truncate">{album.name}</h3>
                        <p className="text-zinc-500 text-sm">{album.year} · {album.tracks.length} {album.tracks.length === 1 ? 'трек' : album.tracks.length >= 2 && album.tracks.length <= 4 ? 'трека' : 'треков'}</p>
                        <p className="text-zinc-600 text-xs mt-0.5">{formatPlays(album.totalPlays)} прослушиваний</p>
                      </div>
                      <button
                        onClick={() => setExpandedAlbum(isExpanded ? null : album.name)}
                        className="text-zinc-400 hover:text-white transition-colors p-2"
                      >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </div>

                    {/* Album header — mobile (YM style) */}
                    <div className="md:hidden">
                      <button
                        onClick={() => setExpandedAlbum(isExpanded ? null : album.name)}
                        className="flex items-center gap-3 p-3 w-full text-left"
                      >
                        <img src={album.cover} alt={album.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-bold text-sm truncate">{album.name}</h3>
                          <p className="text-zinc-500 text-xs">{album.year} · {album.tracks.length} {album.tracks.length === 1 ? 'трек' : album.tracks.length >= 2 && album.tracks.length <= 4 ? 'трека' : 'треков'}</p>
                        </div>
                        {isExpanded ? <ChevronUp size={18} className="text-zinc-500 shrink-0" /> : <ChevronDown size={18} className="text-zinc-500 shrink-0" />}
                      </button>

                      {/* Expanded: centered cover + track list */}
                      {isExpanded && (
                        <div className="pb-4">
                          {/* Big centered cover */}
                          <div className="flex justify-center px-6 pt-2 pb-4">
                            <img src={album.cover} alt={album.name} className="w-52 h-52 rounded-2xl object-cover shadow-2xl" />
                          </div>
                          {/* Album info */}
                          <div className="text-center px-4 mb-4">
                            <h3 className="text-white font-bold text-lg">{album.name}</h3>
                            <p className="text-zinc-400 text-sm mt-0.5">{artist.name} · {album.year}</p>
                            <p className="text-zinc-600 text-xs mt-1">{formatPlays(album.totalPlays)} прослушиваний</p>
                          </div>
                          {/* Play album button */}
                          <div className="flex justify-center mb-4">
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePlayAlbum(album); }}
                              className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-400 rounded-full text-sm font-semibold transition-colors shadow-lg shadow-red-500/25"
                            >
                              {isAlbumPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
                              {isAlbumPlaying ? 'Пауза' : 'Слушать'}
                            </button>
                          </div>
                          {/* Track list — numbered, clean */}
                          <div className="px-3 space-y-0.5">
                            {album.tracks.map((t, i) => {
                              const isCurrent = player.currentTrack?.id === t.id;
                              const isPlaying = isCurrent && player.isPlaying;
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => playTrack(t, album.tracks)}
                                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${isCurrent ? 'bg-white/5' : 'active:bg-white/5'}`}
                                >
                                  <span className={`w-6 text-center text-sm tabular-nums ${isCurrent ? 'text-red-400 font-bold' : 'text-zinc-600'}`}>
                                    {isPlaying ? '▸' : i + 1}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm truncate ${isCurrent ? 'text-red-400 font-medium' : 'text-white'}`}>{t.title}</p>
                                  </div>
                                  <span className="text-zinc-600 text-xs tabular-nums">{t.duration ? `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, '0')}` : ''}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Album tracks (expanded) — desktop */}
                    {isExpanded && (
                      <div className="hidden md:block border-t border-white/5 px-2 pb-2">
                        {album.tracks.map((t, i) => (
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

        {/* Singles */}
        {singles.length > 0 && albums.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-red-400" />
              <h2 className="text-lg font-bold">Синглы ({singles.length})</h2>
            </div>
            <div className="space-y-1">
              {singles.map((t, i) => <TrackCard key={t.id} track={t} queue={singles} showRank={i + 1} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
