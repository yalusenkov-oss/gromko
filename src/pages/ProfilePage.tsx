import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import TrackCard from '../components/TrackCard';
import { Heart, List, Send, Clock, CheckCircle, XCircle } from 'lucide-react';

type Tab = 'likes' | 'playlists' | 'submissions';

export default function ProfilePage() {
  const { currentUser, tracks, playlists, submissions, fetchMySubmissions } = useStore();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'likes';
  const [tab, setTab] = useState<Tab>(initialTab);
  const navigate = useNavigate();

  useEffect(() => {
    const t = searchParams.get('tab') as Tab;
    if (t && ['likes', 'playlists', 'submissions'].includes(t)) {
      setTab(t);
    }
  }, [searchParams]);

  // Fetch user's submissions from API
  useEffect(() => {
    if (currentUser) {
      fetchMySubmissions();
    }
  }, [currentUser]);

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  const likedTracks = tracks.filter(t => currentUser.likedTracks.includes(t.id));
  const userPlaylists = playlists.filter(p => p.userId === currentUser.id);
  const userSubmissions = submissions;

  const statusIcon = (status: string) => {
    if (status === 'pending') return <Clock size={14} className="text-yellow-400" />;
    if (status === 'approved') return <CheckCircle size={14} className="text-green-400" />;
    if (status === 'rejected') return <XCircle size={14} className="text-red-400" />;
    return <Clock size={14} className="text-zinc-400" />;
  };

  const statusLabel = (status: string) => {
    if (status === 'pending') return 'На проверке';
    if (status === 'approved') return 'Опубликован';
    if (status === 'rejected') return 'Отклонён';
    return 'Отложен';
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-24">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Profile header */}
        <div className="flex items-center gap-5 mb-8">
          <img src={currentUser.avatar} alt={currentUser.name}
            className="w-20 h-20 rounded-full object-cover ring-2 ring-red-500/50" />
          <div>
            <h1 className="text-2xl font-black">{currentUser.name}</h1>
            <p className="text-zinc-500 text-sm">{currentUser.email}</p>
            <p className="text-zinc-600 text-xs mt-1">Зарегистрирован {currentUser.joinedAt} · {currentUser.role === 'admin' ? 'Администратор' : 'Пользователь'}</p>
          </div>
          <Link to="/submit" className="ml-auto px-4 py-2 bg-red-500 hover:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors">
            + Добавить трек
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-6">
          <button onClick={() => setTab('likes')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'likes' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <Heart size={15} /> Лайки ({likedTracks.length})
          </button>
          <button onClick={() => setTab('playlists')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'playlists' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <List size={15} /> Плейлисты ({userPlaylists.length})
          </button>
          <button onClick={() => setTab('submissions')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'submissions' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <Send size={15} /> Заявки ({userSubmissions.length})
          </button>
        </div>

        {/* Tab content */}
        {tab === 'likes' && (
          <div className="space-y-1">
            {likedTracks.length === 0 ? (
              <p className="text-zinc-600 text-center py-12">Вы ещё не поставили ни одного лайка</p>
            ) : likedTracks.map(t => <TrackCard key={t.id} track={t} queue={likedTracks} />)}
          </div>
        )}

        {tab === 'playlists' && (
          <div className="space-y-3">
            {userPlaylists.length === 0 ? (
              <p className="text-zinc-600 text-center py-12">У вас нет плейлистов</p>
            ) : userPlaylists.map(pl => {
              const plTracks = tracks.filter(t => pl.trackIds.includes(t.id));
              return (
                <Link key={pl.id} to={`/playlist/${pl.id}`}
                  className="flex items-center gap-4 p-4 bg-white/5 hover:bg-white/8 rounded-xl transition-colors">
                  <div className="w-14 h-14 rounded-lg overflow-hidden grid grid-cols-2 gap-0.5 bg-zinc-800 shrink-0">
                    {plTracks.slice(0, 4).map(t => (
                      <img key={t.id} src={t.cover} alt="" className="w-full h-full object-cover" />
                    ))}
                  </div>
                  <div>
                    <p className="text-white font-medium">{pl.title}</p>
                    <p className="text-zinc-500 text-sm">{plTracks.length} треков · {pl.isPublic ? 'Публичный' : 'Приватный'}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {tab === 'submissions' && (
          <div className="space-y-3">
            {userSubmissions.length === 0 ? (
              <p className="text-zinc-600 text-center py-12">Вы ещё не отправляли треки</p>
            ) : userSubmissions.map(sub => (
              <div key={sub.id} className="p-4 bg-white/5 rounded-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white font-medium">{sub.title}</p>
                    <p className="text-zinc-500 text-sm">{sub.artist} · {sub.genre} · {sub.year}</p>
                    <p className="text-zinc-600 text-xs mt-1">{sub.createdAt}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {statusIcon(sub.status)}
                    <span className={`text-sm font-medium ${
                      sub.status === 'pending' ? 'text-yellow-400' :
                      sub.status === 'approved' ? 'text-green-400' :
                      sub.status === 'rejected' ? 'text-red-400' : 'text-zinc-400'
                    }`}>{statusLabel(sub.status)}</span>
                  </div>
                </div>
                {sub.status === 'rejected' && sub.rejectReason && (
                  <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-red-400 text-sm">Причина: {sub.rejectReason}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
