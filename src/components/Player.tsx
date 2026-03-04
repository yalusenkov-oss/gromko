import { useStore } from '../store';
import { useAudioEngine } from '../audio/useAudioEngine';
import { formatDuration } from '../utils/format';
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Heart, Maximize2, ChevronDown, WifiOff
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { audioEngine, EngineState } from '../audio/engine';

export default function Player() {
  const {
    player, togglePlay, toggleShuffle, toggleRepeat,
    toggleFullscreen, toggleLike, currentUser
  } = useStore();
  const { seek, setVolume, next, prev } = useAudioEngine();

  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [fsVisible, setFsVisible] = useState(false);
  const [fsAnimating, setFsAnimating] = useState(false);
  const prevFullscreen = useRef(player.isFullscreen);
  const touchStartY = useRef(0);

  useEffect(() => {
    return audioEngine.subscribe(setEngineState);
  }, []);

  useEffect(() => {
    if (player.isFullscreen && !prevFullscreen.current) {
      setFsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFsAnimating(true));
      });
    } else if (!player.isFullscreen && prevFullscreen.current) {
      setFsAnimating(false);
      const timer = setTimeout(() => setFsVisible(false), 400);
      prevFullscreen.current = player.isFullscreen;
      return () => clearTimeout(timer);
    }
    prevFullscreen.current = player.isFullscreen;
  }, [player.isFullscreen]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setIsDragging(true);
    setDragProgress(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    const move = (ev: MouseEvent) =>
      setDragProgress(Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)));
    const up = (ev: MouseEvent) => {
      seek(Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)));
      setIsDragging(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [seek]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    setIsDragging(true);
    setDragProgress(Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)));
    const move = (ev: TouchEvent) => {
      ev.preventDefault();
      const t = ev.touches[0];
      setDragProgress(Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)));
    };
    const end = (ev: TouchEvent) => {
      const t = ev.changedTouches[0];
      seek(Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)));
      setIsDragging(false);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
  }, [seek]);

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) toggleFullscreen();
  }, [toggleFullscreen]);

  // Early return after hooks
  if (!player.currentTrack) return null;

  const t = player.currentTrack;
  const isLiked = currentUser?.likedTracks.includes(t.id) ?? false;
  const duration = engineState?.duration || t.duration;
  const currentTime = isDragging
    ? dragProgress * duration
    : (engineState?.currentTime || Math.floor(t.duration * player.progress));
  const progress = isDragging ? dragProgress : (engineState?.progress ?? player.progress);
  const buffered = engineState?.buffered ?? 0;
  const isBuffering = engineState?.state === 'buffering';
  const qualityLabel = engineState?.actualBitrate || '';
  const artistName = t.artists?.length ? t.artists.map(a => a.name).join(', ') : t.artist;

  /* ═══════ FULLSCREEN ═══════ */
  if (player.isFullscreen || fsVisible) {
    return (
      <div
        className={`fixed inset-0 z-50 transition-all duration-400 ease-out
          ${fsAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {/* Blurred cover background */}
        <div className="absolute inset-0 overflow-hidden">
          <img src={t.cover} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-[80px] opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
        </div>

        <div
          className={`relative z-10 flex flex-col h-full select-none transition-transform duration-400 ease-out
            ${fsAnimating ? 'translate-y-0' : 'translate-y-full'}`}
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 pt-3 pb-2 md:px-8 md:pt-5 shrink-0">
            <button onClick={toggleFullscreen}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10
                text-white/70 hover:text-white hover:bg-white/15 transition-all active:scale-90 -ml-1">
              <ChevronDown size={22} />
            </button>
            <div className="flex items-center gap-2">
              {isBuffering && <span className="text-amber-400/80 text-[10px] flex items-center gap-1 animate-pulse"><WifiOff size={11} /></span>}
              {qualityLabel && <span className="text-white/20 text-[10px] font-medium tracking-wide">{qualityLabel}</span>}
            </div>
            <div className="w-9" />
          </div>

          {/* Main area */}
          <div className="flex-1 flex flex-col min-h-0 px-8 md:px-16"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 8px) + 12px)' }}>

            {/* Cover */}
            <div className="flex-1 flex items-center justify-center min-h-0 py-4">
              <div className={`w-full max-w-[72vw] md:max-w-[300px] aspect-square rounded-3xl overflow-hidden
                transition-all duration-700 ease-out
                ${player.isPlaying
                  ? 'scale-100 shadow-[0_8px_60px_rgba(0,0,0,0.55)]'
                  : 'scale-[0.94] shadow-[0_4px_30px_rgba(0,0,0,0.4)] opacity-80'}`}>
                <img src={t.cover} alt={t.title} className="w-full h-full object-cover" draggable={false} />
              </div>
            </div>

            {/* Bottom group: info + progress + controls */}
            <div className="shrink-0 w-full max-w-md mx-auto space-y-5">
              {/* Track info + like */}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-[19px] md:text-xl font-semibold text-white leading-snug truncate">{t.title}</h2>
                  <p className="text-white/45 text-[14px] mt-0.5 truncate">{artistName}</p>
                </div>
                <button onClick={() => toggleLike(t.id)}
                  className={`shrink-0 p-2 rounded-full transition-all duration-200 active:scale-75
                    ${isLiked ? 'text-red-500' : 'text-white/25 hover:text-white/50'}`}>
                  <Heart size={22} fill={isLiked ? 'currentColor' : 'none'} strokeWidth={isLiked ? 0 : 1.5} />
                </button>
              </div>

              {/* Progress bar */}
              <div>
                <div className="relative h-[5px] rounded-full bg-white/15 cursor-pointer group"
                  style={{ touchAction: 'none' }}
                  onMouseDown={handleProgressMouseDown}
                  onTouchStart={handleProgressTouchStart}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-white/10" style={{ width: `${buffered * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-white transition-all duration-75" style={{ width: `${progress * 100}%` }}>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2
                      w-[14px] h-[14px] rounded-full bg-white shadow-md transition-all duration-150
                      ${isDragging ? 'scale-125' : 'scale-0 group-hover:scale-100'}`} />
                  </div>
                </div>
                <div className="flex justify-between mt-1.5 tabular-nums">
                  <span className="text-white/35 text-[11px]">{formatDuration(Math.floor(currentTime))}</span>
                  <span className="text-white/35 text-[11px]">-{formatDuration(Math.max(0, Math.floor(duration - currentTime)))}</span>
                </div>
              </div>

              {/* Playback controls */}
              <div className="flex items-center justify-between px-2">
                <button onClick={toggleShuffle}
                  className={`p-2 transition-colors ${player.shuffle ? 'text-red-400' : 'text-white/30 hover:text-white/60'}`}>
                  <Shuffle size={19} />
                </button>
                <button onClick={prev} className="p-2 text-white/80 hover:text-white transition-colors active:scale-90">
                  <SkipBack size={26} fill="currentColor" />
                </button>
                <button onClick={togglePlay}
                  className={`w-[62px] h-[62px] rounded-full flex items-center justify-center
                    bg-white text-black hover:scale-105 active:scale-95
                    transition-all duration-200 shadow-lg ${isBuffering ? 'animate-pulse' : ''}`}>
                  {isBuffering
                    ? <div className="w-6 h-6 border-[2.5px] border-black/80 border-t-transparent rounded-full animate-spin" />
                    : player.isPlaying
                      ? <Pause size={26} fill="currentColor" />
                      : <Play size={26} fill="currentColor" className="ml-[3px]" />
                  }
                </button>
                <button onClick={next} className="p-2 text-white/80 hover:text-white transition-colors active:scale-90">
                  <SkipForward size={26} fill="currentColor" />
                </button>
                <button onClick={toggleRepeat}
                  className={`p-2 transition-colors ${player.repeat !== 'none' ? 'text-red-400' : 'text-white/30 hover:text-white/60'}`}>
                  {player.repeat === 'one' ? <Repeat1 size={19} /> : <Repeat size={19} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════ MINI-PLAYER (mobile) ═══════ */
  return (
    <>
    <div className="fixed left-0 right-0 z-40 md:hidden"
      style={{ bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="mx-2 mb-1 rounded-2xl overflow-hidden bg-zinc-900/80 backdrop-blur-2xl
        border border-white/[0.06] shadow-[0_-2px_20px_rgba(0,0,0,0.3)]"
        onClick={toggleFullscreen}>
        <div className="h-[2.5px] bg-white/[0.06]">
          <div className="h-full bg-red-500 transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
            <img src={t.cover} alt={t.title} className="w-full h-full object-cover" />
            {player.isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="flex gap-[3px] items-end h-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-[3px] bg-white rounded-full animate-bounce"
                      style={{ height: `${50 + i * 20}%`, animationDelay: `${i * 0.12}s`, animationDuration: '0.6s' }} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-medium truncate leading-snug">{t.title}</p>
            <p className="text-white/40 text-[12px] truncate leading-snug">{artistName}</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }}
            className={`p-1.5 transition-colors ${isLiked ? 'text-red-500' : 'text-white/25'}`}>
            <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} strokeWidth={isLiked ? 0 : 1.5} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="p-1.5 text-white">
            {isBuffering
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : player.isPlaying
                ? <Pause size={22} fill="white" />
                : <Play size={22} fill="white" className="ml-0.5" />
            }
          </button>
        </div>
      </div>
    </div>

    {/* ═══════ DESKTOP BAR ═══════ */}
    <div className="fixed bottom-0 left-0 right-0 z-40 hidden md:block bg-zinc-950/90 backdrop-blur-2xl border-t border-white/[0.06]">
      <div className="absolute top-0 left-0 right-0 h-[3px] cursor-pointer group" onMouseDown={handleProgressMouseDown}>
        <div className="h-full bg-white/[0.08] relative">
          <div className="absolute h-full bg-white/[0.05] transition-all duration-300" style={{ width: `${buffered * 100}%` }} />
          <div className="absolute h-full bg-red-500 transition-all duration-75" style={{ width: `${progress * 100}%` }} />
          <div className="absolute top-1/2 w-3 h-3 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
            style={{ left: `${progress * 100}%`, transform: 'translate(-50%, -50%)' }} />
        </div>
      </div>
      <div className="flex items-center gap-4 px-4 py-2.5">
        {/* Left — track info */}
        <div className="flex items-center gap-3 w-[260px] shrink-0">
          <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer group shadow-sm" onClick={toggleFullscreen}>
            <img src={t.cover} alt={t.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 size={15} className="text-white" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate leading-snug">{t.title}</p>
            <p className="text-white/40 text-xs truncate leading-snug">{artistName}</p>
          </div>
          <button onClick={() => toggleLike(t.id)}
            className={`shrink-0 p-1 transition-colors ${isLiked ? 'text-red-500' : 'text-white/20 hover:text-white/50'}`}>
            <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} strokeWidth={isLiked ? 0 : 1.5} />
          </button>
        </div>
        {/* Center — controls */}
        <div className="flex-1 flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-5">
            <button onClick={toggleShuffle} className={`transition-colors ${player.shuffle ? 'text-red-400' : 'text-zinc-500 hover:text-white'}`}>
              <Shuffle size={15} />
            </button>
            <button onClick={prev} className="text-zinc-300 hover:text-white transition-colors active:scale-90">
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button onClick={togglePlay}
              className={`w-8 h-8 bg-white hover:bg-zinc-100 rounded-full flex items-center justify-center transition-all active:scale-90 ${isBuffering ? 'animate-pulse' : ''}`}>
              {isBuffering
                ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                : player.isPlaying
                  ? <Pause size={16} className="text-black" fill="black" />
                  : <Play size={16} className="text-black ml-[2px]" fill="black" />
              }
            </button>
            <button onClick={next} className="text-zinc-300 hover:text-white transition-colors active:scale-90">
              <SkipForward size={18} fill="currentColor" />
            </button>
            <button onClick={toggleRepeat} className={`transition-colors ${player.repeat !== 'none' ? 'text-red-400' : 'text-zinc-500 hover:text-white'}`}>
              {player.repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}
            </button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-md">
            <span className="text-zinc-500 text-[11px] w-9 text-right tabular-nums">{formatDuration(Math.floor(currentTime))}</span>
            <div className="flex-1 h-1 bg-white/[0.08] rounded-full cursor-pointer relative group"
              onMouseDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); seek((e.clientX - rect.left) / rect.width); }}>
              <div className="absolute h-full bg-white/[0.05] rounded-full" style={{ width: `${buffered * 100}%` }} />
              <div className="h-full bg-white rounded-full relative" style={{ width: `${progress * 100}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
              </div>
            </div>
            <span className="text-zinc-500 text-[11px] w-9 tabular-nums">{formatDuration(Math.floor(duration))}</span>
          </div>
        </div>
        {/* Right — volume */}
        <div className="flex items-center gap-2.5 w-[220px] justify-end">
          {qualityLabel && <span className="text-zinc-600 text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded-md font-medium">{qualityLabel}</span>}
          {isBuffering && <WifiOff size={13} className="text-amber-400 animate-pulse" />}
          <button onClick={() => setVolume(player.volume === 0 ? 0.7 : 0)} className="text-zinc-500 hover:text-white transition-colors">
            {player.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input type="range" min="0" max="1" step="0.01" value={player.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-[72px] accent-white h-[3px] opacity-60 hover:opacity-100 transition-opacity cursor-pointer" />
          <button onClick={toggleFullscreen} className="text-zinc-500 hover:text-white transition-colors p-1">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
