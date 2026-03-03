import { useStore } from '../store';
import { useAudioEngine } from '../audio/useAudioEngine';
import { formatDuration } from '../utils/format';
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Heart, Maximize2, X, ChevronDown, WifiOff
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    return audioEngine.subscribe(setEngineState);
  }, []);

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
  const isBuffering = engineState?.state === 'buffering';
  const qualityLabel = engineState?.actualBitrate || '';

  if (player.isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ backgroundImage: `url(${t.cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-2xl" />
        <div className="relative z-10 flex flex-col h-full p-8">
          <div className="flex justify-between items-center mb-8">
            <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors"><ChevronDown size={28} /></button>
            <div className="text-center">
              <span className="text-white/50 text-sm uppercase tracking-widest">Сейчас играет</span>
              {qualityLabel && <span className="text-white/30 text-xs block mt-0.5">{qualityLabel}</span>}
            </div>
            <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors"><X size={24} /></button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-8">
            <div className={`w-72 h-72 md:w-96 md:h-96 rounded-2xl overflow-hidden shadow-2xl transition-transform duration-500 ${player.isPlaying ? 'scale-100' : 'scale-95 opacity-80'}`}>
              <img src={t.cover} alt={t.title} className="w-full h-full object-cover" />
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white mb-1">{t.title}</h2>
              <p className="text-white/60 text-lg">
                {t.artists && t.artists.length > 0
                  ? t.artists.map(a => a.name).join(', ')
                  : t.artist}
              </p>
            </div>
            <div className="w-full max-w-lg">
              <div className="relative h-16 rounded-lg overflow-hidden cursor-pointer bg-white/10" onMouseDown={handleProgressMouseDown}>
                <div className="absolute inset-0 flex items-center gap-[2px] px-2">
                  {Array.from({ length: 80 }).map((_, i) => {
                    const h = 20 + Math.sin(i * 0.4) * 15 + Math.sin(i * 1.1) * 10 + ((i * 7) % 17) * 2;
                    const isActive = i / 80 <= progress;
                    const isBufferedBar = i / 80 <= buffered;
                    return (<div key={i} className={`flex-1 rounded-full transition-colors duration-150 ${isActive ? 'bg-red-500' : isBufferedBar ? 'bg-white/20' : 'bg-white/10'}`} style={{ height: `${Math.min(90, h)}%` }} />);
                  })}
                </div>
              </div>
              <div className="flex justify-between text-white/50 text-sm mt-2">
                <span>{formatDuration(Math.floor(currentTime))}</span>
                <div className="flex items-center gap-2">
                  {isBuffering && <span className="text-yellow-400 text-xs flex items-center gap-1 animate-pulse"><WifiOff size={12} /> Буферизация...</span>}
                  <span>{formatDuration(Math.floor(duration))}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-8">
              <button onClick={toggleShuffle} className={`transition-colors ${player.shuffle ? 'text-red-400' : 'text-white/50 hover:text-white'}`}><Shuffle size={22} /></button>
              <button onClick={prev} className="text-white/80 hover:text-white transition-colors"><SkipBack size={28} /></button>
              <button onClick={togglePlay} className={`w-16 h-16 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-red-500/40 ${isBuffering ? 'animate-pulse' : ''}`}>
                {isBuffering ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : player.isPlaying ? <Pause size={28} fill="white" className="text-white" /> : <Play size={28} fill="white" className="text-white ml-1" />}
              </button>
              <button onClick={next} className="text-white/80 hover:text-white transition-colors"><SkipForward size={28} /></button>
              <button onClick={toggleRepeat} className={`transition-colors ${player.repeat !== 'none' ? 'text-red-400' : 'text-white/50 hover:text-white'}`}>{player.repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-white/5">
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
            {player.isPlaying && (
              <div className="absolute bottom-1 right-1 flex gap-0.5 items-end h-3">
                {[1, 2, 3].map((i) => (<div key={i} className="w-0.5 bg-red-500 rounded-full animate-bounce" style={{ height: `${40 + i * 20}%`, animationDelay: `${i * 0.1}s` }} />))}
              </div>
            )}
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
            <button onClick={togglePlay} className={`w-9 h-9 bg-white hover:bg-zinc-200 rounded-full flex items-center justify-center transition-colors ${isBuffering ? 'animate-pulse' : ''}`}>
              {isBuffering ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : player.isPlaying ? <Pause size={18} className="text-black" fill="black" /> : <Play size={18} className="text-black ml-0.5" fill="black" />}
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
          {qualityLabel && <span className="text-zinc-600 text-[10px] bg-white/5 px-1.5 py-0.5 rounded hidden lg:block">{qualityLabel}</span>}
          {isBuffering && <WifiOff size={14} className="text-yellow-400 animate-pulse" />}
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
  );
}
