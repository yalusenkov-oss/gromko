import { useStore } from '../store';
import { useAudioEngine } from '../audio/useAudioEngine';
import { formatDuration } from '../utils/format';
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Heart, Maximize2, ChevronDown, MoreHorizontal,
  Disc3, Mic2, Share2, ListPlus, Info, X as XIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { audioEngine, EngineState } from '../audio/engine';

export default function Player() {
  const {
    player, togglePlay, toggleShuffle, toggleRepeat,
    toggleFullscreen, toggleLike, currentUser
  } = useStore();
  const { seek, setVolume, next, prev } = useAudioEngine();

  const [showVolume, setShowVolume] = useState(false);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  // Animation state for fullscreen
  const [fsVisible, setFsVisible] = useState(false);
  const [fsAnimating, setFsAnimating] = useState(false);
  const prevFullscreen = useRef(player.isFullscreen);
  // Swipe-down to close fullscreen
  const swipeStartY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  // Swipe left/right on mini-player to skip tracks (carousel approach)
  const miniSwipeStartX = useRef<number | null>(null);
  const miniSwipeStartY = useRef<number | null>(null);
  const [miniSwipeX, setMiniSwipeX] = useState(0);
  const miniSwipeLocked = useRef(false);
  const [miniSwipeAnim, setMiniSwipeAnim] = useState<'left' | 'right' | null>(null);
  const miniCarouselRef = useRef<HTMLDivElement>(null);
  const [miniSnapBack, setMiniSnapBack] = useState(false);

  useEffect(() => {
    return audioEngine.subscribe(setEngineState);
  }, []);

  // Lock body scroll when fullscreen is open
  useEffect(() => {
    if (player.isFullscreen || fsVisible) {
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
  }, [player.isFullscreen, fsVisible]);

  // Animate fullscreen open/close
  useEffect(() => {
    if (player.isFullscreen && !prevFullscreen.current) {
      // Opening
      setFsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFsAnimating(true));
      });
    } else if (!player.isFullscreen && prevFullscreen.current) {
      // Closing
      setFsAnimating(false);
      const timer = setTimeout(() => setFsVisible(false), 350);
      prevFullscreen.current = player.isFullscreen;
      return () => clearTimeout(timer);
    }
    prevFullscreen.current = player.isFullscreen;
  }, [player.isFullscreen]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    setIsDragging(true);
    setDragProgress(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    const handleMove = (ev: MouseEvent) => {
      setDragProgress(Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)));
    };
    const handleUp = (ev: MouseEvent) => {
      const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      seek(p);
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [seek]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const touch = e.touches[0];
    setIsDragging(true);
    setDragProgress(Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)));

    const handleTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const t = ev.touches[0];
      setDragProgress(Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)));
    };
    const handleTouchEnd = (ev: TouchEvent) => {
      const t = ev.changedTouches[0];
      const p = Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width));
      seek(p);
      setIsDragging(false);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
  }, [seek]);

  // All hooks above — early return is safe here
  if (!player.currentTrack) return null;

  const t = player.currentTrack;
  const isLiked = currentUser?.likedTracks.includes(t.id) ?? false;
  const duration = engineState?.duration || t.duration;
  const currentTime = isDragging
    ? dragProgress * duration
    : (engineState?.currentTime || Math.floor(t.duration * player.progress));
  const progress = isDragging ? dragProgress : (engineState?.progress ?? player.progress);
  const buffered = engineState?.buffered ?? 0;
  const isBuffering = player.isBuffering;
  const isError = engineState?.state === 'error';

  // Compute prev/next tracks for mini-player carousel
  const queueIdx = player.queue.findIndex(q => q.id === t.id);
  const prevTrackData = queueIdx > 0 ? player.queue[queueIdx - 1] : player.queue[player.queue.length - 1];
  const nextTrackData = queueIdx < player.queue.length - 1 ? player.queue[queueIdx + 1] : player.queue[0];

  // Swipe-down handlers for the fullscreen header area
  const handleSwipeStart = (e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY;
    setSwipeOffset(0);
  };
  const handleSwipeMove = (e: React.TouchEvent) => {
    if (swipeStartY.current === null) return;
    const dy = e.touches[0].clientY - swipeStartY.current;
    if (dy > 0) setSwipeOffset(dy);
  };
  const handleSwipeEnd = () => {
    if (swipeOffset > 120) toggleFullscreen();
    swipeStartY.current = null;
    setSwipeOffset(0);
  };

  const translateY = swipeOffset > 0 ? Math.min(swipeOffset * 0.5, 80) : 0;
  const overlayOpacity = swipeOffset > 0 ? Math.max(0.3, 1 - swipeOffset / 400) : 1;

  return (
    <>
    {/* Fullscreen overlay — always in DOM, animated via opacity/transform */}
    {fsVisible && (
      <div
        className={`fixed inset-0 z-[80] ${fsAnimating ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{
          touchAction: 'none',
          overscrollBehavior: 'contain',
        }}
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
      >
        {/* Solid black base to prevent transparency */}
        <div className="absolute inset-0 bg-zinc-950" style={{
          opacity: fsAnimating ? 1 : 0,
          transition: 'opacity 300ms ease-out',
        }} />
        {/* Blurred cover background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${t.cover})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(40px) saturate(1.5) brightness(0.3)',
            transform: 'scale(1.2)',
            opacity: fsAnimating ? 1 : 0,
            transition: 'opacity 300ms ease-out',
            willChange: 'opacity',
          }}
        />
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/40" style={{
          opacity: fsAnimating ? overlayOpacity : 0,
          transition: swipeOffset > 0 ? 'none' : 'opacity 300ms ease-out',
        }} />
        <div
          className="relative z-10 flex flex-col h-full"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            opacity: fsAnimating ? 1 : 0,
            transform: swipeOffset > 0
              ? `translateY(${translateY}px)`
              : fsAnimating
                ? 'translateY(0)'
                : 'translateY(40px)',
            transition: swipeOffset > 0 ? 'none' : 'opacity 300ms ease-out, transform 300ms ease-out',
            willChange: 'opacity, transform',
          }}
        >
          {/* Swipe indicator pill */}
          <div className="flex justify-center pt-2 pb-0 md:hidden">
            <div className="w-9 h-1 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div className="flex justify-between items-center px-5 pt-1 pb-1 md:px-8 md:pt-6 shrink-0">
            <button onClick={toggleFullscreen} className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white transition-colors -ml-2">
              <ChevronDown size={28} />
            </button>
            <div className="text-center">
              <span className="text-white/40 text-[10px] uppercase tracking-[0.2em]">Сейчас играет</span>
            </div>
            <button onClick={() => setShowMenu(true)} className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white transition-colors -mr-2">
              <MoreHorizontal size={22} />
            </button>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col items-center justify-evenly px-7 md:px-12 min-h-0 overflow-hidden"
               style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>

            {/* Cover */}
            <div className={`w-full max-w-[72vw] md:max-w-sm aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/60 transition-all duration-500 ${player.isPlaying ? 'scale-100' : 'scale-[0.92] opacity-75'}`}>
              <img src={t.cover} alt={t.title} className="w-full h-full object-cover" draggable={false} />
            </div>

            {/* Title + Artist */}
            <div className="text-center w-full max-w-lg mt-3 mb-0">
              <h2 className="text-[22px] md:text-3xl font-bold text-white leading-tight truncate">{t.title}</h2>
              <p className="text-white/50 text-[15px] md:text-lg mt-1 truncate">
                {t.artists && t.artists.length > 0
                  ? t.artists.map(a => a.name).join(', ')
                  : t.artist}
              </p>
            </div>

            {/* Progress waveform */}
            <div className="w-full max-w-lg mt-3">
              <div
                className="relative h-16 rounded-xl overflow-hidden cursor-pointer bg-white/8"
                style={{ touchAction: 'none' }}
                onMouseDown={handleProgressMouseDown}
                onTouchStart={(e) => { e.stopPropagation(); handleProgressTouchStart(e); }}
              >
                <div className="absolute inset-0 flex items-center gap-[2px] px-2.5">
                  {Array.from({ length: 60 }).map((_, i) => {
                    const h = 20 + Math.sin(i * 0.4) * 15 + Math.sin(i * 1.1) * 10 + ((i * 7) % 17) * 2;
                    const isActive = i / 60 <= progress;
                    const isBufferedBar = i / 60 <= buffered;
                    return (<div key={i} className={`flex-1 rounded-full transition-colors duration-150 ${isActive ? 'bg-red-500' : isBufferedBar ? 'bg-white/20' : 'bg-white/8'}`} style={{ height: `${Math.min(90, h)}%` }} />);
                  })}
                </div>
              </div>
              <div className="flex justify-between text-white/40 text-xs mt-1.5 px-0.5">
                <span>{formatDuration(Math.floor(currentTime))}</span>
                {isBuffering && <span className="text-white/30 animate-pulse">Загрузка...</span>}
                {isError && <span className="text-red-400/60">Ошибка воспроизведения</span>}
                <span>{formatDuration(Math.floor(duration))}</span>
              </div>
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-center gap-8 mt-3">
              <button onClick={toggleShuffle} className={`transition-colors ${player.shuffle ? 'text-red-400' : 'text-white/40 hover:text-white'}`}><Shuffle size={20} /></button>
              <button onClick={prev} className="text-white/80 hover:text-white transition-colors active:scale-90"><SkipBack size={28} /></button>
              <button onClick={togglePlay} className="w-16 h-16 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-all shadow-lg shadow-red-500/30 active:scale-95">
                {isBuffering
                  ? <div className="w-7 h-7 border-3 border-white/30 border-t-white rounded-full animate-spin-slow" />
                  : player.isPlaying ? <Pause size={28} fill="white" className="text-white" /> : <Play size={28} fill="white" className="text-white" />
                }
              </button>
              <button onClick={next} className="text-white/80 hover:text-white transition-colors active:scale-90"><SkipForward size={28} /></button>
              <button onClick={toggleRepeat} className={`transition-colors ${player.repeat !== 'none' ? 'text-red-400' : 'text-white/40 hover:text-white'}`}>{player.repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}</button>
            </div>

            {/* Like button */}
            <div className="flex items-center justify-center mt-4">
              <button onClick={() => toggleLike(t.id)} className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all ${isLiked ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-white/40 hover:text-white'}`}>
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
                <span className="text-sm">Нравится</span>
              </button>
            </div>
          </div>{/* end main content */}
        </div>
      </div>
    )}

    {/* 3-dots context menu for player */}
    {showMenu && (
      <div className="fixed inset-0 z-[85] flex items-end justify-center" onClick={() => setShowMenu(false)}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="relative z-10 w-full max-w-lg bg-zinc-900 rounded-t-2xl p-4 pb-8"
          onClick={e => e.stopPropagation()}
          style={{ animation: 'slideUp 0.25s ease-out' }}
        >
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
            <img src={t.cover} alt={t.title} className="w-14 h-14 rounded-lg object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{t.title}</p>
              <p className="text-zinc-400 text-xs truncate">{t.artist}</p>
            </div>
            <button onClick={() => setShowMenu(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <XIcon size={16} className="text-zinc-400" />
            </button>
          </div>
          <div className="space-y-1">
            <button
              onClick={() => { toggleLike(t.id); setShowMenu(false); }}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Heart size={18} className={isLiked ? 'text-red-500' : 'text-zinc-400'} fill={isLiked ? 'currentColor' : 'none'} />
              <span className="text-white text-sm">{isLiked ? 'Убрать из любимого' : 'Нравится'}</span>
            </button>
            <button
              onClick={() => { useStore.getState().queueNext(t); setShowMenu(false); }}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <ListPlus size={18} className="text-zinc-400" />
              <span className="text-white text-sm">Играть следующим</span>
            </button>
            {t.meta?.album && (
              <button
                onClick={() => { setShowMenu(false); toggleFullscreen(); navigate(`/artist/${t.artistSlug}?album=${encodeURIComponent(t.meta!.album!)}`, { state: { openAlbum: true } }); }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                <Disc3 size={18} className="text-zinc-400" />
                <span className="text-white text-sm">Перейти к альбому</span>
              </button>
            )}
            {t.artists && t.artists.length > 0
              ? t.artists.map(a => (
                  <button
                    key={a.slug}
                    onClick={() => { setShowMenu(false); toggleFullscreen(); navigate(`/artist/${a.slug}`); }}
                    className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <Mic2 size={18} className="text-zinc-400" />
                    <span className="text-white text-sm">Перейти к {a.name}</span>
                  </button>
                ))
              : (
                <button
                  onClick={() => { setShowMenu(false); toggleFullscreen(); navigate(`/artist/${t.artistSlug}`); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <Mic2 size={18} className="text-zinc-400" />
                  <span className="text-white text-sm">Перейти к {t.artist}</span>
                </button>
              )
            }
            <button
              onClick={() => {
                const url = `${window.location.origin}/track/${t.id}`;
                try {
                  if (navigator.share) navigator.share({ title: `${t.title} — ${t.artist}`, text: `Послушай "${t.title}" на GROMKO 🎵`, url }).catch(() => {});
                  else navigator.clipboard.writeText(url).catch(() => {});
                } catch { navigator.clipboard.writeText(url).catch(() => {}); }
                setShowMenu(false);
              }}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Share2 size={18} className="text-zinc-400" />
              <span className="text-white text-sm">Поделиться</span>
            </button>
            <button
              onClick={() => { setShowMenu(false); toggleFullscreen(); navigate(`/track/${t.id}`); }}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Info size={18} className="text-zinc-400" />
              <span className="text-white text-sm">Подробнее</span>
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Mobile mini-player — carousel with prev/current/next */}
    <div className="fixed left-0 right-0 z-[65] md:hidden overflow-hidden" style={{ bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="flex flex-col bg-zinc-950 border-t border-white/5">
        {/* Thin red progress bar at top */}
        <div className="h-[2px] bg-zinc-800 w-full">
          <div className="h-full bg-red-500 transition-all duration-200" style={{ width: `${progress * 100}%` }} />
        </div>
        {/* Carousel container */}
        <div
          ref={miniCarouselRef}
          className="flex"
          style={{
            width: '300%',
            transform: miniSwipeAnim
              ? `translateX(${miniSwipeAnim === 'left' ? '-66.666%' : '0%'})`
              : `translateX(calc(-33.333% + ${miniSwipeX}px))`,
            transition: miniSwipeAnim
              ? 'transform 0.22s ease-out'
              : miniSnapBack
                ? 'transform 0.2s ease-out'
                : 'none',
          }}
          onTransitionEnd={() => {
            if (miniSnapBack) {
              setMiniSnapBack(false);
              return;
            }
            if (miniSwipeAnim) {
              const dir = miniSwipeAnim;
              // Reset position instantly (no transition since miniSwipeAnim becomes null)
              // and skip track in the same tick — React 18 batches both into one render
              setMiniSwipeAnim(null);
              if (dir === 'left') next();
              else prev();
            }
          }}
          onTouchStart={(e) => {
            miniSwipeStartX.current = e.touches[0].clientX;
            miniSwipeStartY.current = e.touches[0].clientY;
            miniSwipeLocked.current = false;
          }}
          onTouchMove={(e) => {
            if (miniSwipeStartX.current === null || miniSwipeStartY.current === null) return;
            const dx = e.touches[0].clientX - miniSwipeStartX.current;
            const dy = e.touches[0].clientY - miniSwipeStartY.current;
            if (!miniSwipeLocked.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
              miniSwipeLocked.current = true;
              if (Math.abs(dy) > Math.abs(dx)) {
                miniSwipeStartX.current = null;
                return;
              }
            }
            if (miniSwipeLocked.current && miniSwipeStartX.current !== null) {
              setMiniSwipeX(dx);
            }
          }}
          onTouchEnd={() => {
            if (Math.abs(miniSwipeX) > 70) {
              const dir = miniSwipeX < 0 ? 'left' : 'right';
              setMiniSwipeAnim(dir);
              setMiniSwipeX(0);
            } else if (miniSwipeX !== 0) {
              setMiniSnapBack(true);
              setMiniSwipeX(0);
            }
            miniSwipeStartX.current = null;
            miniSwipeStartY.current = null;
            miniSwipeLocked.current = false;
          }}
          onClick={() => { if (Math.abs(miniSwipeX) < 5 && !miniSwipeAnim) toggleFullscreen(); }}
        >
          {/* Previous track card */}
          <div className="flex items-center gap-3 px-3 py-2" style={{ width: '33.333%', flexShrink: 0 }}>
            {prevTrackData && (
              <>
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  <img src={prevTrackData.cover} alt={prevTrackData.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate leading-snug">{prevTrackData.title}</p>
                  <p className="text-zinc-400 text-xs truncate leading-snug">{prevTrackData.artist}</p>
                </div>
              </>
            )}
          </div>
          {/* Current track card */}
          <div className="flex items-center gap-3 px-3 py-2" style={{ width: '33.333%', flexShrink: 0 }}>
            <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
              <img src={t.cover} alt={t.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate leading-snug">{t.title}</p>
              <p className="text-zinc-400 text-xs truncate leading-snug">{t.artist}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }} className={`w-10 h-10 flex items-center justify-center transition-colors ${isLiked ? 'text-red-500' : 'text-zinc-500'}`}>
              <Heart size={22} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-10 h-10 flex items-center justify-center text-white">
              {isBuffering
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />
                : player.isPlaying
                  ? <Pause size={24} fill="white" />
                  : <Play size={24} fill="white" />
              }
            </button>
          </div>
          {/* Next track card */}
          <div className="flex items-center gap-3 px-3 py-2" style={{ width: '33.333%', flexShrink: 0 }}>
            {nextTrackData && (
              <>
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  <img src={nextTrackData.cover} alt={nextTrackData.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate leading-snug">{nextTrackData.title}</p>
                  <p className="text-zinc-400 text-xs truncate leading-snug">{nextTrackData.artist}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Desktop player */}
    <div className="fixed bottom-0 left-0 right-0 z-40 hidden md:block bg-zinc-950/95 backdrop-blur-xl border-t border-white/5">
      <div className="absolute top-0 left-0 right-0 h-[3px] cursor-pointer group" onMouseDown={handleProgressMouseDown}>
        <div className="h-full bg-white/10 relative">
          <div className="absolute h-full bg-white/5 transition-all duration-300" style={{ width: `${buffered * 100}%` }} />
          <div className="absolute h-full bg-red-500 transition-all duration-100" style={{ width: `${progress * 100}%` }} />
          <div className="absolute top-1/2 w-3 h-3 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" style={{ left: `${progress * 100}%`, transform: 'translate(-50%, -50%)' }} />
        </div>
      </div>
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-3 w-64 shrink-0">
          <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer group" onClick={toggleFullscreen}>
            <img src={t.cover} alt={t.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 size={16} className="text-white" /></div>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{t.title}</p>
            <p className="text-zinc-400 text-xs truncate">{t.artist}</p>
          </div>
          <button onClick={() => toggleLike(t.id)} className={`shrink-0 transition-colors ${isLiked ? 'text-red-500' : 'text-zinc-500 hover:text-white'}`}><Heart size={16} fill={isLiked ? 'currentColor' : 'none'} /></button>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="flex items-center gap-5">
            <button onClick={toggleShuffle} className={`transition-colors ${player.shuffle ? 'text-red-400' : 'text-zinc-500 hover:text-white'}`}><Shuffle size={16} /></button>
            <button onClick={prev} className="text-zinc-300 hover:text-white transition-colors"><SkipBack size={20} /></button>
            <button onClick={togglePlay} className="w-9 h-9 bg-white hover:bg-zinc-200 rounded-full flex items-center justify-center transition-colors">
              {isBuffering
                ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin-slow" />
                : player.isPlaying ? <Pause size={18} className="text-black" fill="black" /> : <Play size={18} className="text-black" fill="black" />
              }
            </button>
            <button onClick={next} className="text-zinc-300 hover:text-white transition-colors"><SkipForward size={20} /></button>
            <button onClick={toggleRepeat} className={`transition-colors ${player.repeat !== 'none' ? 'text-red-400' : 'text-zinc-500 hover:text-white'}`}>{player.repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}</button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-md">
            <span className="text-zinc-500 text-xs w-10 text-right">{formatDuration(Math.floor(currentTime))}</span>
            <div className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer relative group" onMouseDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); seek((e.clientX - rect.left) / rect.width); }}>
              <div className="absolute h-full bg-white/5 rounded-full" style={{ width: `${buffered * 100}%` }} />
              <div className="h-full bg-white rounded-full relative" style={{ width: `${progress * 100}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
              </div>
            </div>
            <span className="text-zinc-500 text-xs w-10">{formatDuration(Math.floor(duration))}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 w-56 justify-end">
          <div className="relative">
            <button onClick={() => setShowVolume(!showVolume)} className="text-zinc-400 hover:text-white transition-colors">{player.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            {showVolume && (
              <div className="absolute bottom-10 right-0 bg-zinc-900 border border-white/10 rounded-lg p-3 shadow-xl">
                <input type="range" min="0" max="1" step="0.01" value={player.volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-24 accent-red-500" style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '8px', height: '80px' }} />
              </div>
            )}
          </div>
          <input type="range" min="0" max="1" step="0.01" value={player.volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-20 accent-red-500 h-1" />
          <button onClick={toggleFullscreen} className="text-zinc-400 hover:text-white transition-colors"><Maximize2 size={18} /></button>
        </div>
      </div>
    </div>
    </>
  );
}
