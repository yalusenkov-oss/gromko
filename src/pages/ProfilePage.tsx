import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Link, useNavigate } from 'react-router-dom';
import {
  Send, Clock, CheckCircle, XCircle, Heart, LogOut,
  Settings, ChevronRight, Shield, Edit3, Camera, Save, X,
  ListMusic, BarChart3
} from 'lucide-react';
import { apiUrl } from '../lib/api';

type Tab = 'overview' | 'submissions';

export default function ProfilePage() {
  const { currentUser, submissions, fetchMySubmissions, logout, updateProfile, tracks } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const navigate = useNavigate();

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
      fetchMySubmissions();
      setEditName(currentUser.name);
    }
  }, [currentUser]);

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  const likedCount = currentUser.likedTracks.length;
  const userSubmissions = submissions;

  // Listening stats
  const likedTracks = tracks.filter(t => currentUser.likedTracks.includes(t.id));

  const artistMap = new Map<string, number>();
  likedTracks.forEach(t => {
    const name = t.artists && t.artists.length > 0 ? t.artists[0].name : t.artist;
    if (name) artistMap.set(name, (artistMap.get(name) || 0) + 1);
  });
  const topArtists = [...artistMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([a]) => a);

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

  const handleSaveProfile = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    await updateProfile({ name: editName.trim() });
    setSaving(false);
    setEditing(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = localStorage.getItem('gromko_token');
      const res = await fetch(apiUrl('/upload/avatar'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        await updateProfile({ avatar: data.url });
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Profile header */}
        <div className="relative bg-gradient-to-br from-red-500/20 via-zinc-900 to-zinc-950 rounded-2xl p-6 md:p-8 mb-6 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.15),transparent_60%)]" />
          <div className="relative flex items-center gap-5">
            <div className="relative group">
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
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <Camera size={20} className="text-white" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-lg font-bold text-white focus:outline-none focus:border-red-500/50 w-full max-w-[200px]"
                    autoFocus
                  />
                  <button onClick={handleSaveProfile} disabled={saving} className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors">
                    <Save size={16} />
                  </button>
                  <button onClick={() => { setEditing(false); setEditName(currentUser.name); }} className="p-1.5 bg-white/10 hover:bg-white/15 text-zinc-400 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl md:text-3xl font-black truncate">{currentUser.name}</h1>
                  <button onClick={() => setEditing(true)} className="p-1 text-zinc-500 hover:text-white transition-colors shrink-0">
                    <Edit3 size={16} />
                  </button>
                </div>
              )}
              <p className="text-zinc-400 text-sm truncate">{currentUser.email}</p>
              <p className="text-zinc-600 text-xs mt-1">
                {currentUser.role === 'admin' ? 'Администратор' : 'Пользователь'} · {currentUser.joinedAt}
              </p>
            </div>
          </div>
        </div>

        {/* Listening stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link to="/liked" className="bg-white/5 hover:bg-white/8 rounded-xl p-4 text-center transition-colors">
            <Heart size={22} className="text-red-400 mx-auto mb-2" fill="currentColor" />
            <p className="text-2xl font-bold text-white">{likedCount}</p>
            <p className="text-zinc-500 text-xs mt-0.5">Любимое</p>
          </Link>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <ListMusic size={22} className="text-cyan-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{artistMap.size > 0 ? artistMap.size : '—'}</p>
            <p className="text-zinc-500 text-xs mt-0.5">Артистов</p>
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
              <p className="text-white font-medium text-sm">Предложить трек</p>
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

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-6">
          <button onClick={() => setTab('overview')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'overview' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <BarChart3 size={15} /> Статистика
          </button>
          <button onClick={() => setTab('submissions')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'submissions' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <Send size={15} /> Заявки ({userSubmissions.length})
          </button>
        </div>

        {/* Tab content */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* Top artists */}
            {topArtists.length > 0 && (
              <div className="bg-white/5 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Любимые артисты</h3>
                <div className="space-y-2">
                  {topArtists.map((a, i) => (
                    <div key={a} className="flex items-center gap-3">
                      <span className="text-zinc-600 text-sm font-bold w-5">{i + 1}</span>
                      <span className="text-white text-sm font-medium">{a}</span>
                      <span className="text-zinc-600 text-xs ml-auto">{artistMap.get(a)} ❤️</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Account info */}

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
                <p className="text-zinc-600 text-sm mb-6">Предложите свой первый трек на модерацию</p>
                <Link to="/submit" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">
                  Предложить трек
                </Link>
              </div>
            ) : userSubmissions.map(sub => (
              <div key={sub.id} className="p-4 bg-white/5 rounded-xl">
                <div className="flex items-start gap-3">
                  {sub.coverUrl ? (
                    <img src={apiUrl(sub.coverUrl)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Send size={18} className="text-zinc-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white font-medium truncate">{sub.title}</p>
                          {sub.albumName && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">💿 {sub.albumName}</span>}
                        </div>
                        <p className="text-zinc-500 text-sm">{sub.artist} · {sub.genre} · {sub.year}</p>
                        <p className="text-zinc-600 text-xs mt-1">{new Date(sub.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
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
