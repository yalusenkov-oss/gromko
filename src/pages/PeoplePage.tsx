import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { apiUrl } from '../lib/api';
import {
  Radio,
  Headphones,
  Music,
  Users,
  Search,
  Wifi,
} from 'lucide-react';
import { Equalizer } from '../components/lk/Equalizer';

/* ── Types ── */

interface ListeningUser {
  id: string;
  name: string;
  username: string | null;
  avatar: string;
  isOnline: boolean;
  listeningTrack: { title: string; artist: string; cover: string } | null;
  hasRoom: boolean;
}

interface PublicRoom {
  hostId: string;
  hostName: string;
  hostAvatar: string;
  trackTitle: string;
  trackArtist: string;
  trackCover: string;
  listenersCount: number;
  listeners: { userId: string; name: string; avatar: string }[];
  isPlaying: boolean;
  roomName?: string;
}

/* ── Helpers ── */

function getToken(): string | null {
  return localStorage.getItem('gromko_token');
}

function avatarUrl(src: string) {
  if (!src) return '';
  return src.startsWith('http') ? src : apiUrl(`/uploads/${src.replace(/^\/uploads\//, '')}`);
}

function coverUrl(src: string) {
  if (!src) return '';
  return src.startsWith('http') ? src : apiUrl(src);
}

/* ── Page ── */

export default function PeoplePage() {
  const { currentUser, openAuthModal } = useStore();
  const [friends, setFriends] = useState<ListeningUser[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);

    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    Promise.all([
      fetch(apiUrl('/profile/friends'), { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(apiUrl('/public-rooms'), { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([f, r]) => {
      setFriends(Array.isArray(f) ? f : []);
      setPublicRooms(Array.isArray(r) ? r : []);
    }).finally(() => setLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white pt-20 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <Users size={48} className="text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Музыкальное сообщество</h2>
          <p className="text-zinc-400 text-sm mb-6">Войдите, чтобы видеть что слушают ваши друзья и присоединяться к live-комнатам</p>
          <button onClick={() => openAuthModal('login')} className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-xl text-sm font-semibold transition-colors">
            Войти
          </button>
        </div>
      </div>
    );
  }

  const onlineFriends = friends.filter(f => f.isOnline);
  const listeningNow = friends.filter(f => f.listeningTrack);

  const filteredFriends = search.trim()
    ? friends.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : friends;

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-5 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-black mb-1">Люди</h1>
          <p className="text-sm text-zinc-500">Что слушают ваши люди прямо сейчас</p>
        </div>

        {/* Live Rooms */}
        {publicRooms.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Radio size={14} className="text-red-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">Live-комнаты</h2>
              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium">{publicRooms.length}</span>
            </div>
            <div className="space-y-2.5">
              {publicRooms.map((room, i) => (
                <Link
                  key={i}
                  to={`/user/${room.hostId}`}
                  className="block bg-zinc-900/60 border border-white/5 rounded-2xl p-4 hover:border-red-500/20 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-start gap-3">
                    {/* Track cover */}
                    <div className="relative shrink-0">
                      <img src={coverUrl(room.trackCover)} alt="" className="w-14 h-14 rounded-xl object-cover" />
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Wifi size={8} />
                        LIVE
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        {room.hostAvatar ? (
                          <img src={avatarUrl(room.hostAvatar)} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                            <span className="text-white text-[8px] font-bold">{room.hostName[0]?.toUpperCase()}</span>
                          </div>
                        )}
                        <span className="text-sm font-semibold text-white truncate">{room.hostName}</span>
                      </div>
                      <p className="text-sm text-zinc-300 truncate flex items-center gap-1.5">
                        <Music size={11} className="text-red-400 shrink-0" />
                        {room.trackTitle} — {room.trackArtist}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex -space-x-1.5">
                          {(room.listeners || []).slice(0, 4).map((l, li) => (
                            <img key={li} src={avatarUrl(l.avatar)} alt="" className="w-5 h-5 rounded-full object-cover border border-zinc-900" />
                          ))}
                        </div>
                        <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                          <Headphones size={10} />
                          {room.listenersCount}
                        </span>
                      </div>
                    </div>
                    <Equalizer />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Search */}
        <div className="flex items-center bg-zinc-900/60 border border-white/5 rounded-xl px-3 py-2.5 gap-2 mb-4">
          <Search size={14} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти человека..."
            className="bg-transparent text-base sm:text-sm text-white placeholder-zinc-500 outline-none w-full"
          />
        </div>

        {/* Stats pills */}
        <div className="flex gap-2 mb-4 text-xs">
          <span className="bg-zinc-900 border border-white/5 px-3 py-1.5 rounded-full text-zinc-400">
            Онлайн <span className="text-white font-semibold ml-1">{onlineFriends.length}</span>
          </span>
          <span className="bg-zinc-900 border border-white/5 px-3 py-1.5 rounded-full text-zinc-400">
            Слушают <span className="text-red-400 font-semibold ml-1">{listeningNow.length}</span>
          </span>
        </div>

        {/* Listening Now */}
        {listeningNow.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              Слушают сейчас
            </h2>
            <div className="space-y-1">
              {listeningNow.map((f) => (
                <Link
                  key={f.id}
                  to={`/user/${f.id}`}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/5 active:bg-white/5 transition-colors"
                >
                  <div className="relative shrink-0">
                    {f.avatar ? (
                      <img src={avatarUrl(f.avatar)} alt={f.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">{f.name[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-zinc-950" />
                    {f.hasRoom && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[7px] font-bold px-1 py-0.5 rounded-full">
                        LIVE
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium truncate">{f.name}</p>
                    <p className="text-[11px] text-red-400 truncate flex items-center gap-1">
                      <Music size={9} />
                      {f.listeningTrack!.title} — {f.listeningTrack!.artist}
                    </p>
                  </div>
                  <Equalizer className="!h-3" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* All friends */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 mb-3">
            Все подписки ({filteredFriends.length})
          </h2>
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-6 h-6 border-2 border-white/10 border-t-red-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="py-12 text-center">
              <Users size={32} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">
                {search.trim() ? 'Никого не найдено' : 'Вы ещё ни на кого не подписаны'}
              </p>
              {!search.trim() && (
                <p className="text-xs text-zinc-600 mt-1">Подпишитесь на артистов и пользователей, чтобы видеть их активность</p>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredFriends.map((f) => (
                <Link
                  key={f.id}
                  to={`/user/${f.id}`}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/5 active:bg-white/5 transition-colors"
                >
                  <div className="relative shrink-0">
                    {f.avatar ? (
                      <img src={avatarUrl(f.avatar)} alt={f.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">{f.name[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${f.isOnline ? 'bg-green-500' : 'bg-zinc-600'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium truncate">{f.name}</p>
                    {f.listeningTrack ? (
                      <p className="text-[11px] text-red-400 truncate flex items-center gap-1">
                        <Music size={9} />
                        {f.listeningTrack.title} — {f.listeningTrack.artist}
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-500">{f.isOnline ? 'Онлайн' : 'Оффлайн'}</p>
                    )}
                  </div>
                  {f.listeningTrack && <Equalizer className="!h-3" />}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
