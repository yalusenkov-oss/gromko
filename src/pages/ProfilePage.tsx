import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Link, useNavigate } from 'react-router-dom';
import {
  Send, Clock, CheckCircle, XCircle, Heart, Music, LogOut,
  Settings, ChevronRight, User, Shield
} from 'lucide-react';

type Tab = 'overview' | 'submissions';

export default function ProfilePage() {
  const { currentUser, submissions, fetchMySubmissions, logout } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) fetchMySubmissions();
  }, [currentUser]);

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  const likedCount = currentUser.likedTracks.length;
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

  const pendingCount = userSubmissions.filter(s => s.status === 'pending').length;
  const approvedCount = userSubmissions.filter(s => s.status === 'approved').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-32">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Profile header */}
        <div className="relative bg-gradient-to-br from-red-500/20 via-zinc-900 to-zinc-950 rounded-2xl p-6 md:p-8 mb-6 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.15),transparent_60%)]" />
          <div className="relative flex items-center gap-5">
            <div className="relative">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover ring-2 ring-red-500/40"
              />
              {currentUser.role === 'admin' && (
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-zinc-950">
                  <Shield size={14} className="text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-black truncate">{currentUser.name}</h1>
              <p className="text-zinc-400 text-sm truncate">{currentUser.email}</p>
              <p className="text-zinc-600 text-xs mt-1">
                {currentUser.role === 'admin' ? 'Администратор' : 'Пользователь'} · {currentUser.joinedAt}
              </p>
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Link to="/liked" className="bg-white/5 hover:bg-white/8 rounded-xl p-4 text-center transition-colors">
            <Heart size={22} className="text-red-400 mx-auto mb-2" fill="currentColor" />
            <p className="text-2xl font-bold text-white">{likedCount}</p>
            <p className="text-zinc-500 text-xs mt-0.5">Любимое</p>
          </Link>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <Music size={22} className="text-red-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{approvedCount}</p>
            <p className="text-zinc-500 text-xs mt-0.5">Опубликовано</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <Clock size={22} className="text-yellow-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{pendingCount}</p>
            <p className="text-zinc-500 text-xs mt-0.5">На проверке</p>
          </div>
        </div>

        {/* Quick links */}
        <div className="space-y-1.5 mb-8">
          <Link to="/liked" className="flex items-center gap-4 px-4 py-3.5 bg-white/5 hover:bg-white/8 rounded-xl transition-colors group">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl flex items-center justify-center shrink-0">
              <Heart size={18} className="text-white" fill="currentColor" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm">Любимые треки</p>
              <p className="text-zinc-500 text-xs">{likedCount} треков</p>
            </div>
            <ChevronRight size={18} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </Link>

          <Link to="/submit" className="flex items-center gap-4 px-4 py-3.5 bg-white/5 hover:bg-white/8 rounded-xl transition-colors group">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shrink-0">
              <Send size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm">Добавить трек</p>
              <p className="text-zinc-500 text-xs">Отправить трек на модерацию</p>
            </div>
            <ChevronRight size={18} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </Link>

          {currentUser.role === 'admin' && (
            <Link to="/admin" className="flex items-center gap-4 px-4 py-3.5 bg-white/5 hover:bg-white/8 rounded-xl transition-colors group">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shrink-0">
                <Settings size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">Админ-панель</p>
                <p className="text-zinc-500 text-xs">Управление контентом</p>
              </div>
              <ChevronRight size={18} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </Link>
          )}
        </div>

        {/* Tabs: overview / submissions */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-6">
          <button onClick={() => setTab('overview')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'overview' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <User size={15} /> Профиль
          </button>
          <button onClick={() => setTab('submissions')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'submissions' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <Send size={15} /> Заявки ({userSubmissions.length})
          </button>
        </div>

        {/* Tab content */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white/5 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Информация</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 text-sm">Имя</span>
                  <span className="text-white text-sm font-medium">{currentUser.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 text-sm">Email</span>
                  <span className="text-white text-sm font-medium">{currentUser.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 text-sm">Роль</span>
                  <span className="text-white text-sm font-medium">{currentUser.role === 'admin' ? 'Администратор' : 'Пользователь'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 text-sm">Дата регистрации</span>
                  <span className="text-white text-sm font-medium">{currentUser.joinedAt}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => { logout(); navigate('/'); }}
              className="flex items-center gap-3 w-full px-5 py-3.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-400 transition-colors"
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">Выйти из аккаунта</span>
            </button>
          </div>
        )}

        {tab === 'submissions' && (
          <div className="space-y-3">
            {userSubmissions.length === 0 ? (
              <div className="text-center py-16">
                <Send size={40} className="text-zinc-700 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-zinc-400 mb-2">Нет заявок</h2>
                <p className="text-zinc-600 text-sm mb-6">Отправьте свой первый трек на модерацию</p>
                <Link to="/submit" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">
                  Добавить трек
                </Link>
              </div>
            ) : userSubmissions.map(sub => (
              <div key={sub.id} className="p-4 bg-white/5 rounded-xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{sub.title}</p>
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
