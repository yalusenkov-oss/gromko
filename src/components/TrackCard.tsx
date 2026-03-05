import { Track } from '../store';
import { useStore } from '../store';
import { Play, Pause, Heart, Info, Disc3, Mic2, X, ListPlus, Share2 } from 'lucide-react';
import { formatDuration, formatPlays } from '../utils/format';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useCallback } from 'react';

interface Props {
  track: Track;
  queue?: Track[];
  showRank?: number;
}

export default function TrackCard({ track, queue, showRank }: Props) {
  const { player, playTrack, togglePlay, toggleLike, currentUser, queueNext } = useStore();
  const navigate = useNavigate();
  const isPlaying = player.currentTrack?.id === track.id && player.isPlaying;
  const isActive = player.currentTrack?.id === track.id;
  const isLiked = currentUser?.likedTracks.includes(track.id) ?? false;
  const [showMenu, setShowMenu] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePlay = () => {
    if (didLongPress.current) return;
    if (isActive) togglePlay();
    else playTrack(track, queue);
  };

  const startLongPress = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      if ('vibrate' in navigator) navigator.vibrate(30);
      setShowMenu(true);
    }, 500);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const artists = track.artists && track.artists.length > 0
    ? track.artists
    : [{ name: track.artist, slug: track.artistSlug }];

  return (
    <>
      <div
        className={`group flex items-center gap-3 px-3 py-2.5 md:py-3 rounded-xl transition-all cursor-pointer select-none ${isActive ? 'bg-white/8' : 'hover:bg-white/5'}`}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}
      >
        {showRank && (
          <span className="text-zinc-600 text-sm w-5 text-center shrink-0">{showRank}</span>
        )}
        <div className="relative w-12 h-12 md:w-[52px] md:h-[52px] rounded-lg overflow-hidden flex-shrink-0" onClick={handlePlay}>
          <img src={track.cover} alt={track.title} className="w-full h-full object-cover" draggable={false} />
          <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            {isPlaying ? <Pause size={18} fill="white" className="text-white" /> : <Play size={18} fill="white" className="text-white" />}
          </div>
          {isActive && !isPlaying && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <div className="flex gap-0.5 items-end h-4">
                {[1,2,3].map(i => (
                  <div key={i} className="w-1 bg-red-500 rounded-full animate-pulse" style={{ height: `${40 + i * 20}%`, animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0" onClick={handlePlay}>
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium truncate ${isActive ? 'text-red-400' : 'text-white'}`}>{track.title}</p>
            {track.explicit && <span className="text-[10px] bg-zinc-700 text-zinc-400 px-1 rounded shrink-0">E</span>}
            {track.isNew && <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded shrink-0">NEW</span>}
          </div>
          <span className="text-zinc-400 text-xs" onClick={e => e.stopPropagation()}>
            {track.artists && track.artists.length > 0
              ? track.artists.map((a, i) => (
                  <span key={a.slug}>
                    {i > 0 && <span className="text-zinc-500">, </span>}
                    <Link to={`/artist/${a.slug}`} className="hover:text-white transition-colors">{a.name}</Link>
                  </span>
                ))
              : <Link to={`/artist/${track.artistSlug}`} className="hover:text-white transition-colors">{track.artist}</Link>
            }
          </span>
        </div>

        <div className="hidden md:flex items-center gap-4 shrink-0">
          <span className="text-zinc-600 text-xs">{track.genre}</span>
          <span className="text-zinc-600 text-xs">{formatPlays(track.plays)}</span>
          <span className="text-zinc-600 text-xs">{formatDuration(track.duration)}</span>
        </div>

        <button
          onClick={e => { e.stopPropagation(); toggleLike(track.id); }}
          className={`transition-colors ${isLiked ? 'text-red-500' : 'text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100'}`}
        >
          <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Context menu overlay */}
      {showMenu && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={() => setShowMenu(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg bg-zinc-900 rounded-t-2xl p-4 pb-8 animate-slide-up"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'slideUp 0.25s ease-out' }}
          >
            {/* Track info header */}
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
              <img src={track.cover} alt={track.title} className="w-14 h-14 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{track.title}</p>
                <p className="text-zinc-400 text-xs truncate">{track.artist}</p>
              </div>
              <button onClick={() => setShowMenu(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <X size={16} className="text-zinc-400" />
              </button>
            </div>

            {/* Menu items */}
            <div className="space-y-1">
              {/* Like */}
              <button
                onClick={() => { toggleLike(track.id); setShowMenu(false); }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                <Heart size={18} className={isLiked ? 'text-red-500' : 'text-zinc-400'} fill={isLiked ? 'currentColor' : 'none'} />
                <span className="text-white text-sm">{isLiked ? 'Убрать из любимого' : 'Нравится'}</span>
              </button>

              {/* Play next */}
              <button
                onClick={() => { queueNext(track); setShowMenu(false); }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                <ListPlus size={18} className="text-zinc-400" />
                <span className="text-white text-sm">Играть следующим</span>
              </button>

              {/* Go to album */}
              {track.meta?.album && (
                <button
                  onClick={() => { setShowMenu(false); navigate(`/artist/${track.artistSlug}?album=${encodeURIComponent(track.meta!.album!)}`, { state: { openAlbum: true }, replace: false }); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <Disc3 size={18} className="text-zinc-400" />
                  <span className="text-white text-sm">Перейти к альбому</span>
                </button>
              )}

              {/* Go to artist(s) */}
              {artists.length === 1 ? (
                <button
                  onClick={() => { setShowMenu(false); navigate(`/artist/${artists[0].slug}`); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <Mic2 size={18} className="text-zinc-400" />
                  <span className="text-white text-sm">Перейти к {artists[0].name}</span>
                </button>
              ) : (
                artists.map(a => (
                  <button
                    key={a.slug}
                    onClick={() => { setShowMenu(false); navigate(`/artist/${a.slug}`); }}
                    className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <Mic2 size={18} className="text-zinc-400" />
                    <span className="text-white text-sm">Перейти к {a.name}</span>
                  </button>
                ))
              )}

              {/* Share */}
              <button
                onClick={() => {
                  const url = `${window.location.origin}/track/${track.id}`;
                  if (navigator.share) {
                    navigator.share({ title: `${track.title} — ${track.artist}`, text: `Послушай "${track.title}" на GROMQ 🎵`, url });
                  } else {
                    navigator.clipboard.writeText(url);
                  }
                  setShowMenu(false);
                }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                <Share2 size={18} className="text-zinc-400" />
                <span className="text-white text-sm">Поделиться</span>
              </button>

              {/* Track details */}
              <button
                onClick={() => { setShowMenu(false); navigate(`/track/${track.id}`); }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                <Info size={18} className="text-zinc-400" />
                <span className="text-white text-sm">Подробнее</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
