import { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStore, GENRES, type Track, type Artist } from '../store';
import { formatDuration, formatPlays } from '../utils/format';
import { API_BASE, apiUrl } from '../lib/api';
import {
  LayoutDashboard, Music, Users, Mic2, FileCheck, Settings,
  Search, Trash2, Edit3, Check, X, ChevronRight, ExternalLink,
  Activity, TrendingUp, Clock, Shield, ShieldOff, Image, Upload,
  Crown, User as UserIcon, Loader2, RefreshCw, AlertCircle, Link2, Unlink,
  Play, BarChart3, Globe, Ban, Home, Plus, Save, ArrowLeft,
} from 'lucide-react';

type Tab = 'dashboard' | 'tracks' | 'artists' | 'users' | 'moderation' | 'settings';

/* ── Transliteration helper ── */
const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .split('')
    .map(ch => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getToken() { return localStorage.getItem('gromko_token'); }
async function adminFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(apiUrl(path), { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ═══════════════════════════════════════════════ */
/*  ADMIN PANEL                                    */
/* ═══════════════════════════════════════════════ */

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const currentUser = useStore(s => s.currentUser);

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Доступ запрещён</h1>
          <p className="text-zinc-400">У вас нет прав администратора</p>
          <Link to="/" className="mt-4 inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300">
            <ArrowLeft className="w-4 h-4" /> На главную
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Обзор', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'tracks', label: 'Треки', icon: <Music className="w-4 h-4" /> },
    { id: 'artists', label: 'Артисты', icon: <Mic2 className="w-4 h-4" /> },
    { id: 'users', label: 'Пользователи', icon: <Users className="w-4 h-4" /> },
    { id: 'moderation', label: 'Модерация', icon: <FileCheck className="w-4 h-4" /> },
    { id: 'settings', label: 'Настройки', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 pb-12">
      {/* Header — own sticky bar, no Navbar overlap */}
      <div className="bg-zinc-900/90 backdrop-blur-xl border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-4">
          <Shield className="w-6 h-6 text-purple-500" />
          <h1 className="text-lg font-bold text-white">GROMQ Admin</h1>
          <div className="flex-1" />
          <Link to="/" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition">
            <Home className="w-3.5 h-3.5" /> На сайт
          </Link>
          <Link to="/profile" className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition">
            <img src={currentUser.avatar} alt="" className="w-6 h-6 rounded-full" />
            {currentUser.name}
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-[1400px] mx-auto px-4 mt-4">
        <div className="flex gap-1 bg-zinc-900/50 rounded-xl p-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                tab === t.id
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-4 mt-6">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'tracks' && <TracksTab />}
        {tab === 'artists' && <ArtistsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'moderation' && <ModerationTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  DASHBOARD TAB                                  */
/* ═══════════════════════════════════════════════ */

function DashboardTab() {
  const { adminStats, fetchAdminStats } = useStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchAdminStats().finally(() => setLoading(false));
    const iv = setInterval(() => fetchAdminStats(), 30_000);
    return () => clearInterval(iv);
  }, []);

  if (loading && !adminStats) return <LoadingSpinner text="Загрузка статистики..." />;
  if (!adminStats) return <EmptyState icon={<AlertCircle />} text="Не удалось загрузить статистику" />;
  const s = adminStats;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Треки" value={s.tracks} icon={<Music className="w-5 h-5" />} color="purple" />
        <StatCard label="Артисты" value={s.artists} icon={<Mic2 className="w-5 h-5" />} color="blue" />
        <StatCard label="Пользователи" value={s.users} icon={<Users className="w-5 h-5" />} color="emerald" />
        <StatCard label="Всего прослушиваний" value={formatPlays(s.totalPlays)} icon={<TrendingUp className="w-5 h-5" />} color="amber" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Сейчас слушают" value={s.activeListeners} icon={<Activity className="w-5 h-5 animate-pulse" />} color="green" subtitle="за 15 мин" />
        <StatCard label="Сегодня" value={formatPlays(s.playsToday)} icon={<Play className="w-5 h-5" />} color="sky" />
        <StatCard label="За неделю" value={formatPlays(s.playsWeek)} icon={<BarChart3 className="w-5 h-5" />} color="violet" />
        <StatCard label="За месяц" value={formatPlays(s.playsMonth)} icon={<Globe className="w-5 h-5" />} color="rose" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 rounded-xl p-5 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Статус треков</h3>
          <div className="space-y-2">
            <StatusRow label="Готовы" value={s.ready} color="bg-emerald-500" />
            <StatusRow label="Ожидают" value={s.pending} color="bg-yellow-500" />
            <StatusRow label="Обработка" value={s.processing} color="bg-blue-500" />
            <StatusRow label="Ошибки" value={s.errors} color="bg-red-500" />
          </div>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-5 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Модерация</h3>
          <div className="space-y-2">
            <StatusRow label="Заявки на модерацию" value={s.pendingSubmissions} color="bg-orange-500" />
            <StatusRow label="Новых за 7 дней" value={s.recentUsers} color="bg-cyan-500" />
          </div>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-5 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Топ жанров</h3>
          <div className="space-y-2">
            {(s.topGenres || []).slice(0, 5).map((g, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">{g.genre}</span>
                <span className="text-xs font-mono text-zinc-500">{g.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {s.topTracks && s.topTracks.length > 0 && (
        <div className="bg-zinc-900/60 rounded-xl p-5 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wide">Топ-10 треков</h3>
          <div className="space-y-1">
            {s.topTracks.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-800/40 transition">
                <span className="text-xs font-bold text-zinc-500 w-6 text-right">{i + 1}</span>
                {t.cover ? <img src={t.cover} alt="" className="w-9 h-9 rounded object-cover" /> : <div className="w-9 h-9 rounded bg-zinc-800 flex items-center justify-center"><Music className="w-4 h-4 text-zinc-600" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{t.title}</div>
                  <div className="text-xs text-zinc-500 truncate">{t.artist}</div>
                </div>
                <span className="text-xs font-mono text-zinc-400">{formatPlays(t.plays)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => fetchAdminStats()} className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition">
        <RefreshCw className="w-3.5 h-3.5" /> Обновить
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  TRACKS TAB — full detail editing               */
/* ═══════════════════════════════════════════════ */

function TracksTab() {
  const { tracks, artists, fetchTracks, updateTrack, deleteTrack } = useStore();
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => { fetchTracks(); }, []);

  const filtered = useMemo(() => {
    let list = [...tracks];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.id.includes(q));
    }
    if (genreFilter) list = list.filter(t => t.genre === genreFilter);
    if (artistFilter) list = list.filter(t =>
      t.artistSlug === artistFilter ||
      t.artists?.some(a => a.slug === artistFilter)
    );
    return list;
  }, [tracks, search, genreFilter, artistFilter]);

  const handleDelete = async (id: string) => {
    await deleteTrack(id);
    setConfirmDelete(null);
    setSelected(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      await adminFetch('/admin/tracks/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selected] }),
      });
      await fetchTracks();
      setSelected(new Set());
    } catch (e: any) {
      alert('Ошибка удаления: ' + e.message);
    }
    setBulkDeleting(false);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Edit modal */}
      {editTrack && (
        <TrackEditModal
          track={editTrack}
          onClose={() => setEditTrack(null)}
          onSave={async (data) => {
            await updateTrack(editTrack.id, data);
            await fetchTracks();
            setEditTrack(null);
          }}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию, артисту, ID..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <select value={genreFilter} onChange={e => setGenreFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none">
          <option value="">Все жанры</option>
          {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={artistFilter} onChange={e => { setArtistFilter(e.target.value); setSelected(new Set()); }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none max-w-[200px]">
          <option value="">Все артисты</option>
          {[...artists].sort((a, b) => a.name.localeCompare(b.name)).map(a => (
            <option key={a.slug} value={a.slug}>{a.name}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">{filtered.length} / {tracks.length}</span>
        <button onClick={() => fetchTracks()} className="p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-3">
          <span className="text-red-400 text-sm font-medium">Выбрано: {selected.size}</span>
          <button onClick={handleBulkDelete} disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition">
            {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Удалить выбранные
          </button>
          <button onClick={() => setSelected(new Set())} className="text-zinc-400 hover:text-white text-sm transition">Снять выделение</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
              <th className="p-3 w-8">
                <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll}
                  className="rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500 cursor-pointer" />
              </th>
              <th className="p-3 w-12"></th>
              <th className="p-3">Трек</th>
              <th className="p-3">Артист(ы)</th>
              <th className="p-3">Жанр</th>
              <th className="p-3">Год</th>
              <th className="p-3 text-right">Прослуш.</th>
              <th className="p-3 text-right">Длит.</th>
              <th className="p-3">Флаги</th>
              <th className="p-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition group ${selected.has(t.id) ? 'bg-purple-900/10' : ''}`}>
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                    className="rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500 cursor-pointer" />
                </td>
                <td className="p-3">
                  {t.cover ? <img src={t.cover} alt="" className="w-10 h-10 rounded object-cover" /> : <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center"><Music className="w-4 h-4 text-zinc-600" /></div>}
                </td>
                <td className="p-3">
                  <div className="text-white font-medium">{t.title}</div>
                  <div className="text-[10px] text-zinc-600 font-mono">{t.id.slice(0, 8)}...</div>
                </td>
                <td className="p-3">
                  {t.artists && t.artists.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {t.artists.map((a, i) => (
                        <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">{a.name}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-zinc-300 text-sm">{t.artist}</span>
                  )}
                </td>
                <td className="p-3"><span className="text-zinc-400 text-xs px-2 py-0.5 bg-zinc-800 rounded-full">{t.genre}</span></td>
                <td className="p-3 text-zinc-400">{t.year}</td>
                <td className="p-3 text-right text-zinc-400 font-mono text-xs">{formatPlays(t.plays)}</td>
                <td className="p-3 text-right text-zinc-400 text-xs">{formatDuration(t.duration)}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    {t.explicit && <span className="text-[10px] px-1.5 py-0.5 bg-red-900/50 text-red-400 rounded">18+</span>}
                    {t.isNew && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-900/50 text-emerald-400 rounded">NEW</span>}
                    {t.featured && <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/50 text-amber-400 rounded">★ Hero</span>}
                  </div>
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => setEditTrack(t)} className="p-1.5 rounded-lg hover:bg-purple-900/50 text-zinc-400 hover:text-purple-400 transition" title="Редактировать">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <a href={`/track/${t.id}`} target="_blank" className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition" title="Открыть на сайте">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {confirmDelete === t.id ? (
                      <>
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white transition"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setConfirmDelete(null)} className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition"><X className="w-3.5 h-3.5" /></button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(t.id)} className="p-1.5 rounded-lg hover:bg-red-900/50 text-zinc-400 hover:text-red-400 transition" title="Удалить"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-zinc-500 text-sm">Треки не найдены</div>}
      </div>
    </div>
  );
}

/* ─── Track Edit Modal ─── */

function TrackEditModal({ track, onClose, onSave }: { track: Track; onClose: () => void; onSave: (data: Partial<Track>) => Promise<void> }) {
  const [form, setForm] = useState({
    title: track.title,
    artist: track.artist,
    genre: track.genre,
    year: track.year,
    explicit: track.explicit || false,
    isNew: track.isNew || false,
    featured: track.featured || false,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-zinc-800">
          {track.cover ? <img src={track.cover} className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-zinc-800 flex items-center justify-center"><Music className="w-6 h-6 text-zinc-600" /></div>}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white truncate">Редактирование трека</h2>
            <p className="text-xs text-zinc-500 font-mono">{track.id}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Preview row */}
          <div className="flex items-center gap-4 bg-zinc-800/50 rounded-xl p-4">
            {track.cover ? <img src={track.cover} className="w-20 h-20 rounded-lg object-cover" /> : <div className="w-20 h-20 rounded-lg bg-zinc-800 flex items-center justify-center"><Music className="w-8 h-8 text-zinc-600" /></div>}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-400">Текущее состояние</div>
              <div className="text-white font-semibold">{track.title}</div>
              <div className="text-zinc-400 text-sm">{track.artist}</div>
              <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                <span>{formatDuration(track.duration)}</span>
                <span>{formatPlays(track.plays)} прослушиваний</span>
                <span>{track.likes} лайков</span>
              </div>
            </div>
          </div>

          {/* Artists */}
          {track.artists && track.artists.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2 block">Привязанные артисты</label>
              <div className="flex flex-wrap gap-2">
                {track.artists.map((a, i) => (
                  <a key={i} href={`/artist/${a.slug}`} target="_blank" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition">
                    <Mic2 className="w-3 h-3" /> {a.name} <ExternalLink className="w-3 h-3 text-zinc-500" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Streams info */}
          {track.streams && (
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2 block">Потоки</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(['low', 'medium', 'high', 'lossless'] as const).map(q => (
                  <div key={q} className={`px-3 py-2 rounded-lg text-xs ${track.streams?.[q] ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/30' : 'bg-zinc-800/50 text-zinc-600'}`}>
                    {q === 'low' ? '64 kbps' : q === 'medium' ? '128 kbps' : q === 'high' ? '256 kbps' : 'FLAC'}
                    {track.streams?.[q] ? ' ✓' : ' —'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Название">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="admin-input" />
            </FormField>
            <FormField label="Артист (текст)">
              <input value={form.artist} onChange={e => setForm(f => ({ ...f, artist: e.target.value }))} className="admin-input" />
            </FormField>
            <FormField label="Жанр">
              <select value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} className="admin-input">
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                {!GENRES.includes(form.genre) && <option value={form.genre}>{form.genre}</option>}
              </select>
            </FormField>
            <FormField label="Год">
              <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))} className="admin-input" />
            </FormField>
          </div>

          {/* Flags */}
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2 block">Флаги</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
                <input type="checkbox" checked={form.explicit} onChange={e => setForm(f => ({ ...f, explicit: e.target.checked }))} className="rounded border-zinc-600 bg-zinc-800 text-red-500 focus:ring-red-500" />
                🔞 Explicit (18+)
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
                <input type="checkbox" checked={form.isNew} onChange={e => setForm(f => ({ ...f, isNew: e.target.checked }))} className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500" />
                🆕 Новинка
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
                <input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                ⭐ Hero (главная)
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-5 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition">Отмена</button>
          <button onClick={save} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Сохранение...' : 'Сохранить изменения'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  ARTISTS TAB — rich cards with photo & tracks   */
/* ═══════════════════════════════════════════════ */

function ArtistsTab() {
  const { artists, tracks, fetchArtists, updateArtist, deleteArtist } = useStore();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { fetchArtists(); }, []);

  const filtered = useMemo(() => {
    if (!search) return artists;
    const q = search.toLowerCase();
    return artists.filter(a => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));
  }, [artists, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск артистов..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <span className="text-xs text-zinc-500">{filtered.length} артистов</span>
        <button onClick={() => fetchArtists()} className="p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="space-y-3">
        {filtered.map(a => (
          <ArtistCard
            key={a.id}
            artist={a}
            allTracks={tracks}
            isExpanded={expandedId === a.id}
            isEditing={editId === a.id}
            confirmingDelete={confirmDelete === a.id}
            onToggleExpand={() => setExpandedId(expandedId === a.id ? null : a.id)}
            onEdit={() => setEditId(editId === a.id ? null : a.id)}
            onCancelEdit={() => setEditId(null)}
            onSave={async (data) => {
              await updateArtist(a.id, data);
              await fetchArtists();
              setEditId(null);
            }}
            onDeleteConfirm={() => setConfirmDelete(a.id)}
            onDeleteCancel={() => setConfirmDelete(null)}
            onDelete={async () => {
              await deleteArtist(a.id);
              setConfirmDelete(null);
            }}
          />
        ))}
      </div>
      {filtered.length === 0 && <EmptyState icon={<Mic2 />} text="Артисты не найдены" />}
    </div>
  );
}

/* ─── Artist Card ─── */

function ArtistCard({ artist, allTracks, isExpanded, isEditing, confirmingDelete, onToggleExpand, onEdit, onCancelEdit, onSave, onDeleteConfirm, onDeleteCancel, onDelete }: {
  artist: Artist; allTracks: Track[];
  isExpanded: boolean; isEditing: boolean; confirmingDelete: boolean;
  onToggleExpand: () => void; onEdit: () => void; onCancelEdit: () => void;
  onSave: (data: Partial<Artist>) => Promise<void>;
  onDeleteConfirm: () => void; onDeleteCancel: () => void; onDelete: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: artist.name, slug: artist.slug, bio: artist.bio || '', genre: artist.genre || '',
    socials: artist.socials || { vk: '', instagram: '', telegram: '' },
  });
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null); // preview after upload
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [photoUrlSaving, setPhotoUrlSaving] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [localBanner, setLocalBanner] = useState<string | null>(null);
  const [bannerUrlInput, setBannerUrlInput] = useState('');
  const [bannerUrlSaving, setBannerUrlSaving] = useState(false);
  const [artistTracks, setArtistTracks] = useState<Track[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [linkTrackSearch, setLinkTrackSearch] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  const editPhotoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  // Current photo: local preview takes priority, then artist.photo
  const currentPhoto = localPhoto || artist.photo;
  const currentBanner = localBanner || artist.banner;

  /* Auto-generate slug when name changes */
  const updateName = (newName: string) => {
    setForm(f => ({ ...f, name: newName, slug: toSlug(newName) }));
  };

  // Load artist tracks when expanded
  useEffect(() => {
    if (isExpanded) {
      setTracksLoading(true);
      adminFetch(`/admin/artists/${artist.id}/tracks`)
        .then(data => setArtistTracks(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setTracksLoading(false));
    }
  }, [isExpanded, artist.id]);

  // Reset form on edit toggle
  useEffect(() => {
    if (isEditing) {
      setForm({
        name: artist.name, slug: artist.slug, bio: artist.bio || '', genre: artist.genre || '',
        socials: artist.socials || { vk: '', instagram: '', telegram: '' },
      });
    }
  }, [isEditing]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await adminFetch(`/admin/artists/${artist.id}/photo`, { method: 'POST', body: fd });
      // Set local preview with cache-bust
      setLocalPhoto(res.photo ? `${res.photo}?t=${Date.now()}` : null);
      useStore.getState().fetchArtists();
    } catch (err) { console.error(err); }
    setPhotoUploading(false);
    if (editPhotoRef.current) editPhotoRef.current.value = '';
    if (photoRef.current) photoRef.current.value = '';
  };

  const handlePhotoUrl = async () => {
    const url = photoUrlInput.trim();
    if (!url) return;
    setPhotoUrlSaving(true);
    try {
      await adminFetch(`/admin/artists/${artist.id}/photo-url`, { method: 'PUT', body: JSON.stringify({ url }) });
      setLocalPhoto(url);
      setPhotoUrlInput('');
      useStore.getState().fetchArtists();
    } catch (err) { console.error(err); }
    setPhotoUrlSaving(false);
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    try {
      const fd = new FormData();
      fd.append('banner', file);
      const res = await adminFetch(`/admin/artists/${artist.id}/banner`, { method: 'POST', body: fd });
      setLocalBanner(res.banner ? `${res.banner}?t=${Date.now()}` : null);
      useStore.getState().fetchArtists();
    } catch (err) { console.error(err); }
    setBannerUploading(false);
    if (bannerRef.current) bannerRef.current.value = '';
  };

  const handleBannerUrl = async () => {
    const url = bannerUrlInput.trim();
    if (!url) return;
    setBannerUrlSaving(true);
    try {
      await adminFetch(`/admin/artists/${artist.id}/banner-url`, { method: 'PUT', body: JSON.stringify({ url }) });
      setLocalBanner(url);
      setBannerUrlInput('');
      useStore.getState().fetchArtists();
    } catch (err) { console.error(err); }
    setBannerUrlSaving(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  const handleLinkTrack = async (trackId: string) => {
    await adminFetch(`/admin/artists/${artist.id}/tracks`, { method: 'POST', body: JSON.stringify({ trackId }) });
    const data = await adminFetch(`/admin/artists/${artist.id}/tracks`);
    setArtistTracks(Array.isArray(data) ? data : []);
    useStore.getState().fetchArtists();
  };

  const handleUnlinkTrack = async (trackId: string) => {
    await adminFetch(`/admin/artists/${artist.id}/tracks/${trackId}`, { method: 'DELETE' });
    setArtistTracks(prev => prev.filter(t => t.id !== trackId));
    useStore.getState().fetchArtists();
  };

  const availableTracks = useMemo(() => {
    const linkedIds = new Set(artistTracks.map(t => t.id));
    let list = allTracks.filter(t => !linkedIds.has(t.id));
    if (linkTrackSearch) {
      const q = linkTrackSearch.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
    }
    return list.slice(0, 10);
  }, [allTracks, artistTracks, linkTrackSearch]);

  return (
    <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 overflow-hidden hover:border-zinc-700 transition">
      {/* Header row */}
      <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={onToggleExpand}>
        <div className="relative group shrink-0">
          {currentPhoto ? (
            <img src={currentPhoto} alt={artist.name} className="w-16 h-16 rounded-xl object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center">
              <Mic2 className="w-7 h-7 text-zinc-600" />
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); photoRef.current?.click(); }}
            className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition"
          >
            {photoUploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Image className="w-5 h-5 text-white" />}
          </button>
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg">{artist.name}</span>
            <span className="text-xs text-zinc-600 font-mono">/{artist.slug}</span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-zinc-400">
            <span>{artist.genre || 'Без жанра'}</span>
            <span>{artist.tracksCount} треков</span>
            <span>{formatPlays(artist.totalPlays)} прослуш.</span>
            {artist.socials?.vk && <span>VK</span>}
            {artist.socials?.telegram && <span>TG</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          <a href={`/artist/${artist.slug}`} target="_blank" className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition" title="На сайте">
            <ExternalLink className="w-4 h-4" />
          </a>
          <button onClick={onEdit} className="p-2 rounded-lg hover:bg-purple-900/50 text-zinc-400 hover:text-purple-400 transition" title="Редактировать">
            <Edit3 className="w-4 h-4" />
          </button>
          {confirmingDelete ? (
            <>
              <button onClick={onDelete} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs transition">Удалить</button>
              <button onClick={onDeleteCancel} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-white text-xs transition">Отмена</button>
            </>
          ) : (
            <button onClick={onDeleteConfirm} className="p-2 rounded-lg hover:bg-red-900/50 text-zinc-400 hover:text-red-400 transition" title="Удалить">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <ChevronRight className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {/* Expanded: Edit form + Tracks management */}
      {(isExpanded || isEditing) && (
        <div className="border-t border-zinc-800">
          {/* Edit form */}
          {isEditing && (
            <div className="p-4 bg-zinc-800/30 space-y-4">
              <div className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-2">Редактирование карточки</div>

              {/* ── Photo upload section ── */}
              <div className="flex items-start gap-5">
                <div className="shrink-0">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-2">Фото артиста</div>
                  <div className="relative group w-28 h-28">
                    {currentPhoto ? (
                      <img src={currentPhoto} alt={artist.name} className="w-28 h-28 rounded-xl object-cover border border-zinc-700" />
                    ) : (
                      <div className="w-28 h-28 rounded-xl bg-zinc-800 border border-zinc-700 border-dashed flex flex-col items-center justify-center">
                        <Image className="w-8 h-8 text-zinc-600 mb-1" />
                        <span className="text-[10px] text-zinc-600">Нет фото</span>
                      </div>
                    )}
                    <button
                      onClick={() => editPhotoRef.current?.click()}
                      className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    >
                      {photoUploading ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-white mb-1" />
                          <span className="text-[10px] text-white/80">{currentPhoto ? 'Заменить' : 'Загрузить'}</span>
                        </>
                      )}
                    </button>
                    <input ref={editPhotoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </div>
                </div>
                <div className="flex-1 space-y-3 pt-6">
                  <div className="text-xs text-zinc-500">
                    <p>Загрузите фото или вставьте ссылку. JPG, PNG, WebP.</p>
                    <p className="mt-0.5">Рекомендуемый размер: не менее 400×400 px.</p>
                    {currentPhoto && <p className="mt-1.5 text-emerald-500/80">✓ Фото установлено</p>}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={photoUrlInput}
                      onChange={e => setPhotoUrlInput(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <button
                      onClick={handlePhotoUrl}
                      disabled={!photoUrlInput.trim() || photoUrlSaving}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition disabled:opacity-40"
                    >
                      {photoUrlSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                      Применить
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Banner upload section ── */}
              <div className="flex items-start gap-5">
                <div className="shrink-0">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-2">Баннер (фон)</div>
                  <div className="relative group w-48 h-24">
                    {currentBanner ? (
                      <img src={currentBanner} alt="banner" className="w-48 h-24 rounded-xl object-cover border border-zinc-700" />
                    ) : (
                      <div className="w-48 h-24 rounded-xl bg-zinc-800 border border-zinc-700 border-dashed flex flex-col items-center justify-center">
                        <Image className="w-6 h-6 text-zinc-600 mb-1" />
                        <span className="text-[10px] text-zinc-600">Используется аватарка</span>
                      </div>
                    )}
                    <button
                      onClick={() => bannerRef.current?.click()}
                      className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    >
                      {bannerUploading ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-white mb-1" />
                          <span className="text-[10px] text-white/80">{currentBanner ? 'Заменить' : 'Загрузить'}</span>
                        </>
                      )}
                    </button>
                    <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                  </div>
                </div>
                <div className="flex-1 space-y-3 pt-6">
                  <div className="text-xs text-zinc-500">
                    <p>Широкое фото для фона на странице артиста. Если не задан — используется аватарка.</p>
                    <p className="mt-0.5">Рекомендуемый размер: 1920×600 px.</p>
                    {currentBanner && <p className="mt-1.5 text-emerald-500/80">✓ Баннер установлен</p>}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={bannerUrlInput}
                      onChange={e => setBannerUrlInput(e.target.value)}
                      placeholder="https://example.com/banner.jpg"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <button
                      onClick={handleBannerUrl}
                      disabled={!bannerUrlInput.trim() || bannerUrlSaving}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition disabled:opacity-40"
                    >
                      {bannerUrlSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                      Применить
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Fields ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Имя артиста">
                  <input value={form.name} onChange={e => updateName(e.target.value)} className="admin-input" />
                </FormField>
                <FormField label="URL (авто)">
                  <div className="admin-input bg-zinc-800/60 text-zinc-400 cursor-default flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span>/artist/{form.slug || '...'}</span>
                  </div>
                </FormField>
                <FormField label="Жанр">
                  <select value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} className="admin-input">
                    <option value="">Выбрать</option>
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                    {form.genre && !GENRES.includes(form.genre) && <option value={form.genre}>{form.genre}</option>}
                  </select>
                </FormField>
                <FormField label="VK">
                  <input value={form.socials?.vk || ''} onChange={e => setForm(f => ({ ...f, socials: { ...f.socials, vk: e.target.value } }))} placeholder="https://vk.com/..." className="admin-input" />
                </FormField>
                <FormField label="Telegram">
                  <input value={form.socials?.telegram || ''} onChange={e => setForm(f => ({ ...f, socials: { ...f.socials, telegram: e.target.value } }))} placeholder="https://t.me/..." className="admin-input" />
                </FormField>
                <FormField label="Instagram">
                  <input value={form.socials?.instagram || ''} onChange={e => setForm(f => ({ ...f, socials: { ...f.socials, instagram: e.target.value } }))} placeholder="https://instagram.com/..." className="admin-input" />
                </FormField>
              </div>
              <FormField label="Биография">
                <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={4} className="admin-input resize-none" placeholder="О артисте..." />
              </FormField>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button onClick={onCancelEdit} className="px-4 py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm transition">Отмена</button>
              </div>
            </div>
          )}

          {/* Tracks linked to this artist */}
          {isExpanded && (
            <div className="p-4 space-y-3">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Релизы ({artistTracks.length})</div>
              {tracksLoading ? (
                <div className="text-center py-4"><Loader2 className="w-5 h-5 text-purple-500 animate-spin mx-auto" /></div>
              ) : artistTracks.length === 0 ? (
                <p className="text-sm text-zinc-500">Нет привязанных треков</p>
              ) : (
                <div className="space-y-1">
                  {artistTracks.map(t => (
                    <div key={t.id} className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-zinc-800/40 transition group">
                      {t.cover ? <img src={t.cover} className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center"><Music className="w-3 h-3 text-zinc-600" /></div>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{t.title}</div>
                        <div className="text-[10px] text-zinc-500">{t.genre} · {t.year}</div>
                      </div>
                      <span className="text-xs font-mono text-zinc-500">{formatPlays(t.plays)}</span>
                      <button onClick={() => handleUnlinkTrack(t.id)} className="p-1 rounded hover:bg-red-900/50 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition" title="Отвязать">
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Link new track */}
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <div className="text-xs text-zinc-500 mb-2 flex items-center gap-1"><Link2 className="w-3 h-3" /> Привязать трек</div>
                <input value={linkTrackSearch} onChange={e => setLinkTrackSearch(e.target.value)} placeholder="Поиск трека для привязки..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500 mb-2" />
                {linkTrackSearch && availableTracks.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {availableTracks.map(t => (
                      <button key={t.id} onClick={() => { handleLinkTrack(t.id); setLinkTrackSearch(''); }}
                        className="w-full flex items-center gap-2 py-1.5 px-3 rounded-lg hover:bg-purple-900/30 text-left transition">
                        <Plus className="w-3 h-3 text-purple-400 shrink-0" />
                        <span className="text-sm text-white truncate">{t.title}</span>
                        <span className="text-xs text-zinc-500 shrink-0">— {t.artist}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  USERS TAB                                      */
/* ═══════════════════════════════════════════════ */

function UsersTab() {
  const { adminUsers, fetchAdminUsers, blockUser, promoteUser, adminStats, fetchAdminStats } = useStore();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAdminUsers(), fetchAdminStats()]).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return adminUsers;
    const q = search.toLowerCase();
    return adminUsers.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [adminUsers, search]);

  if (loading && adminUsers.length === 0) return <LoadingSpinner text="Загрузка пользователей..." />;

  return (
    <div className="space-y-4">
      {adminStats && (
        <div className="bg-gradient-to-r from-emerald-900/30 to-zinc-900/30 rounded-xl border border-emerald-800/30 p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Activity className="w-6 h-6 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{adminStats.activeListeners}</div>
            <div className="text-sm text-zinc-400">слушают прямо сейчас</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-lg font-bold text-white">{adminStats.users}</div>
            <div className="text-xs text-zinc-500">всего</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <span className="text-xs text-zinc-500">{filtered.length}</span>
        <button onClick={() => fetchAdminUsers()} className="p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
              <th className="p-3">Пользователь</th>
              <th className="p-3">Email</th>
              <th className="p-3">Роль</th>
              <th className="p-3 text-right">Лайки</th>
              <th className="p-3 text-right">Прослушиваний</th>
              <th className="p-3">Активность</th>
              <th className="p-3">Регистрация</th>
              <th className="p-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition ${u.isBlocked ? 'opacity-50' : ''}`}>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <img src={u.avatar || ''} alt="" className="w-8 h-8 rounded-full object-cover bg-zinc-800" />
                    <span className="text-white font-medium">{u.name}</span>
                    {u.isBlocked && <Ban className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                </td>
                <td className="p-3 text-zinc-400 text-xs">{u.email}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'admin' ? 'bg-purple-900/50 text-purple-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    {u.role === 'admin' ? '👑 admin' : 'user'}
                  </span>
                </td>
                <td className="p-3 text-right text-zinc-400 font-mono text-xs">{u.likesCount}</td>
                <td className="p-3 text-right text-zinc-400 font-mono text-xs">{formatPlays(u.totalPlays)}</td>
                <td className="p-3 text-zinc-500 text-xs">
                  {u.lastActive ? new Date(u.lastActive).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td className="p-3 text-zinc-500 text-xs">{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => promoteUser(u.id)} title={u.role === 'admin' ? 'Снять админа' : 'Назначить админом'} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-amber-400 transition"><Crown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => blockUser(u.id)} title={u.isBlocked ? 'Разблокировать' : 'Заблокировать'} className={`p-1.5 rounded-lg transition ${u.isBlocked ? 'hover:bg-emerald-900/50 text-emerald-400' : 'hover:bg-red-900/50 text-zinc-400 hover:text-red-400'}`}>
                      {u.isBlocked ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-zinc-500 text-sm">Не найдено</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  MODERATION TAB                                 */
/* ═══════════════════════════════════════════════ */

function ModerationTab() {
  const { adminSubmissions, fetchAdminSubmissions, moderateSubmission } = useStore();
  const [loading, setLoading] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('pending');

  useEffect(() => { setLoading(true); fetchAdminSubmissions().finally(() => setLoading(false)); }, []);

  const filtered = useMemo(() => {
    if (!filterStatus) return adminSubmissions;
    return adminSubmissions.filter(s => s.status === filterStatus);
  }, [adminSubmissions, filterStatus]);

  if (loading && adminSubmissions.length === 0) return <LoadingSpinner text="Загрузка заявок..." />;

  const statusColors: Record<string, string> = { pending: 'bg-yellow-900/50 text-yellow-400', approved: 'bg-emerald-900/50 text-emerald-400', rejected: 'bg-red-900/50 text-red-400', deferred: 'bg-zinc-700 text-zinc-400' };
  const statusLabels: Record<string, string> = { pending: 'Ожидает', approved: 'Одобрено', rejected: 'Отклонено', deferred: 'Отложено' };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        {['', 'pending', 'approved', 'rejected', 'deferred'].map(st => (
          <button key={st || 'all'} onClick={() => setFilterStatus(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterStatus === st ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {st ? statusLabels[st] : 'Все'} ({adminSubmissions.filter(s => !st || s.status === st).length})
          </button>
        ))}
        <button onClick={() => fetchAdminSubmissions()} className="ml-auto p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FileCheck />} text="Заявок нет" />
      ) : (
        <div className="space-y-3">
          {filtered.map(sub => (
            <div key={sub.id} className="bg-zinc-900/60 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0"><Music className="w-5 h-5 text-zinc-500" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold">{sub.title}</span>
                    <span className="text-zinc-500">—</span>
                    <span className="text-zinc-300">{sub.artist}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[sub.status]}`}>{statusLabels[sub.status]}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-zinc-500">
                    <span>{sub.genre}</span><span>{sub.year}</span><span>{sub.originalFilename}</span>
                    <span>{new Date(sub.createdAt).toLocaleDateString('ru-RU')}</span>
                  </div>
                  {sub.comment && <p className="mt-2 text-sm text-zinc-400 bg-zinc-800/50 rounded-lg px-3 py-2">💬 {sub.comment}</p>}
                  {sub.rejectReason && <p className="mt-2 text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">❌ {sub.rejectReason}</p>}
                  <div className="mt-3 flex items-center gap-2">
                    <img src={sub.user.avatar || ''} alt="" className="w-5 h-5 rounded-full bg-zinc-800" />
                    <span className="text-xs text-zinc-400">{sub.user.name}</span>
                    <span className="text-xs text-zinc-600">{sub.user.email}</span>
                  </div>
                </div>
                {(sub.status === 'pending' || sub.status === 'deferred') && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={async () => { setProcessing(sub.id); await moderateSubmission(sub.id, 'approve'); setProcessing(null); }} disabled={processing === sub.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition disabled:opacity-50">
                      {processing === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Одобрить
                    </button>
                    {rejectId === sub.id ? (
                      <div className="space-y-1.5">
                        <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Причина..." className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white" />
                        <div className="flex gap-1">
                          <button onClick={async () => { setProcessing(sub.id); await moderateSubmission(sub.id, 'reject', rejectReason); setRejectId(null); setRejectReason(''); setProcessing(null); }} disabled={processing === sub.id}
                            className="flex-1 px-2 py-1 rounded bg-red-600 text-white text-xs transition disabled:opacity-50">Отклонить</button>
                          <button onClick={() => { setRejectId(null); setRejectReason(''); }} className="px-2 py-1 rounded bg-zinc-700 text-white text-xs">✕</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setRejectId(sub.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-800/50 text-red-400 text-xs font-medium transition">
                        <X className="w-3 h-3" /> Отклонить
                      </button>
                    )}
                    {sub.status === 'pending' && (
                      <button onClick={async () => { setProcessing(sub.id); await moderateSubmission(sub.id, 'defer'); setProcessing(null); }} disabled={processing === sub.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-medium transition disabled:opacity-50">
                        <Clock className="w-3 h-3" /> Отложить
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  SETTINGS TAB                                   */
/* ═══════════════════════════════════════════════ */

function SettingsTab() {
  const { tracks, artists, fetchTracks, updateTrack } = useStore();
  const [heroId, setHeroId] = useState('');
  const [heroArtistSlug, setHeroArtistSlug] = useState('');
  const [heroSearch, setHeroSearch] = useState('');
  const currentFeatured = tracks.find(t => t.featured);

  /* ── S3 Import state ── */
  const [importArtist, setImportArtist] = useState('');
  const [importLimit, setImportLimit] = useState(30);
  const [importSkipExisting, setImportSkipExisting] = useState(true);
  const [importRunning, setImportRunning] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importPolling, setImportPolling] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Poll import status
  useEffect(() => {
    if (!importPolling) return;
    const iv = setInterval(async () => {
      try {
        const data = await adminFetch('/admin/s3-import/status');
        setImportLog(data.log || []);
        setImportRunning(data.running);
        if (!data.running) setImportPolling(false);
      } catch {}
    }, 2000);
    return () => clearInterval(iv);
  }, [importPolling]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [importLog]);

  // Check if import already running on mount
  useEffect(() => {
    adminFetch('/admin/s3-import/status').then(data => {
      if (data.running) {
        setImportRunning(true);
        setImportPolling(true);
        setImportLog(data.log || []);
      }
    }).catch(() => {});
  }, []);

  const startImport = async () => {
    try {
      setImportLog(['Запуск импорта...']);
      setImportRunning(true);
      await adminFetch('/admin/s3-import', {
        method: 'POST',
        body: JSON.stringify({
          limit: importLimit || 0,
          artist: importArtist.trim() || undefined,
          skipExisting: importSkipExisting,
        }),
      });
      setImportPolling(true);
    } catch (err: any) {
      setImportLog(prev => [...prev, `❌ ${err.message}`]);
      setImportRunning(false);
    }
  };

  const stopImport = async () => {
    try {
      await adminFetch('/admin/s3-import/stop', { method: 'POST' });
      setImportLog(prev => [...prev, '⛔ Остановка...']);
    } catch (err: any) {
      setImportLog(prev => [...prev, `❌ ${err.message}`]);
    }
  };

  const setFeatured = async () => {
    if (!heroId) return;
    if (currentFeatured) await updateTrack(currentFeatured.id, { featured: false });
    await updateTrack(heroId, { featured: true });
    await fetchTracks();
    setHeroId('');
  };

  return (
    <div className="space-y-6">
      {/* S3 Import — full width */}
      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Upload className="w-5 h-5 text-purple-400" />
          Импорт из S3
        </h3>
        <p className="text-xs text-zinc-500 mb-4">Перенос треков из Yandex Object Storage в базу</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Artist filter */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Артист (имя папки в S3)</label>
            <input
              type="text"
              value={importArtist}
              onChange={e => setImportArtist(e.target.value)}
              placeholder="Все артисты"
              disabled={importRunning}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 disabled:opacity-50"
            />
          </div>

          {/* Limit */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Лимит треков (0 = без лимита)</label>
            <input
              type="number"
              value={importLimit}
              onChange={e => setImportLimit(Number(e.target.value))}
              min={0}
              disabled={importRunning}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
            />
          </div>

          {/* Skip existing + buttons */}
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={importSkipExisting}
                onChange={e => setImportSkipExisting(e.target.checked)}
                disabled={importRunning}
                className="accent-purple-500"
              />
              <span className="text-sm text-zinc-300">Пропускать уже загруженные</span>
            </label>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={startImport}
            disabled={importRunning}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importRunning ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Импорт выполняется...</>
            ) : (
              <><Play className="w-4 h-4" /> Запустить импорт</>
            )}
          </button>
          {importRunning && (
            <button
              onClick={stopImport}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition"
            >
              <Ban className="w-4 h-4" /> Остановить
            </button>
          )}
        </div>

        {/* Import log */}
        {importLog.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500">Лог импорта ({importLog.length} строк)</span>
              <div className="flex items-center gap-3">
                {importRunning && <span className="flex items-center gap-1 text-xs text-purple-400"><Loader2 className="w-3 h-3 animate-spin" /> В процессе</span>}
                {!importRunning && importLog.length > 0 && (
                  <button onClick={() => setImportLog([])} className="text-xs text-zinc-600 hover:text-zinc-400 transition">Очистить</button>
                )}
              </div>
            </div>
            <div
              ref={logRef}
              className="bg-black/50 rounded-lg border border-zinc-800 p-3 h-80 overflow-y-auto font-mono text-xs leading-relaxed"
            >
              {importLog.map((line, i) => (
                <div
                  key={i}
                  className={`${
                    line.includes('✅') ? 'text-green-400' :
                    line.includes('❌') ? 'text-red-400' :
                    line.includes('⚠') ? 'text-yellow-400' :
                    line.includes('⛔') ? 'text-orange-400' :
                    line.includes('⏭') ? 'text-zinc-600' :
                    'text-zinc-400'
                  }`}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rest of settings — constrained width */}
      <div className="max-w-2xl space-y-6">
      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Главный трек (Hero)</h3>
        <p className="text-sm text-zinc-400 mb-4">
          Трек для секции Hero на главной странице.
          {currentFeatured && <span className="block mt-1 text-purple-400">Сейчас: «{currentFeatured.title}» — {currentFeatured.artist}</span>}
        </p>

        {/* Search filter */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={heroSearch}
            onChange={e => { setHeroSearch(e.target.value); setHeroArtistSlug(''); setHeroId(''); }}
            placeholder="Поиск артиста или трека..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        {/* Artist chips */}
        {(() => {
          const q = heroSearch.toLowerCase().trim();
          const matchedArtists = q
            ? artists.filter(a => a.name.toLowerCase().includes(q))
            : artists;
          const matchedTracks = q
            ? tracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
            : [];

          // If an artist is selected, show their tracks
          if (heroArtistSlug) {
            const sel = artists.find(a => a.slug === heroArtistSlug);
            const artistTrks = tracks.filter(t =>
              t.artists?.some(a => a.slug === heroArtistSlug) || t.artistSlug === heroArtistSlug
            );
            return (
              <div className="space-y-2">
                <button onClick={() => { setHeroArtistSlug(''); setHeroId(''); }}
                  className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition mb-1">
                  <ArrowLeft className="w-3 h-3" /> К списку артистов
                </button>
                {sel && (
                  <div className="flex items-center gap-3 mb-3 bg-zinc-800/50 rounded-lg p-3">
                    {sel.photo && <img src={sel.photo} alt={sel.name} className="w-10 h-10 rounded-full object-cover" />}
                    <div>
                      <div className="text-white font-semibold text-sm">{sel.name}</div>
                      <div className="text-zinc-500 text-xs">{artistTrks.length} треков</div>
                    </div>
                  </div>
                )}
                <div className="max-h-60 overflow-y-auto space-y-0.5 rounded-lg border border-zinc-800 bg-zinc-800/30 p-1">
                  {artistTrks.length === 0 && <div className="text-center text-zinc-500 text-sm py-4">Нет треков</div>}
                  {artistTrks.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setHeroId(t.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${heroId === t.id ? 'bg-purple-600/30 ring-1 ring-purple-500' : 'hover:bg-zinc-700/50'}`}
                    >
                      {t.cover ? <img src={t.cover} className="w-9 h-9 rounded object-cover shrink-0" /> : <div className="w-9 h-9 rounded bg-zinc-700 flex items-center justify-center shrink-0"><Music className="w-4 h-4 text-zinc-500" /></div>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{t.title}</div>
                        <div className="text-[10px] text-zinc-500">{t.genre} · {t.year}</div>
                      </div>
                      {t.featured && <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/50 text-amber-400 rounded shrink-0">★ Hero</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          }

          // Show direct track matches from search
          if (q && matchedTracks.length > 0) {
            return (
              <div className="space-y-2">
                {matchedArtists.length > 0 && (
                  <>
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Артисты</div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {matchedArtists.slice(0, 12).map(a => (
                        <button key={a.id} onClick={() => { setHeroArtistSlug(a.slug); setHeroId(''); }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition">
                          {a.photo && <img src={a.photo} alt={a.name} className="w-6 h-6 rounded-full object-cover" />}
                          <span className="text-sm text-white">{a.name}</span>
                          <span className="text-[10px] text-zinc-500">{a.tracksCount}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Треки</div>
                <div className="max-h-52 overflow-y-auto space-y-0.5 rounded-lg border border-zinc-800 bg-zinc-800/30 p-1">
                  {matchedTracks.slice(0, 20).map(t => (
                    <button
                      key={t.id}
                      onClick={() => setHeroId(t.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${heroId === t.id ? 'bg-purple-600/30 ring-1 ring-purple-500' : 'hover:bg-zinc-700/50'}`}
                    >
                      {t.cover ? <img src={t.cover} className="w-9 h-9 rounded object-cover shrink-0" /> : <div className="w-9 h-9 rounded bg-zinc-700 flex items-center justify-center shrink-0"><Music className="w-4 h-4 text-zinc-500" /></div>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{t.title}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{t.artist} · {t.genre}</div>
                      </div>
                      {t.featured && <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/50 text-amber-400 rounded shrink-0">★ Hero</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          }

          // Default: show artist grid
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto p-1">
              {matchedArtists.map(a => (
                <button key={a.id} onClick={() => { setHeroArtistSlug(a.slug); setHeroId(''); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 bg-zinc-800/60 hover:bg-zinc-700/60 rounded-xl transition text-left">
                  {a.photo ? (
                    <img src={a.photo} alt={a.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center shrink-0"><Mic2 className="w-4 h-4 text-zinc-500" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">{a.name}</div>
                    <div className="text-[10px] text-zinc-500">{a.tracksCount} треков</div>
                  </div>
                </button>
              ))}
              {matchedArtists.length === 0 && <div className="col-span-full text-center text-zinc-500 text-sm py-4">Нет артистов</div>}
            </div>
          );
        })()}

        {/* Set button */}
        {heroId && (
          <div className="mt-4 flex items-center gap-3 bg-zinc-800/50 rounded-lg p-3">
            {(() => { const t = tracks.find(tr => tr.id === heroId); return t ? (
              <>
                {t.cover && <img src={t.cover} className="w-10 h-10 rounded object-cover" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">{t.title}</div>
                  <div className="text-xs text-zinc-400">{t.artist}</div>
                </div>
              </>
            ) : null; })()}
            <button onClick={setFeatured} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition shrink-0">Установить</button>
          </div>
        )}
      </div>

      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Быстрые ссылки</h3>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition"><Home className="w-4 h-4" /> Главная</Link>
          <Link to="/tracks" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition"><Music className="w-4 h-4" /> Все треки</Link>
          <Link to="/artists" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition"><Mic2 className="w-4 h-4" /> Все артисты</Link>
          <Link to="/genres" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition"><BarChart3 className="w-4 h-4" /> Жанры</Link>
          <Link to="/submit" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition"><Upload className="w-4 h-4" /> Загрузка трека</Link>
          <Link to="/profile" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition"><UserIcon className="w-4 h-4" /> Профиль</Link>
        </div>
      </div>

      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Система</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-zinc-400"><span>API</span><span className="text-zinc-300 font-mono text-xs">{API_BASE}</span></div>
          <div className="flex justify-between text-zinc-400"><span>Фронтенд</span><span className="text-zinc-300 font-mono text-xs">React + Vite + Tailwind</span></div>
          <div className="flex justify-between text-zinc-400"><span>Бэкенд</span><span className="text-zinc-300 font-mono text-xs">Express + PostgreSQL + S3</span></div>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  SHARED COMPONENTS                              */
/* ═══════════════════════════════════════════════ */

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon, color, subtitle }: { label: string; value: string | number; icon: React.ReactNode; color: string; subtitle?: string }) {
  const cm: Record<string, string> = {
    purple: 'from-purple-500/20 to-transparent border-purple-500/20 text-purple-400',
    blue: 'from-blue-500/20 to-transparent border-blue-500/20 text-blue-400',
    emerald: 'from-emerald-500/20 to-transparent border-emerald-500/20 text-emerald-400',
    amber: 'from-amber-500/20 to-transparent border-amber-500/20 text-amber-400',
    green: 'from-green-500/20 to-transparent border-green-500/20 text-green-400',
    sky: 'from-sky-500/20 to-transparent border-sky-500/20 text-sky-400',
    violet: 'from-violet-500/20 to-transparent border-violet-500/20 text-violet-400',
    rose: 'from-rose-500/20 to-transparent border-rose-500/20 text-rose-400',
  };
  return (
    <div className={`bg-gradient-to-br ${cm[color] || cm.purple} rounded-xl border p-4`}>
      <div className="flex items-center gap-2 mb-2 opacity-70">{icon}<span className="text-xs">{label}</span></div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {subtitle && <div className="text-[10px] text-zinc-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function StatusRow({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="flex items-center gap-3"><div className={`w-2 h-2 rounded-full ${color}`} /><span className="text-sm text-zinc-300 flex-1">{label}</span><span className="text-sm font-mono text-zinc-400">{value}</span></div>;
}

function LoadingSpinner({ text }: { text: string }) {
  return <div className="flex items-center justify-center py-20"><div className="text-center"><Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-3" /><p className="text-sm text-zinc-500">{text}</p></div></div>;
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-center justify-center py-16"><div className="text-center text-zinc-500"><div className="w-12 h-12 mx-auto mb-3 opacity-30">{icon}</div><p className="text-sm">{text}</p></div></div>;
}
