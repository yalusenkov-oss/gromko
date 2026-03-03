import { useState } from 'react';
import { useStore, GENRES, Track } from '../store';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Music, Users, Clock, Shield,
  TrendingUp, CheckCircle, XCircle, Timer, Edit2, Trash2,
  Plus, Eye, EyeOff, Star, Save, X, Upload, Link2,
  List, ChevronDown, ChevronUp, Tag, Disc,
  AlertTriangle, RefreshCw, Search, ExternalLink,
  ArrowLeft, ArrowRight, Globe
} from 'lucide-react';
import { formatPlays, formatDuration } from '../utils/format';

type AdminTab = 'dashboard' | 'tracks' | 'artists' | 'pending' | 'users' | 'site';

export default function AdminPanel() {
  const { currentUser } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>('dashboard');

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <Shield size={48} className="text-red-500 mx-auto mb-4" />
          <p className="text-xl font-bold mb-2">Доступ запрещён</p>
          <p className="text-zinc-500 mb-4">Только для администраторов</p>
          <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-red-500 rounded-lg text-sm">На главную</button>
        </div>
      </div>
    );
  }

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Дашборд', icon: <LayoutDashboard size={18} /> },
    { id: 'tracks', label: 'Треки', icon: <Music size={18} /> },
    { id: 'artists', label: 'Артисты', icon: <Users size={18} /> },
    { id: 'pending', label: 'Модерация', icon: <Clock size={18} /> },
    { id: 'users', label: 'Пользователи', icon: <Shield size={18} /> },
    { id: 'site', label: 'Управление сайтом', icon: <Globe size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 flex">
      {/* Sidebar */}
      <div className="w-60 bg-zinc-900/70 border-r border-white/5 flex-shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="p-4">
          <div className="mb-6 px-2">
            <p className="text-xs font-black text-red-500 uppercase tracking-widest">GROMKO</p>
            <p className="text-xs text-zinc-600 mt-0.5">Панель управления</p>
          </div>
          <nav className="space-y-1">
            {navItems.map(item => (
              <button key={item.id} onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === item.id ? 'bg-red-500/20 text-red-400 border border-red-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{item.badge}</span>}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto pb-32 min-w-0">
        <div className="p-6 max-w-6xl">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'tracks' && <TracksAdmin />}
          {tab === 'artists' && <ArtistsAdmin />}
          {tab === 'pending' && <PendingAdmin />}
          {tab === 'users' && <UsersAdmin />}
          {tab === 'site' && <SiteAdmin />}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── DASHBOARD ─────────────────── */
function Dashboard() {
  const { tracks, artists, users, submissions } = useStore();
  const pending = submissions.filter(s => s.status === 'pending');

  const stats = [
    { label: 'Треков', value: tracks.length, icon: <Music size={20} />, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: 'Артистов', value: artists.length, icon: <Users size={20} />, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    { label: 'Пользователей', value: users.filter(u => u.role !== 'admin').length, icon: <Shield size={20} />, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
    { label: 'На модерации', value: pending.length, icon: <Clock size={20} />, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    { label: 'Прослушиваний', value: tracks.reduce((s, t) => s + t.plays, 0), icon: <TrendingUp size={20} />, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  ];

  const topTracks = [...tracks].sort((a, b) => b.plays - a.plays).slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Дашборд</h1>
        <span className="text-zinc-600 text-sm">{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`border rounded-2xl p-5 ${s.bg}`}>
            <div className={`${s.color} mb-3`}>{s.icon}</div>
            <p className="text-2xl font-black">{typeof s.value === 'number' && s.value > 1000 ? formatPlays(s.value) : s.value}</p>
            <p className="text-zinc-500 text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-yellow-400" />
            <h2 className="font-bold text-yellow-400">Требует внимания</h2>
          </div>
          <p className="text-zinc-300 text-sm">{pending.length} заявок ожидают модерации</p>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h2 className="font-bold mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-red-400" /> Топ треков</h2>
        <div className="space-y-2">
          {topTracks.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3">
              <span className="text-zinc-600 w-5 text-sm text-right">{i + 1}</span>
              <img src={t.cover} alt={t.title} className="w-9 h-9 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{t.title}</p>
                <p className="text-zinc-500 text-xs">{t.artist}</p>
              </div>
              <span className="text-zinc-500 text-xs">{formatPlays(t.plays)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── TRACKS ADMIN ─────────────────── */
function TracksAdmin() {
  const { tracks, updateTrack, deleteTrack, addTrack, artists } = useStore();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [tab, setTab] = useState<'list' | 'add-single' | 'add-bulk' | 'add-yandex'>('list');
  const [newTrack, setNewTrack] = useState({ title: '', artist: '', artistSlug: '', genre: GENRES[0], year: 2024, cover: '', duration: 180, plays: 0, likes: 0, explicit: false, isNew: true });
  const [bulkText, setBulkText] = useState('');
  const [bulkParsed, setBulkParsed] = useState<any[]>([]);
  const [bulkError, setBulkError] = useState('');
  const [yandexUrl, setYandexUrl] = useState('');
  const [yandexStatus, setYandexStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [sortBy, setSortBy] = useState<'date' | 'plays' | 'alpha'>('date');
  const [page, setPage] = useState(0);
  const PER_PAGE = 20;

  const filtered = tracks
    .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.artist.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'plays' ? b.plays - a.plays : sortBy === 'alpha' ? a.title.localeCompare(b.title) : b.year - a.year);

  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const startEdit = (t: any) => { setEditing(t.id); setEditData({ ...t }); };
  const saveEdit = () => { updateTrack(editing!, editData); setEditing(null); };

  // Bulk parse JSON or line-by-line
  const parseBulk = () => {
    setBulkError('');
    try {
      const parsed = JSON.parse(bulkText);
      if (Array.isArray(parsed)) {
        setBulkParsed(parsed);
      } else {
        setBulkError('Ожидается массив JSON');
      }
    } catch {
      // Try line-by-line format: "Title - Artist - Genre - Year"
      const lines = bulkText.trim().split('\n').filter(l => l.trim());
      const result = lines.map((line, idx) => {
        const parts = line.split('|').map(s => s.trim());
        if (parts.length < 2) return null;
        return {
          title: parts[0] || `Трек ${idx + 1}`,
          artist: parts[1] || 'Неизвестный',
          artistSlug: (parts[1] || 'unknown').toLowerCase().replace(/\s+/g, '-'),
          genre: parts[2] || GENRES[0],
          year: parseInt(parts[3]) || 2024,
          cover: parts[4] || `https://picsum.photos/seed/${Date.now() + idx}/400/400`,
          duration: 180,
          plays: 0,
          likes: 0,
          explicit: false,
          isNew: true,
        };
      }).filter(Boolean);
      if (result.length > 0) {
        setBulkParsed(result);
      } else {
        setBulkError('Не удалось распознать формат. Используйте JSON или "Название | Артист | Жанр | Год"');
      }
    }
  };

  const importBulk = () => {
    bulkParsed.forEach(t => addTrack(t));
    setBulkParsed([]);
    setBulkText('');
    setTab('list');
  };

  const importYandex = () => {
    if (!yandexUrl.trim()) return;
    setYandexStatus('loading');
    setTimeout(() => {
      // Simulate Yandex Disk import — in production this would call the Yandex API
      const mockFromYandex = [
        { title: 'Трек с Яндекс.Диска 1', artist: 'Артист', artistSlug: 'artist', genre: GENRES[0], year: 2024, cover: `https://picsum.photos/seed/yd1/400/400`, duration: 210, plays: 0, likes: 0, explicit: false, isNew: true },
        { title: 'Трек с Яндекс.Диска 2', artist: 'Артист', artistSlug: 'artist', genre: GENRES[1], year: 2024, cover: `https://picsum.photos/seed/yd2/400/400`, duration: 185, plays: 0, likes: 0, explicit: false, isNew: true },
        { title: 'Трек с Яндекс.Диска 3', artist: 'Другой Артист', artistSlug: 'other-artist', genre: GENRES[2], year: 2023, cover: `https://picsum.photos/seed/yd3/400/400`, duration: 240, plays: 0, likes: 0, explicit: true, isNew: true },
      ];
      mockFromYandex.forEach(t => addTrack(t));
      setYandexStatus('success');
      setYandexUrl('');
      setTimeout(() => { setYandexStatus('idle'); setTab('list'); }, 2000);
    }, 1800);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black">Треки ({tracks.length})</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab('list')} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${tab === 'list' ? 'bg-white/15 text-white' : 'bg-white/5 text-zinc-400 hover:text-white'}`}>
            <List size={15} /> Список
          </button>
          <button onClick={() => setTab('add-single')} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${tab === 'add-single' ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-zinc-400 hover:text-white'}`}>
            <Plus size={15} /> Добавить
          </button>
          <button onClick={() => setTab('add-bulk')} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${tab === 'add-bulk' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-zinc-400 hover:text-white'}`}>
            <Upload size={15} /> Массово
          </button>
          <button onClick={() => setTab('add-yandex')} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${tab === 'add-yandex' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/5 text-zinc-400 hover:text-white'}`}>
            <Link2 size={15} /> Яндекс.Диск
          </button>
        </div>
      </div>

      {/* Single add */}
      {tab === 'add-single' && (
        <div className="bg-white/5 border border-red-500/20 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-red-400 flex items-center gap-2"><Plus size={16} /> Новый трек</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'title', label: 'Название' },
              { key: 'artist', label: 'Артист' },
              { key: 'artistSlug', label: 'Slug артиста' },
              { key: 'cover', label: 'Обложка (URL)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                <input
                  value={(newTrack as any)[key]}
                  onChange={e => setNewTrack(n => ({ ...n, [key]: e.target.value }))}
                  list={key === 'artist' ? 'artists-list' : undefined}
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/50"
                />
                {key === 'artist' && (
                  <datalist id="artists-list">
                    {artists.map(a => <option key={a.id} value={a.name} />)}
                  </datalist>
                )}
              </div>
            ))}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Жанр</label>
              <select value={newTrack.genre} onChange={e => setNewTrack(n => ({ ...n, genre: e.target.value }))}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Год</label>
              <input type="number" value={newTrack.year} onChange={e => setNewTrack(n => ({ ...n, year: +e.target.value }))}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Длительность (сек)</label>
              <input type="number" value={newTrack.duration} onChange={e => setNewTrack(n => ({ ...n, duration: +e.target.value }))}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
            </div>
            <div className="flex items-center gap-4 pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newTrack.explicit} onChange={e => setNewTrack(n => ({ ...n, explicit: e.target.checked }))} className="w-4 h-4 accent-red-500" />
                <span className="text-sm text-zinc-300">Explicit</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newTrack.isNew} onChange={e => setNewTrack(n => ({ ...n, isNew: e.target.checked }))} className="w-4 h-4 accent-red-500" />
                <span className="text-sm text-zinc-300">Новинка</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { addTrack(newTrack); setTab('list'); }} className="px-5 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">Добавить трек</button>
            <button onClick={() => setTab('list')} className="px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-lg text-sm transition-colors">Отмена</button>
          </div>
        </div>
      )}

      {/* Bulk add */}
      {tab === 'add-bulk' && (
        <div className="bg-white/5 border border-blue-500/20 rounded-2xl p-6 space-y-5">
          <h3 className="font-bold text-blue-400 flex items-center gap-2"><Upload size={16} /> Массовая загрузка треков</h3>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-300 space-y-2">
            <p className="font-semibold">Поддерживаемые форматы:</p>
            <p className="text-blue-400/80">① JSON-массив объектов с полями: title, artist, genre, year, cover, duration</p>
            <p className="text-blue-400/80">② Построчно: <code className="bg-blue-900/40 px-1 rounded">Название | Артист | Жанр | Год | URL обложки</code></p>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-2">Вставьте данные:</label>
            <textarea
              value={bulkText}
              onChange={e => { setBulkText(e.target.value); setBulkParsed([]); setBulkError(''); }}
              rows={10}
              placeholder={'[\n  {"title": "Трек 1", "artist": "Артист", "genre": "Хип-хоп", "year": 2024, "cover": "https://...", "duration": 180},\n  ...\n]\n\n— или —\n\nНазвание | Артист | Жанр | Год | https://обложка.jpg\nНазвание 2 | Артист 2 | Рэп | 2023'}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-blue-500/50 font-mono resize-y"
            />
          </div>
          {bulkError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {bulkError}
            </div>
          )}
          {bulkParsed.length > 0 && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-green-400 font-semibold mb-3 flex items-center gap-2">
                <CheckCircle size={16} /> Распознано {bulkParsed.length} треков — предварительный просмотр:
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {bulkParsed.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 rounded-lg p-2.5">
                    {t.cover ? <img src={t.cover} alt="" className="w-8 h-8 rounded object-cover shrink-0" /> : <div className="w-8 h-8 bg-zinc-700 rounded shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{t.title}</p>
                      <p className="text-zinc-500 text-xs">{t.artist} · {t.genre} · {t.year}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={parseBulk} className="px-5 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors">Разобрать</button>
            {bulkParsed.length > 0 && (
              <button onClick={importBulk} className="px-5 py-2.5 bg-green-500 hover:bg-green-400 text-white rounded-lg text-sm font-medium transition-colors">
                Загрузить {bulkParsed.length} треков
              </button>
            )}
            <button onClick={() => { setTab('list'); setBulkText(''); setBulkParsed([]); setBulkError(''); }} className="px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-lg text-sm transition-colors">Отмена</button>
          </div>
        </div>
      )}

      {/* Yandex Disk */}
      {tab === 'add-yandex' && (
        <div className="bg-white/5 border border-yellow-500/20 rounded-2xl p-6 space-y-5">
          <h3 className="font-bold text-yellow-400 flex items-center gap-2"><Link2 size={16} /> Загрузка с Яндекс.Диска</h3>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm text-yellow-300 space-y-2">
            <p className="font-semibold">Как использовать:</p>
            <p className="text-yellow-400/80">1. Загрузите папку с треками на Яндекс.Диск</p>
            <p className="text-yellow-400/80">2. Откройте общий доступ к папке</p>
            <p className="text-yellow-400/80">3. Вставьте ссылку на публичную папку ниже</p>
            <p className="text-yellow-400/80">4. Система автоматически распознает аудиофайлы</p>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-2">Публичная ссылка на папку или файл:</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={yandexUrl}
                onChange={e => setYandexUrl(e.target.value)}
                placeholder="https://disk.yandex.ru/d/..."
                className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-500/50"
              />
              <a href="https://disk.yandex.ru" target="_blank" rel="noopener noreferrer"
                className="px-3 py-2.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
                <ExternalLink size={16} />
              </a>
            </div>
          </div>
          {yandexStatus === 'loading' && (
            <div className="flex items-center gap-3 text-yellow-400">
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-sm">Подключение к Яндекс.Диску...</span>
            </div>
          )}
          {yandexStatus === 'success' && (
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle size={16} />
              <span className="text-sm">Треки успешно загружены!</span>
            </div>
          )}
          {yandexStatus === 'error' && (
            <div className="flex items-center gap-3 text-red-400">
              <XCircle size={16} />
              <span className="text-sm">Ошибка подключения. Проверьте ссылку.</span>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={importYandex} disabled={!yandexUrl || yandexStatus === 'loading'}
              className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black rounded-lg text-sm font-bold transition-colors flex items-center gap-2">
              {yandexStatus === 'loading' ? <RefreshCw size={15} className="animate-spin" /> : <Link2 size={15} />}
              Загрузить с диска
            </button>
            <button onClick={() => setTab('list')} className="px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-lg text-sm transition-colors">Отмена</button>
          </div>
        </div>
      )}

      {/* List */}
      {tab === 'list' && (
        <>
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Поиск треков..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/20" />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none">
              <option value="date">По году</option>
              <option value="plays">По популярности</option>
              <option value="alpha">По алфавиту</option>
            </select>
          </div>

          <div className="space-y-1.5">
            {paginated.map(t => (
              <div key={t.id} className="bg-white/5 hover:bg-white/8 rounded-xl overflow-hidden transition-colors">
                {editing === t.id ? (
                  <div className="p-4 space-y-3 border border-red-500/20">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Название</label>
                        <input value={editData.title} onChange={e => setEditData((d: any) => ({ ...d, title: e.target.value }))}
                          className="w-full bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none border border-white/10" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Артист</label>
                        <input value={editData.artist} onChange={e => setEditData((d: any) => ({ ...d, artist: e.target.value }))}
                          list="artists-edit-list"
                          className="w-full bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none border border-white/10" />
                        <datalist id="artists-edit-list">
                          {artists.map(a => <option key={a.id} value={a.name} />)}
                        </datalist>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Slug</label>
                        <input value={editData.artistSlug} onChange={e => setEditData((d: any) => ({ ...d, artistSlug: e.target.value }))}
                          className="w-full bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none border border-white/10" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Жанр</label>
                        <select value={editData.genre} onChange={e => setEditData((d: any) => ({ ...d, genre: e.target.value }))}
                          className="w-full bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none border border-white/10">
                          {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Год</label>
                        <input type="number" value={editData.year} onChange={e => setEditData((d: any) => ({ ...d, year: +e.target.value }))}
                          className="w-full bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none border border-white/10" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Длительность (сек)</label>
                        <input type="number" value={editData.duration} onChange={e => setEditData((d: any) => ({ ...d, duration: +e.target.value }))}
                          className="w-full bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none border border-white/10" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-zinc-500 block mb-1">Обложка (URL)</label>
                        <input value={editData.cover} onChange={e => setEditData((d: any) => ({ ...d, cover: e.target.value }))}
                          className="w-full bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none border border-white/10" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={editData.explicit} onChange={e => setEditData((d: any) => ({ ...d, explicit: e.target.checked }))} className="accent-red-500" />
                        <span className="text-zinc-300">Explicit</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={editData.isNew} onChange={e => setEditData((d: any) => ({ ...d, isNew: e.target.checked }))} className="accent-red-500" />
                        <span className="text-zinc-300">Новинка</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={editData.featured} onChange={e => setEditData((d: any) => ({ ...d, featured: e.target.checked }))} className="accent-red-500" />
                        <span className="text-zinc-300">Популярное</span>
                      </label>
                    </div>
                    {editData.cover && (
                      <div className="flex items-center gap-3">
                        <img src={editData.cover} alt="" className="w-16 h-16 rounded-lg object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                        <span className="text-zinc-600 text-xs">Предпросмотр обложки</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="flex items-center gap-1.5 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 transition-colors">
                        <Save size={14} /> Сохранить
                      </button>
                      <button onClick={() => setEditing(null)} className="flex items-center gap-1.5 px-4 py-2 bg-white/10 text-zinc-400 rounded-lg text-sm hover:bg-white/15">
                        <X size={14} /> Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3">
                    <img src={t.cover} alt={t.title} className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-white text-sm font-medium truncate">{t.title}</p>
                        {t.explicit && <span className="text-xs bg-zinc-700 text-zinc-400 px-1 rounded shrink-0">E</span>}
                        {t.isNew && <span className="text-xs bg-red-500/20 text-red-400 px-1.5 rounded shrink-0">NEW</span>}
                      </div>
                      <p className="text-zinc-500 text-xs">{t.artist} · {t.genre} · {t.year} · {formatDuration(t.duration)}</p>
                    </div>
                    <div className="hidden md:flex items-center gap-3 text-xs text-zinc-600">
                      <span>{formatPlays(t.plays)} прослушиваний</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(t)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => deleteTrack(t.id)} className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-zinc-600 hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/5 rounded-lg text-sm disabled:opacity-40 hover:bg-white/10 transition-colors">
                <ArrowLeft size={15} /> Назад
              </button>
              <span className="text-zinc-500 text-sm">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/5 rounded-lg text-sm disabled:opacity-40 hover:bg-white/10 transition-colors">
                Вперёд <ArrowRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────── ARTISTS ADMIN ─────────────────── */
function ArtistsAdmin() {
  const { artists, tracks, updateArtist, deleteArtist, addArtist } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newArtist, setNewArtist] = useState({ name: '', slug: '', photo: '', bio: '', genre: GENRES[0], tracksCount: 0, totalPlays: 0, socials: { vk: '', instagram: '', telegram: '' } });
  const [trackSearch, setTrackSearch] = useState('');
  const [expandedArtist, setExpandedArtist] = useState<string | null>(null);

  const startEdit = (a: any) => {
    setEditing(a.id);
    setEditData({ ...a, socials: a.socials || { vk: '', instagram: '', telegram: '' } });
    setExpandedArtist(null);
  };
  const saveEdit = () => { updateArtist(editing!, editData); setEditing(null); };

  const getArtistTracks = (artistName: string) =>
    tracks.filter(t => t.artist.toLowerCase() === artistName.toLowerCase());

  const attachTrack = (artistId: string, track: Track) => {
    updateArtist(artistId, {});
    // Update track's artist reference
    const { updateTrack } = useStore.getState();
    const artist = artists.find(a => a.id === artistId);
    if (artist) {
      updateTrack(track.id, { artist: artist.name, artistSlug: artist.slug });
    }
  };

  const detachTrack = (track: Track) => {
    const { updateTrack } = useStore.getState();
    updateTrack(track.id, { artist: '[Без артиста]', artistSlug: 'unknown' });
  };

  const filteredTracks = tracks.filter(t =>
    !trackSearch || t.title.toLowerCase().includes(trackSearch.toLowerCase()) || t.artist.toLowerCase().includes(trackSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Артисты ({artists.length})</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> Добавить артиста
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white/5 border border-red-500/20 rounded-2xl p-6 space-y-5">
          <h3 className="font-bold text-red-400 flex items-center gap-2"><Plus size={16} /> Новый артист</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'name', label: 'Имя артиста' },
              { key: 'slug', label: 'Slug (для URL)' },
              { key: 'photo', label: 'Фото (URL)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                <input
                  value={(newArtist as any)[key]}
                  onChange={e => {
                    const val = e.target.value;
                    setNewArtist(n => ({
                      ...n,
                      [key]: val,
                      ...(key === 'name' ? { slug: val.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') } : {})
                    }));
                  }}
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/50"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Жанр</label>
              <select value={newArtist.genre} onChange={e => setNewArtist(n => ({ ...n, genre: e.target.value }))}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Биография</label>
              <textarea value={newArtist.bio} onChange={e => setNewArtist(n => ({ ...n, bio: e.target.value }))} rows={3}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">ВКонтакте</label>
              <input value={newArtist.socials.vk} onChange={e => setNewArtist(n => ({ ...n, socials: { ...n.socials, vk: e.target.value } }))}
                placeholder="https://vk.com/..."
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Instagram</label>
              <input value={newArtist.socials.instagram} onChange={e => setNewArtist(n => ({ ...n, socials: { ...n.socials, instagram: e.target.value } }))}
                placeholder="https://instagram.com/..."
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
            </div>
          </div>
          {newArtist.photo && (
            <div className="flex items-center gap-3">
              <img src={newArtist.photo} alt="" className="w-16 h-16 rounded-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
              <span className="text-zinc-600 text-xs">Предпросмотр фото</span>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { addArtist(newArtist); setShowAdd(false); }} className="px-5 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium">Создать артиста</button>
            <button onClick={() => setShowAdd(false)} className="px-5 py-2.5 bg-white/10 rounded-lg text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* Artists list */}
      <div className="space-y-3">
        {artists.map(a => {
          const artistTracks = getArtistTracks(a.name);
          const isExpanded = expandedArtist === a.id;
          return (
            <div key={a.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
              {editing === a.id ? (
                /* ── EDIT FORM ── */
                <div className="p-5 space-y-4 border border-red-500/20">
                  <div className="flex items-center gap-3 mb-2">
                    {editData.photo && <img src={editData.photo} alt="" className="w-14 h-14 rounded-full object-cover" />}
                    <h3 className="font-bold text-red-400">Редактирование: {editData.name}</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: 'name', label: 'Имя' },
                      { key: 'slug', label: 'Slug' },
                      { key: 'photo', label: 'Фото (URL)' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-xs text-zinc-500 block mb-1">{label}</label>
                        <input value={editData[key] || ''} onChange={e => setEditData((d: any) => ({ ...d, [key]: e.target.value }))}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Жанр</label>
                      <select value={editData.genre} onChange={e => setEditData((d: any) => ({ ...d, genre: e.target.value }))}
                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                        {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-zinc-500 block mb-1">Биография</label>
                      <textarea value={editData.bio || ''} onChange={e => setEditData((d: any) => ({ ...d, bio: e.target.value }))} rows={3}
                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">ВКонтакте</label>
                      <input value={editData.socials?.vk || ''} onChange={e => setEditData((d: any) => ({ ...d, socials: { ...d.socials, vk: e.target.value } }))}
                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Instagram</label>
                      <input value={editData.socials?.instagram || ''} onChange={e => setEditData((d: any) => ({ ...d, socials: { ...d.socials, instagram: e.target.value } }))}
                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Telegram</label>
                      <input value={editData.socials?.telegram || ''} onChange={e => setEditData((d: any) => ({ ...d, socials: { ...d.socials, telegram: e.target.value } }))}
                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                    </div>
                  </div>

                  {/* Track binding in edit mode */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5"><Tag size={12} /> Привязанные треки ({artistTracks.length})</p>
                    <div className="bg-zinc-900 rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto">
                      {artistTracks.length === 0 ? (
                        <p className="text-zinc-600 text-xs text-center py-2">Нет треков</p>
                      ) : (
                        artistTracks.map(t => (
                          <div key={t.id} className="flex items-center gap-2">
                            <img src={t.cover} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                            <span className="text-white text-xs flex-1 truncate">{t.title}</span>
                            <button onClick={() => detachTrack(t)} className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors shrink-0">
                              Отвязать
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    {/* Attach other tracks */}
                    <div className="mt-3">
                      <p className="text-xs text-zinc-500 mb-2">Привязать трек:</p>
                      <div className="relative mb-2">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input value={trackSearch} onChange={e => setTrackSearch(e.target.value)}
                          placeholder="Поиск трека..."
                          className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none" />
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {filteredTracks.filter(t => t.artist.toLowerCase() !== a.name.toLowerCase()).slice(0, 8).map(t => (
                          <button key={t.id} onClick={() => attachTrack(a.id, t)}
                            className="w-full flex items-center gap-2 p-1.5 hover:bg-white/5 rounded-lg transition-colors text-left">
                            <img src={t.cover} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                            <span className="text-zinc-300 text-xs flex-1 truncate">{t.title} — {t.artist}</span>
                            <span className="text-blue-400 text-xs px-1.5 rounded bg-blue-500/10 shrink-0">+ Привязать</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="flex items-center gap-1.5 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 transition-colors">
                      <Save size={14} /> Сохранить
                    </button>
                    <button onClick={() => setEditing(null)} className="px-4 py-2 bg-white/10 text-zinc-400 rounded-lg text-sm hover:bg-white/15">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                /* ── VIEW ROW ── */
                <>
                  <div className="flex items-center gap-3 p-4">
                    <img src={a.photo} alt={a.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0 ring-2 ring-white/10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold">{a.name}</p>
                      <p className="text-zinc-500 text-xs mb-1">{a.genre} · {formatPlays(a.totalPlays)} прослушиваний</p>
                      <p className="text-zinc-600 text-xs truncate">{a.bio}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex gap-1.5">
                        <button onClick={() => startEdit(a)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setExpandedArtist(isExpanded ? null : a.id)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                        <button onClick={() => deleteArtist(a.id)} className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-zinc-600 hover:text-red-400">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <span className="text-xs text-zinc-600 bg-white/5 px-2 py-0.5 rounded-full">
                        {artistTracks.length} треков
                      </span>
                    </div>
                  </div>

                  {/* Expanded track list */}
                  {isExpanded && (
                    <div className="border-t border-white/5 p-4 space-y-3">
                      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
                        <Disc size={12} /> Треки артиста
                      </p>
                      {artistTracks.length === 0 ? (
                        <p className="text-zinc-600 text-sm py-2">Треки не найдены</p>
                      ) : (
                        <div className="space-y-1.5">
                          {artistTracks.map(t => (
                            <div key={t.id} className="flex items-center gap-2.5 p-2 bg-white/3 rounded-lg">
                              <img src={t.cover} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm truncate">{t.title}</p>
                                <p className="text-zinc-600 text-xs">{t.genre} · {t.year} · {formatDuration(t.duration)}</p>
                              </div>
                              <button onClick={() => detachTrack(t)} className="text-red-400 text-xs px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors shrink-0">
                                Отвязать
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Quick attach */}
                      <div>
                        <p className="text-xs text-zinc-500 mb-2 mt-3">Привязать трек к артисту:</p>
                        <div className="relative mb-2">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                          <input value={trackSearch} onChange={e => setTrackSearch(e.target.value)}
                            placeholder="Поиск трека..."
                            className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none" />
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {tracks.filter(t =>
                            t.artist.toLowerCase() !== a.name.toLowerCase() &&
                            (!trackSearch || t.title.toLowerCase().includes(trackSearch.toLowerCase()) || t.artist.toLowerCase().includes(trackSearch.toLowerCase()))
                          ).slice(0, 6).map(t => (
                            <button key={t.id} onClick={() => attachTrack(a.id, t)}
                              className="w-full flex items-center gap-2 p-1.5 hover:bg-white/5 rounded-lg transition-colors text-left">
                              <img src={t.cover} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                              <span className="text-zinc-400 text-xs flex-1 truncate">{t.title} — {t.artist}</span>
                              <span className="text-blue-400 text-xs px-1.5 rounded bg-blue-500/10 shrink-0">+ Привязать</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────── PENDING ADMIN ─────────────────── */
function PendingAdmin() {
  const { submissions, moderateSubmission, updateSubmission, artists } = useStore();
  const pendingList = submissions.filter(s => s.status === 'pending' || s.status === 'deferred');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  const startEditSub = (sub: any) => { setEditingId(sub.id); setEditData({ ...sub }); };
  const saveEditSub = () => { updateSubmission(editingId!, editData); setEditingId(null); };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Модерация ({pendingList.length})</h1>

      {pendingList.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <CheckCircle size={48} className="mx-auto mb-3 text-green-500/30" />
          <p>Все заявки обработаны</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingList.map(sub => (
            <div key={sub.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sub.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-zinc-500/20 text-zinc-400'}`}>
                    {sub.status === 'pending' ? '⏳ На проверке' : '⏸ Отложено'}
                  </span>
                  <span className="text-zinc-600 text-xs">{sub.createdAt}</span>
                </div>
                <button onClick={() => editingId === sub.id ? setEditingId(null) : startEditSub(sub)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${editingId === sub.id ? 'bg-red-500/20 text-red-400' : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white'}`}>
                  {editingId === sub.id ? <><X size={14} /> Закрыть</> : <><Edit2 size={14} /> Редактировать</>}
                </button>
              </div>

              <div className="p-5">
                {editingId === sub.id ? (
                  /* ── EDIT FORM ── */
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Название трека</label>
                        <input value={editData.title} onChange={e => setEditData((d: any) => ({ ...d, title: e.target.value }))}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Артист</label>
                        <input list="artists-pending-list" value={editData.artist} onChange={e => setEditData((d: any) => ({ ...d, artist: e.target.value }))}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                        <datalist id="artists-pending-list">
                          {artists.map(a => <option key={a.id} value={a.name} />)}
                        </datalist>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Жанр</label>
                        <select value={editData.genre} onChange={e => setEditData((d: any) => ({ ...d, genre: e.target.value }))}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                          {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Год</label>
                        <input type="number" value={editData.year} onChange={e => setEditData((d: any) => ({ ...d, year: +e.target.value }))}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-zinc-500 block mb-1">Комментарий для пользователя</label>
                        <textarea value={editData.comment || ''} onChange={e => setEditData((d: any) => ({ ...d, comment: e.target.value }))} rows={2}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveEditSub} className="flex items-center gap-1.5 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 transition-colors">
                        <Save size={14} /> Сохранить изменения
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── VIEW ── */
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-white font-bold text-lg">{sub.title}</h3>
                      <p className="text-zinc-400 text-sm">{sub.artist} · {sub.genre} · {sub.year}</p>
                      {sub.comment && <p className="text-zinc-500 text-sm mt-2 italic bg-white/3 rounded-lg p-3">"{sub.comment}"</p>}
                    </div>

                    {rejectId === sub.id && (
                      <div className="space-y-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                        <label className="text-sm text-red-400 font-medium">Причина отклонения:</label>
                        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2}
                          placeholder="Объясните пользователю, почему трек не принят..."
                          className="w-full bg-zinc-900 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => { moderateSubmission(sub.id, 'reject', rejectReason); setRejectId(null); setRejectReason(''); }}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-400 transition-colors">
                            Подтвердить отклонение
                          </button>
                          <button onClick={() => setRejectId(null)} className="px-4 py-2 bg-white/10 rounded-lg text-sm text-zinc-400 hover:bg-white/15">Отмена</button>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => moderateSubmission(sub.id, 'approve')}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-xl text-sm transition-colors font-medium">
                        <CheckCircle size={16} /> Опубликовать
                      </button>
                      <button onClick={() => { setRejectId(sub.id); setRejectReason(''); }}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-sm transition-colors font-medium">
                        <XCircle size={16} /> Отклонить
                      </button>
                      <button onClick={() => moderateSubmission(sub.id, 'defer')}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-white/10 hover:bg-white/15 text-zinc-400 rounded-xl text-sm transition-colors">
                        <Timer size={16} /> Отложить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {submissions.filter(s => s.status === 'approved' || s.status === 'rejected').length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3 text-zinc-500">История обработанных</h2>
          <div className="space-y-2">
            {submissions.filter(s => s.status !== 'pending' && s.status !== 'deferred').map(sub => (
              <div key={sub.id} className="flex items-center gap-3 p-3 bg-white/3 rounded-xl">
                {sub.status === 'approved' ? <CheckCircle size={16} className="text-green-400 shrink-0" /> : <XCircle size={16} className="text-red-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{sub.title} — {sub.artist}</p>
                  {sub.rejectReason && <p className="text-red-400 text-xs truncate">{sub.rejectReason}</p>}
                </div>
                <span className="text-zinc-600 text-xs shrink-0">{sub.createdAt}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── USERS ADMIN ─────────────────── */
function UsersAdmin() {
  const { users, blockUser, promoteUser } = useStore();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Пользователи ({users.length})</h1>
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 p-4 bg-white/5 rounded-xl hover:bg-white/8 transition-colors">
            <img src={u.avatar} alt={u.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0 ring-2 ring-white/10" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-medium">{u.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-700 text-zinc-400'}`}>
                  {u.role === 'admin' ? '👑 Админ' : '👤 Пользователь'}
                </span>
                {u.isBlocked && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">🔒 Заблокирован</span>}
              </div>
              <p className="text-zinc-500 text-xs">{u.email} · Зарегистрирован {u.joinedAt}</p>
              <p className="text-zinc-600 text-xs">{u.likedTracks.length} лайков</p>
            </div>
            <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
              <button onClick={() => blockUser(u.id)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors font-medium ${u.isBlocked ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'}`}>
                {u.isBlocked ? 'Разблокировать' : 'Заблокировать'}
              </button>
              {u.role !== 'admin' && (
                <button onClick={() => promoteUser(u.id)} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs hover:bg-purple-500/30 transition-colors font-medium">
                  Повысить до Админа
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────── SITE ADMIN ─────────────────── */
function SiteAdmin() {
  const { tracks, heroTrackId, setHeroTrack } = useStore();
  const [search, setSearch] = useState('');
  const [bannerText, setBannerText] = useState('САЙТ НЕ РАБОТАЕТ НА ТЕРРИТОРИИ РОССИЙСКОЙ ФЕДЕРАЦИИ');
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [announcementText, setAnnouncementText] = useState('');
  const [featuredSection, setFeaturedSection] = useState({ showHero: true, showPopular: true, showNew: true, showArtists: true });

  const filtered = tracks.filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.artist.toLowerCase().includes(search.toLowerCase()));
  const heroTrack = tracks.find(t => t.id === heroTrackId);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black">Управление сайтом</h1>

      {/* RF Banner */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <AlertTriangle size={18} className="text-orange-400" /> Баннер-предупреждение
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <div className={`w-11 h-6 rounded-full transition-colors relative ${bannerEnabled ? 'bg-red-500' : 'bg-zinc-700'}`}
            onClick={() => setBannerEnabled(!bannerEnabled)}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${bannerEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-zinc-300">Показывать баннер</span>
        </label>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Текст баннера</label>
          <input value={bannerText} onChange={e => setBannerText(e.target.value)}
            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
        </div>
        {bannerEnabled && (
          <div className="bg-red-950/50 border border-red-500/40 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <span className="text-red-300 text-sm font-medium">{bannerText}</span>
          </div>
        )}
      </div>

      {/* Announcement */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Eye size={18} className="text-blue-400" /> Объявление на главной
        </h2>
        <textarea value={announcementText} onChange={e => setAnnouncementText(e.target.value)} rows={3}
          placeholder="Оставьте пустым, чтобы скрыть. Пример: Платформа работает в тестовом режиме..."
          className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none resize-none" />
        <button className="px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-sm transition-colors">Сохранить объявление</button>
      </div>

      {/* Sections visibility */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <EyeOff size={18} className="text-purple-400" /> Секции главной страницы
        </h2>
        <div className="space-y-3">
          {[
            { key: 'showHero', label: 'Hero-баннер (Трек дня)' },
            { key: 'showPopular', label: 'Популярные треки' },
            { key: 'showNew', label: 'Новинки' },
            { key: 'showArtists', label: 'Блок артистов' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-11 h-6 rounded-full transition-colors relative ${(featuredSection as any)[key] ? 'bg-red-500' : 'bg-zinc-700'}`}
                onClick={() => setFeaturedSection(s => ({ ...s, [key]: !(s as any)[key] }))}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(featuredSection as any)[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-zinc-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Hero track */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Star size={18} className="text-yellow-400" /> Трек дня (Hero-баннер)
        </h2>
        {heroTrack && (
          <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <img src={heroTrack.cover} alt={heroTrack.title} className="w-14 h-14 rounded-xl object-cover" />
            <div>
              <p className="text-white font-bold">{heroTrack.title}</p>
              <p className="text-zinc-400 text-sm">{heroTrack.artist} · {heroTrack.genre}</p>
            </div>
            <span className="ml-auto text-yellow-400 text-sm font-medium flex items-center gap-1"><Star size={14} /> Текущий</span>
          </div>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Поиск трека..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-800 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none" />
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {filtered.slice(0, 15).map(t => (
            <button key={t.id} onClick={() => setHeroTrack(t.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${heroTrackId === t.id ? 'bg-yellow-500/20 border border-yellow-500/30' : 'hover:bg-white/5 border border-transparent'}`}>
              <img src={t.cover} alt={t.title} className="w-10 h-10 rounded-lg object-cover shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-white text-sm font-medium truncate">{t.title}</p>
                <p className="text-zinc-500 text-xs">{t.artist} · {t.year}</p>
              </div>
              {heroTrackId === t.id && <Star size={14} className="text-yellow-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Genre stats */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Tag size={18} className="text-blue-400" /> Жанры и количество треков
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {GENRES.map(g => {
            const count = tracks.filter(t => t.genre === g).length;
            const pct = tracks.length > 0 ? (count / tracks.length) * 100 : 0;
            return (
              <div key={g} className="bg-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">{g}</span>
                  <span className="text-zinc-500 text-xs">{count}</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
