import { useParams, Link } from 'react-router-dom';
import { useStore, Track } from '../store';
import { Play, Pause, Heart, Share2, Maximize2, Minimize2, Sparkles, ListMusic, Check, Plus } from 'lucide-react';
import { formatDuration, formatPlays } from '../utils/format';
import { shareUrl } from '../utils/share';
import TrackCard from '../components/TrackCard';
import { useState, useEffect, useRef } from 'react';
import { apiUrl } from '../lib/api';
import { trackEvent } from '../utils/trackEvent';

export default function TrackPage() {
  const { id } = useParams();
  const { tracks, player, playTrack, togglePlay, toggleLike, currentUser, playlists, addTrackToPlaylist, addPlaylist, fetchMyPlaylists } = useStore();
  const [isFullViz, setIsFullViz] = useState(false);
  const [fetchedTrack, setFetchedTrack] = useState<Track | null>(null);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [quickName, setQuickName] = useState('');
  const playlistMenuRef = useRef<HTMLDivElement>(null);

  // If track is not in store (direct URL visit), fetch it from API
  useEffect(() => {
    const found = tracks.find(t => t.id === id);
    if (!found && id) {
      fetch(apiUrl(`/tracks/${id}`))
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setFetchedTrack(data); })
        .catch(() => {});
    }
    // Record open_track event for recommendation engine
    if (id) trackEvent('open_track', { trackId: id });
  }, [id, tracks]);

  const track = tracks.find(t => t.id === id) || fetchedTrack;

  // Similar tracks from recommendation engine
  const [similarTracks, setSimilarTracks] = useState<Track[]>([]);
  useEffect(() => {
    if (!id) return;
    fetch(apiUrl(`/recommendations/similar/${id}?limit=6`))
      .then(r => r.ok ? r.json() : [])
      .then(d => Array.isArray(d) ? setSimilarTracks(d) : setSimilarTracks([]))
      .catch(() => {});
  }, [id]);

  // Other tracks by the same artist(s)
  const artistTracks = tracks.filter(t => {
    if (t.id === id) return false;
    if (!track) return false;
    // Check if any artist overlaps
    if (track.artists && track.artists.length > 0) {
      return track.artists.some(a =>
        t.artists?.some(ta => ta.slug === a.slug) || t.artistSlug === a.slug
      );
    }
    return t.artistSlug === track.artistSlug;
  }).slice(0, 6);

  // Fetch playlists for "add to playlist" dropdown
  useEffect(() => {
    if (currentUser) fetchMyPlaylists();
  }, [currentUser, fetchMyPlaylists]);

  // Close playlist dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setShowPlaylistMenu(false);
      }
    }
    if (showPlaylistMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPlaylistMenu]);

  const handleAddToPlaylist = async (plId: string) => {
    if (!track) return;
    await addTrackToPlaylist(plId, track.id);
    setShowPlaylistMenu(false);
  };

  const handleQuickCreate = async () => {
    if (!quickName.trim() || !track) return;
    const pl = await addPlaylist(quickName.trim(), [track.id]);
    if (pl) {
      setQuickName('');
      setShowPlaylistMenu(false);
    }
  };

  if (!track) return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center pt-16">
      <p className="text-zinc-500">Трек не найден</p>
    </div>
  );

  const isActive = player.currentTrack?.id === track.id;
  const isPlaying = isActive && player.isPlaying;
  const isLiked = currentUser?.likedTracks.includes(track.id) ?? false;

  const handlePlay = () => {
    if (isActive) togglePlay();
    else playTrack(track, tracks);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      {/* Full viz mode — only when this track is actually playing */}
      {isFullViz && (
        <div className="fixed inset-0 z-[45] bg-black flex flex-col items-center justify-center gap-8 p-8"
          style={{
            backgroundImage: `url(${track.cover})`, backgroundSize: 'cover', backgroundPosition: 'center',
            paddingBottom: player.currentTrack ? 'calc(120px + env(safe-area-inset-bottom, 0px))' : 'calc(60px + env(safe-area-inset-bottom, 0px))',
          }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" />
          <button onClick={() => setIsFullViz(false)} className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white/70 hover:text-white transition-colors backdrop-blur-sm">
            <Minimize2 size={20} />
          </button>
          <div className="relative z-10 w-full max-w-2xl flex flex-col items-center gap-6">
            <img src={track.cover} alt={track.title} className="w-64 h-64 rounded-2xl shadow-2xl object-cover" />
            <div className="text-center">
              <h2 className="text-3xl font-black">{track.title}</h2>
              <p className="text-zinc-400 text-lg mt-1">{track.artist}</p>
            </div>
            {isActive && (
              <WaveformViz progress={player.progress} />
            )}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {/* Track hero */}
        <div className="flex flex-col md:flex-row gap-8 mb-12 items-center md:items-start">
          <div className="relative group shrink-0 cursor-pointer" onClick={() => setIsFullViz(true)}>
            <div className="w-56 h-56 md:w-72 md:h-72 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
              <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Maximize2 size={28} className="text-white" />
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-end gap-4 w-full md:w-auto">
            <div className="text-center md:text-left">
              <div className="flex items-center gap-2 mb-2 justify-center md:justify-start">
                {track.explicit && <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">EXPLICIT</span>}
              </div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">{track.title}</h1>
              <div className="text-zinc-300 text-xl">
                {track.artists && track.artists.length > 0
                  ? track.artists.map((a, i) => (
                      <span key={a.slug}>
                        {i > 0 && <span className="text-zinc-500">, </span>}
                        <Link to={`/artist/${a.slug}`} className="hover:text-white transition-colors">{a.name}</Link>
                      </span>
                    ))
                  : <Link to={`/artist/${track.artistSlug}`} className="hover:text-white transition-colors">{track.artist}</Link>
                }
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-zinc-500 text-sm justify-center md:justify-start">
                <span>{track.year}</span>
                <span>{formatDuration(track.duration)}</span>
                <span>{formatPlays(track.plays)} прослушиваний</span>
                <span>{track.likes.toLocaleString()} лайков</span>
              </div>
            </div>

            <div className="flex items-center justify-center md:justify-start gap-2.5">
              <button onClick={() => toggleLike(track.id)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isLiked ? 'bg-red-500/20 text-red-500' : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white'}`}>
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
              <button onClick={handlePlay}
                className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-full font-semibold text-sm transition-all shadow-lg shadow-red-500/30">
                {isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" />}
                {isPlaying ? 'Пауза' : 'Слушать'}
              </button>
              <button
                onClick={() => {
                  shareUrl({
                    title: `${track.title} — ${track.artist}`,
                    text: `Послушай "${track.title}" на GROMKO 🎵`,
                    url: `${window.location.origin}/track/${track.id}`,
                  });
                }}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all">
                <Share2 size={18} />
              </button>
              {/* Add to Playlist */}
              {currentUser && (
                <div className="relative" ref={playlistMenuRef}>
                  <button
                    onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
                    className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                    title="Добавить в плейлист"
                  >
                    <ListMusic size={18} />
                  </button>
                  {showPlaylistMenu && (
                    <div className="absolute right-0 top-12 w-64 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
                      <div className="px-3 py-2 border-b border-white/5">
                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Добавить в плейлист</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {playlists.length > 0 ? playlists.map(pl => {
                          const already = pl.trackIds.includes(track.id);
                          return (
                            <button
                              key={pl.id}
                              onClick={() => !already && handleAddToPlaylist(pl.id)}
                              disabled={already}
                              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${already ? 'text-zinc-600' : 'text-white hover:bg-white/5'}`}
                            >
                              {already ? <Check size={14} className="text-green-400" /> : <Plus size={14} className="text-zinc-500" />}
                              <span className="truncate flex-1">{pl.title}</span>
                              {already && <span className="text-[10px] text-zinc-600">уже добавлен</span>}
                            </button>
                          );
                        }) : (
                          <p className="px-3 py-3 text-zinc-600 text-xs text-center">Нет плейлистов</p>
                        )}
                      </div>
                      <div className="border-t border-white/5 px-3 py-2">
                        <div className="flex gap-2">
                          <input
                            value={quickName}
                            onChange={e => setQuickName(e.target.value)}
                            placeholder="Новый плейлист..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/50"
                            onKeyDown={e => { if (e.key === 'Enter') handleQuickCreate(); }}
                          />
                          <button
                            onClick={handleQuickCreate}
                            disabled={!quickName.trim()}
                            className="px-2 py-1 bg-red-500 hover:bg-red-400 disabled:bg-zinc-700 text-white text-xs rounded-lg transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Track metadata details */}
        {(track.genre || track.meta?.album || track.meta?.label || track.meta?.releaseDate) && (
          <div className="mb-12">
            <h3 className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Информация</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {track.genre && track.genre !== 'Другое' && (
                <div className="bg-white/5 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Жанр</div>
                  <div className="text-sm text-white font-medium">{track.genre}</div>
                </div>
              )}
              {track.meta?.album && (
                <div className="bg-white/5 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Альбом</div>
                  <div className="text-sm text-white font-medium truncate">{track.meta.album}</div>
                </div>
              )}
              {track.meta?.releaseDate && (
                <div className="bg-white/5 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Дата релиза</div>
                  <div className="text-sm text-white font-medium">{new Date(track.meta.releaseDate).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
              )}
              {track.meta?.label && (
                <div className="bg-white/5 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Лейбл</div>
                  <div className="text-sm text-white font-medium truncate">{track.meta.label}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Waveform */}
        <div className="mb-12">
          <h3 className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Визуализация</h3>
          <WaveformViz progress={isActive ? player.progress : 0} big />
        </div>

        {/* Similar tracks */}
        {artistTracks.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-4">Другие треки исполнителя</h2>
            <div className="space-y-1">
              {artistTracks.map(t => <TrackCard key={t.id} track={t} queue={artistTracks} />)}
            </div>
          </section>
        )}

        {/* Recommended similar tracks */}
        {similarTracks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={18} className="text-purple-400" />
              <h2 className="text-lg font-bold">Похожие треки</h2>
            </div>
            <div className="space-y-1">
              {similarTracks.map(t => <TrackCard key={t.id} track={t} queue={similarTracks} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function WaveformViz({ progress, big }: { progress: number; big?: boolean }) {
  const bars = big ? 120 : 80;
  return (
    <div className={`w-full ${big ? 'h-24' : 'h-16'} relative rounded-xl overflow-hidden bg-white/5`}>
      <div className="absolute inset-0 flex items-center gap-[2px] px-3">
        {Array.from({ length: bars }).map((_, i) => {
          const h = 20 + Math.sin(i * 0.3) * 20 + Math.sin(i * 0.9) * 12 + ((i * 7) % 17) * 2;
          const active = i / bars <= progress;
          return (
            <div key={i} className={`flex-1 rounded-full transition-colors ${active ? 'bg-red-500' : 'bg-white/20'}`}
              style={{ height: `${Math.min(90, h)}%` }} />
          );
        })}
      </div>
    </div>
  );
}
