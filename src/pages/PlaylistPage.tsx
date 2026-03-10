import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useStore, Track, Playlist } from '../store';
import {
  ListMusic, Play, Pause, Heart, Clock, Share2, Globe, Lock,
  ChevronLeft, X,
} from 'lucide-react';
import { apiUrl } from '../lib/api';
import { formatDuration } from '../utils/format';

interface PlaylistDetail extends Playlist {
  tracks: Track[];
  owner: { id: string; name: string; avatar: string } | null;
}

function getToken() {
  return localStorage.getItem('gromko_token');
}

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentUser, player, playTrack, togglePlay, toggleLike,
    removeTrackFromPlaylist,
  } = useStore();

  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const token = getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(apiUrl(`/playlists/${id}`), { headers })
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(d => {
        setPlaylist(d);
        setLoading(false);
      })
      .catch(() => {
        setPlaylist(null);
        setLoading(false);
      });
  }, [id]);

  const handleShare = () => {
    const url = `${window.location.origin}/playlists/${id}`;
    if (navigator.share) {
      navigator.share({ title: playlist?.title || 'Плейлист', url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!id || !playlist) return;
    await removeTrackFromPlaylist(id, trackId);
    setPlaylist(prev => prev ? {
      ...prev,
      tracks: prev.tracks.filter(t => t.id !== trackId),
      trackIds: prev.trackIds.filter(tid => tid !== trackId),
      tracksCount: Math.max(0, prev.tracksCount - 1),
    } : null);
  };

  const isOwner = currentUser && playlist && currentUser.id === playlist.userId;

  const totalDuration = playlist?.tracks.reduce((acc, t) => acc + (t.duration || 0), 0) || 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center pt-14">
        <div className="w-8 h-8 border-2 border-white/10 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white pt-14 flex items-center justify-center">
        <div className="text-center">
          <p className="text-6xl font-black text-white/10 mb-3">404</p>
          <p className="text-zinc-400 mb-2">Плейлист не найден</p>
          <p className="text-zinc-600 text-sm">Возможно, он приватный или был удалён</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-14 pb-28">
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-6">
        {/* Back link */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-zinc-500 hover:text-white text-sm mb-6 transition-colors"
        >
          <ChevronLeft size={16} />
          Назад
        </button>

        {/* ─── Header ─── */}
        <div className="flex flex-col sm:flex-row gap-6 mb-8">
          <div className="w-48 h-48 rounded-xl overflow-hidden bg-white/5 shrink-0 mx-auto sm:mx-0">
            {playlist.coverUrl ? (
              <img src={apiUrl(playlist.coverUrl)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                <ListMusic size={48} className="text-zinc-700" />
              </div>
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium mb-1">Плейлист</p>
            <h1 className="text-3xl font-black mb-2">{playlist.title}</h1>
            {playlist.description && (
              <p className="text-zinc-400 text-sm mb-3">{playlist.description}</p>
            )}
            <div className="flex items-center justify-center sm:justify-start gap-3 text-zinc-500 text-sm mb-4">
              {playlist.owner && (
                <Link to={`/user/${playlist.owner.id}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
                  <img src={playlist.owner.avatar || '/default-avatar.png'} alt="" className="w-5 h-5 rounded-full" />
                  {playlist.owner.name}
                </Link>
              )}
              <span>·</span>
              <span>{playlist.tracksCount} треков</span>
              {totalDuration > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {Math.floor(totalDuration / 60)} мин
                  </span>
                </>
              )}
              <span className="flex items-center gap-1">
                {playlist.isPublic ? <Globe size={12} /> : <Lock size={12} />}
                {playlist.isPublic ? 'Публичный' : 'Приватный'}
              </span>
            </div>
            <div className="flex items-center justify-center sm:justify-start gap-3">
              {playlist.tracks.length > 0 && (
                <button
                  onClick={() => playTrack(playlist.tracks[0], playlist.tracks)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white text-sm font-medium rounded-full transition-colors"
                >
                  <Play size={16} fill="white" />
                  Слушать
                </button>
              )}
              <button
                onClick={handleShare}
                className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                title="Поделиться"
              >
                <Share2 size={16} className="text-zinc-400" />
              </button>
            </div>
          </div>
        </div>

        {/* ─── Tracks ─── */}
        {playlist.tracks.length > 0 ? (
          <div className="space-y-0.5">
            {playlist.tracks.map((t, idx) => {
              const isCurrent = player.currentTrack?.id === t.id;
              const isPlaying = isCurrent && player.isPlaying;
              const isLiked = currentUser?.likedTracks.includes(t.id) || false;
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors group ${isCurrent ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
                >
                  <button
                    onClick={() => isCurrent ? togglePlay() : playTrack(t, playlist.tracks)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <span className={`w-6 text-center text-xs tabular-nums ${isCurrent ? 'text-red-400' : 'text-zinc-600'}`}>
                      {isCurrent ? (isPlaying ? '▸' : '❚❚') : idx + 1}
                    </span>
                    <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 relative">
                      <img src={t.cover} alt="" className="w-full h-full object-cover" />
                      <div className={`absolute inset-0 bg-black/50 flex items-center justify-center ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                        {isPlaying ? <Pause size={14} fill="white" className="text-white" /> : <Play size={14} fill="white" className="text-white ml-0.5" />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium truncate ${isCurrent ? 'text-red-400' : 'text-white'}`}>{t.title}</p>
                      <p className="text-zinc-500 text-[11px] truncate">{t.artist}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggleLike(t.id)}>
                      <Heart size={14} className={isLiked ? 'text-red-400' : 'text-zinc-700 opacity-0 group-hover:opacity-100'} fill={isLiked ? 'currentColor' : 'none'} />
                    </button>
                    <span className="text-zinc-600 text-xs tabular-nums w-10 text-right">{t.duration ? formatDuration(t.duration) : ''}</span>
                    {isOwner && (
                      <button
                        onClick={() => handleRemoveTrack(t.id)}
                        className="p-1 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Убрать из плейлиста"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center">
            <ListMusic size={36} className="text-zinc-800 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">Плейлист пуст</p>
            {isOwner && (
              <p className="text-zinc-700 text-xs mt-1">Добавляйте треки через меню на странице трека</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
