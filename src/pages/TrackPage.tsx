import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store';
import { Play, Pause, Heart, Plus, Share2, Maximize2, Minimize2 } from 'lucide-react';
import { formatDuration, formatPlays } from '../utils/format';
import TrackCard from '../components/TrackCard';
import { useState } from 'react';

export default function TrackPage() {
  const { id } = useParams();
  const { tracks, player, playTrack, togglePlay, toggleLike, currentUser } = useStore();
  const [isFullViz, setIsFullViz] = useState(false);

  const track = tracks.find(t => t.id === id);
  const similar = tracks.filter(t => t.id !== id && t.genre === track?.genre).slice(0, 6);

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
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-24">
      {/* Full viz mode */}
      {isFullViz && (
        <div className="fixed inset-0 z-45 bg-black flex flex-col items-center justify-center gap-8 p-8"
          style={{ backgroundImage: `url(${track.cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" />
          <div className="relative z-10 w-full max-w-2xl flex flex-col items-center gap-6">
            <button onClick={() => setIsFullViz(false)} className="self-end text-white/70 hover:text-white transition-colors">
              <Minimize2 size={24} />
            </button>
            <img src={track.cover} alt={track.title} className="w-64 h-64 rounded-2xl shadow-2xl object-cover" />
            <div className="text-center">
              <h2 className="text-3xl font-black">{track.title}</h2>
              <p className="text-zinc-400 text-lg mt-1">{track.artist}</p>
            </div>
            <WaveformViz progress={player.progress} />
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {/* Track hero */}
        <div className="flex flex-col md:flex-row gap-8 mb-12">
          <div className="relative group shrink-0">
            <div className="w-56 h-56 md:w-72 md:h-72 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
              <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
            </div>
            {isActive && (
              <div className="absolute inset-0 rounded-2xl flex items-center justify-center">
                <div className="flex gap-1 items-end h-10">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="w-1.5 bg-red-500 rounded-full animate-bounce" style={{ height: `${30 + i * 12}%`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col justify-end gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-zinc-500 text-sm uppercase tracking-wider">{track.genre}</span>
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
              <div className="flex items-center gap-4 mt-3 text-zinc-500 text-sm">
                <span>{track.year}</span>
                <span>{formatPlays(track.plays)} прослушиваний</span>
                <span>{track.likes.toLocaleString()} лайков</span>
                <span>{formatDuration(track.duration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={handlePlay}
                className="flex items-center gap-2.5 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-full font-semibold text-sm transition-all shadow-lg shadow-red-500/30">
                {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" className="ml-0.5" />}
                {isPlaying ? 'Пауза' : 'Слушать'}
              </button>
              <button onClick={() => toggleLike(track.id)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isLiked ? 'bg-red-500/20 text-red-500' : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white'}`}>
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
              <button className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all">
                <Plus size={18} />
              </button>
              <button className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all">
                <Share2 size={18} />
              </button>
              <button onClick={() => setIsFullViz(true)}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all ml-auto"
                title="Полноэкранный режим">
                <Maximize2 size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Waveform */}
        <div className="mb-12">
          <h3 className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Визуализация</h3>
          <WaveformViz progress={isActive ? player.progress : 0} big />
        </div>

        {/* Similar tracks */}
        {similar.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-4">Похожие треки</h2>
            <div className="space-y-1">
              {similar.map(t => <TrackCard key={t.id} track={t} queue={similar} />)}
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
