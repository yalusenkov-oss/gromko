import { useParams, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useStore, Track } from '../store';
import { Play, Pause, Music, Disc3, ChevronDown, ChevronUp, Clock, Heart, X, Share2 } from 'lucide-react';
import { formatPlays, formatDuration } from '../utils/format';
import TrackCard from '../components/TrackCard';
import { useState, useEffect, useMemo, useRef } from 'react';
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
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { artists, player, playTrack, togglePlay, currentUser, toggleAlbumLike } = useStore();
  const [artistTracks, setArtistTracks] = useState<Track[]>([]);
  const [showAllTracks, setShowAllTracks] = useState(false);

  // Check if we came from context menu "Go to album" — should open album overlay immediately
  const openAlbumFromNavRef = useRef(!!(location.state as any)?.openAlbum);
  const albumParam = searchParams.get('album');
  const passedAlbumData = (location.state as any)?.albumData as Album | undefined;

  const [mobileAlbum, setMobileAlbum] = useState<Album | null>(passedAlbumData ?? null);

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

  const artist = artists.find(a => a.slug === slug);

  // Clear location.state after consuming albumData so back-navigation won't flash it
  useEffect(() => {
    if (passedAlbumData) {
      window.history.replaceState({}, '');
    }
  }, []);

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

  // Auto-open album from URL param (?album=Name)
  const [albumLoading, setAlbumLoading] = useState(!!albumParam && !passedAlbumData);
  useEffect(() => {
    if (albumParam && albums.length > 0 && !mobileAlbum) {
      const found = albums.find(a => a.name === albumParam);
      if (found) {
        setMobileAlbum(found);
        setAlbumLoading(false);
      }
    }
    // If tracks loaded but album not found, stop loading
    if (albumParam && artistTracks.length > 0 && albums.length === 0) {
      setAlbumLoading(false);
    }
  }, [albumParam, albums, artistTracks]);

  if (!artist) return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center pt-16">
      {albumParam ? (
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-red-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-500">Загрузка...</p>
        </div>
      ) : (
        <p className="text-zinc-500">Артист не найден</p>
      )}
    </div>
  );

  const isAnyPlaying = artistTracks.some(t => t.id === player.currentTrack?.id) && player.isPlaying;
  
  // Fallback photo: use most popular track cover if artist has no photo
  const needsPhotoFallback = !artist.photo || artist.photo.includes('default') || artist.photo.includes('placeholder');
  const fallbackPhoto = needsPhotoFallback && artistTracks.length > 0
    ? [...artistTracks].sort((a, b) => b.plays - a.plays)[0]?.cover
    : null;
  const artistPhoto = fallbackPhoto || artist.photo;
  const bannerImage = artist.banner || artistPhoto;

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
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      {/* Loading overlay when navigating directly to album */}
      {albumLoading && (
        <div className="fixed inset-0 z-[60] bg-zinc-950 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-red-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">Загрузка альбома...</p>
          </div>
        </div>
      )}
      {/* Banner */}
      <div className="relative h-72 md:h-96 overflow-hidden">
        {/* Blurred background — light on mobile, stronger on desktop */}
        <div className="absolute inset-0 md:hidden" style={{ backgroundImage: `url(${bannerImage})`, backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'blur(2px)', transform: 'scale(1.02)' }} />
        <div className="absolute inset-0 hidden md:block" style={{ backgroundImage: `url(${bannerImage})`, backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'blur(16px) saturate(1.2)', transform: 'scale(1.08)' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 max-w-5xl mx-auto flex items-end gap-6">
          <img src={artistPhoto} alt={artist.name}
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
            {isAnyPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
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

            {/* Album grid — tap opens fullscreen overlay */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {albums.map(album => {
                const isAlbumPlaying = album.tracks.some(t => t.id === player.currentTrack?.id) && player.isPlaying;
                return (
                  <button
                    key={album.name}
                    onClick={() => setMobileAlbum(album)}
                    className="text-left group"
                  >
                    <div className="relative aspect-square rounded-xl overflow-hidden mb-2">
                      <img src={album.cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      {isAlbumPlaying && (
                        <div className="absolute bottom-2 right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                          <Pause size={14} fill="white" className="text-white" />
                        </div>
                      )}
                      {!isAlbumPlaying && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlayAlbum(album); }}
                          className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Play size={16} fill="white" className="text-white" />
                        </button>
                      )}
                    </div>
                    <h3 className="text-white font-semibold text-sm truncate">{album.name}</h3>
                    <p className="text-zinc-500 text-xs">{artist.name}</p>
                    <p className="text-zinc-600 text-xs">{album.year} · {album.tracks.length} треков · {formatPlays(album.totalPlays)}</p>
                  </button>
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

      {/* Fullscreen album overlay */}
      {mobileAlbum && (
        <div className="fixed inset-0 z-[60] bg-zinc-950 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          {/* Blurred background from album cover */}
          <div className="fixed inset-0 opacity-30" style={{ backgroundImage: `url(${mobileAlbum.cover})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) saturate(1.5)' }} />
          <div className="fixed inset-0 bg-gradient-to-b from-transparent via-zinc-950/80 to-zinc-950" />

          <div className="relative z-10 flex flex-col items-center pt-12 px-4 max-w-2xl mx-auto" style={{ paddingBottom: player.currentTrack ? '140px' : '80px' }}>
            {/* Close button — go back if navigated from context menu, else just close overlay */}
            <button
              onClick={() => {
                if (openAlbumFromNavRef.current) {
                  navigate(-1);
                } else {
                  setMobileAlbum(null);
                }
              }}
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
              <img src={artistPhoto} alt={artist.name} className="w-6 h-6 rounded-full object-cover" />
              <span className="text-zinc-400 text-sm">{artist.name}</span>
              <span className="text-zinc-600 text-sm">·</span>
              <span className="text-zinc-400 text-sm">{mobileAlbum.year}</span>
            </div>

            {/* Action buttons: more, play, heart */}
            <div className="flex items-center gap-5 mt-5">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/artist/${artist?.slug}?album=${encodeURIComponent(mobileAlbum.name)}`;
                  try {
                    if (navigator.share) navigator.share({ title: `${mobileAlbum.name} — ${artist?.name}`, url }).catch(() => {});
                    else navigator.clipboard.writeText(url).catch(() => {});
                  } catch { navigator.clipboard.writeText(url).catch(() => {}); }
                }}
                className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center"
              >
                <Share2 size={20} className="text-white" />
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
            <p className="text-zinc-600 text-xs mt-4 text-center w-full" style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))' }}>{formatPlays(mobileAlbum.totalPlays)} прослушиваний</p>
          </div>
        </div>
      )}
    </div>
  );
}