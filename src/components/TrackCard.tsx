import { Track } from '../store';
import { useStore } from '../store';
import { Play, Pause, Heart } from 'lucide-react';
import { formatDuration, formatPlays } from '../utils/format';
import { Link } from 'react-router-dom';

interface Props {
  track: Track;
  queue?: Track[];
  showRank?: number;
}

export default function TrackCard({ track, queue, showRank }: Props) {
  const { player, playTrack, togglePlay, toggleLike, currentUser } = useStore();
  const isPlaying = player.currentTrack?.id === track.id && player.isPlaying;
  const isActive = player.currentTrack?.id === track.id;
  const isLiked = currentUser?.likedTracks.includes(track.id) ?? false;

  const handlePlay = () => {
    if (isActive) togglePlay();
    else playTrack(track, queue);
  };

  return (
    <div className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${isActive ? 'bg-white/8' : 'hover:bg-white/5'}`}>
      {showRank && (
        <span className="text-zinc-600 text-sm w-5 text-center shrink-0">{showRank}</span>
      )}
      <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0" onClick={handlePlay}>
        <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
        <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {isPlaying ? <Pause size={18} fill="white" className="text-white" /> : <Play size={18} fill="white" className="text-white ml-0.5" />}
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
  );
}
