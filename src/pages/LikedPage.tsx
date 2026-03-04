import { useStore } from '../store';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import TrackCard from '../components/TrackCard';
import { Heart, Play, Shuffle, Share2, Check } from 'lucide-react';

function pluralizeTracks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'трек';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'трека';
  return 'треков';
}

export default function LikedPage() {
  const { currentUser, tracks, playTrack, fetchTracks } = useStore();
  const [copied, setCopied] = useState(false);

  // Ensure we have a large enough batch of tracks loaded so liked ones appear
  useEffect(() => {
    fetchTracks({ limit: '500' });
  }, []);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white pt-16 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Для просмотра лайков необходимо войти</p>
          <Link to="/login" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">Войти</Link>
        </div>
      </div>
    );
  }

  const likedTracks = tracks.filter(t => currentUser.likedTracks.includes(t.id));

  const playAll = (shuffle = false) => {
    if (likedTracks.length === 0) return;
    const queue = shuffle ? [...likedTracks].sort(() => Math.random() - 0.5) : likedTracks;
    playTrack(queue[0], queue);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/liked`;
    const shareData = {
      title: 'GROMKO — Любимые треки',
      text: `🎵 Мои любимые треки на GROMKO (${likedTracks.length} ${pluralizeTracks(likedTracks.length)})`,
      url: shareUrl,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-32">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Header — stacked on mobile, side-by-side on desktop */}
        <div className="flex flex-col items-center md:flex-row md:items-end gap-5 md:gap-6 mb-8">
          <div className="w-40 h-40 md:w-48 md:h-48 rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center shadow-2xl shadow-red-500/20 shrink-0">
            <Heart size={56} className="text-white" fill="currentColor" />
          </div>
          <div className="flex-1 min-w-0 text-center md:text-left">
            <p className="text-sm text-zinc-400 uppercase tracking-widest font-medium mb-1">Плейлист</p>
            <h1 className="text-3xl md:text-5xl font-black mb-2">Любимое</h1>
            <p className="text-zinc-400 text-sm">
              {currentUser.name} · {likedTracks.length} {pluralizeTracks(likedTracks.length)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        {likedTracks.length > 0 && (
          <div className="flex items-center justify-center md:justify-start gap-3 mb-6">
            <button
              onClick={() => playAll(false)}
              className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 text-white rounded-full font-medium transition-colors"
            >
              <Play size={20} fill="currentColor" />
              Играть
            </button>
            <button
              onClick={() => playAll(true)}
              className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/15 text-white rounded-full font-medium transition-colors"
            >
              <Shuffle size={18} />
              Перемешать
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/15 text-white rounded-full font-medium transition-colors"
            >
              {copied ? <Check size={18} className="text-green-400" /> : <Share2 size={18} />}
              {copied ? 'Скопировано' : 'Поделиться'}
            </button>
          </div>
        )}

        {/* Tracks list */}
        <div className="space-y-1">
          {likedTracks.length === 0 ? (
            <div className="text-center py-20">
              <Heart size={48} className="text-zinc-700 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-zinc-400 mb-2">Здесь пока пусто</h2>
              <p className="text-zinc-600 text-sm mb-6">Нажимайте ❤️ на треках, чтобы добавить их в «Любимое»</p>
              <Link to="/tracks" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">
                Перейти к трекам
              </Link>
            </div>
          ) : (
            likedTracks.map((t, i) => (
              <TrackCard key={t.id} track={t} queue={likedTracks} showRank={i + 1} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
