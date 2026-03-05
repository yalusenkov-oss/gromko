import { useParams, Link } from 'react-router-dom';
import { useStore, Track } from '../store';
import { Play, Pause, Heart, Share2, Maximize2, Minimize2 } from 'lucide-react';
import { formatDuration, formatPlays } from '../utils/format';
import TrackCard from '../components/TrackCard';
import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

export default function TrackPage() {
  const { id } = useParams();
  const { tracks, player, playTrack, togglePlay, toggleLike, currentUser } = useStore();
  const [isFullViz, setIsFullViz] = useState(false);
  const [fetchedTrack, setFetchedTrack] = useState<Track | null>(null);

  // If track is not in store (direct URL visit), fetch it from API
  useEffect(() => {
    const found = tracks.find(t => t.id === id);
    if (!found && id) {
      fetch(apiUrl(`/tracks/${id}`))
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setFetchedTrack(data); })
        .catch(() => {});
    }
  }, [id, tracks]);

  const track = tracks.find(t => t.id === id) || fetchedTrack;
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
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      {/* Full viz mode — only when this track is actually playing */}
      {isFullViz && (
        <div className="fixed inset-0 z-45 bg-black flex flex-col items-center justify-center gap-8 p-8"
          style={{ backgroundImage: `url(${track.cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
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
          <div className="relative group shrink-0">
            <div className="w-56 h-56 md:w-72 md:h-72 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
              <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="flex flex-col justify-end gap-4 w-full md:w-auto">
            <div className="text-center md:text-left">
              <div className="flex items-center gap-2 mb-2 justify-center md:justify-start">
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-zinc-500 text-sm justify-center md:justify-start">
                <span>{track.year}</span>
                <span>{formatDuration(track.duration)}</span>
                <span>{formatPlays(track.plays)} прослушиваний</span>
                <span>{track.likes.toLocaleString()} лайков</span>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-center md:justify-start">
              <button onClick={handlePlay}
                className="flex items-center gap-2.5 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-full font-semibold text-sm transition-all shadow-lg shadow-red-500/30">
                {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" className="ml-0.5" />}
                {isPlaying ? 'Пауза' : 'Слушать'}
              </button>
              <button onClick={() => toggleLike(track.id)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isLiked ? 'bg-red-500/20 text-red-500' : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white'}`}>
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/track/${track.id}`;
                  if (navigator.share) {
                    navigator.share({ title: `${track.title} — ${track.artist}`, text: `Послушай "${track.title}" на GROMKO 🎵`, url });
                  } else {
                    navigator.clipboard.writeText(url);
                  }
                }}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all">
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
