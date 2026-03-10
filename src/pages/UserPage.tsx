import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useStore, Track, Playlist } from '../store';
import {
  UserPlus, UserMinus, ListMusic, Heart, Clock,
  Play, Users, Calendar, Headphones,
  Share2,
} from 'lucide-react';
import { apiUrl } from '../lib/api';
import { formatPlays } from '../utils/format';

interface PublicUser {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  joinedAt: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  playlists: Playlist[];
  likedTracksCount: number;
  totalPlays: number;
  totalTimeSeconds: number;
}

interface FollowUser {
  id: string;
  name: string;
  avatar: string | null;
  followedAt: string;
}

function getToken() {
  return localStorage.getItem('gromko_token');
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, toggleFollow, player, playTrack, togglePlay } = useStore();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [tab, setTab] = useState<'playlists' | 'followers' | 'following'>('playlists');
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [followingList, setFollowingList] = useState<FollowUser[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<(Playlist & { tracks: Track[]; owner: { id: string; name: string; avatar: string } | null }) | null>(null);

  // If viewing own profile, redirect
  useEffect(() => {
    if (currentUser && id === currentUser.id) {
      navigate('/profile', { replace: true });
    }
  }, [currentUser, id, navigate]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const token = getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(apiUrl(`/users/${id}`), { headers })
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(d => {
        setUser(d);
        setFollowing(d.isFollowing);
        setFollowersCount(d.followersCount);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (tab === 'followers') {
      fetch(apiUrl(`/users/${id}/followers`))
        .then(r => r.ok ? r.json() : [])
        .then(d => setFollowers(Array.isArray(d) ? d : []))
        .catch(() => {});
    } else if (tab === 'following') {
      fetch(apiUrl(`/users/${id}/following`))
        .then(r => r.ok ? r.json() : [])
        .then(d => setFollowingList(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [id, tab]);

  const handleFollow = async () => {
    if (!currentUser || !id) return;
    const result = await toggleFollow(id);
    setFollowing(result);
    setFollowersCount(c => result ? c + 1 : Math.max(0, c - 1));
  };

  const handleOpenPlaylist = async (plId: string) => {
    try {
      const token = getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(apiUrl(`/playlists/${plId}`), { headers });
      if (!res.ok) return;
      const data = await res.json();
      setSelectedPlaylist(data);
    } catch {
      // ignore
    }
  };

  const handleShare = () => {
    if (!id) return;
    const url = `${window.location.origin}/user/${id}`;
    if (navigator.share) {
      navigator.share({ title: user?.name || 'Профиль', url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center pt-14">
        <div className="w-8 h-8 border-2 border-white/10 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white pt-14 flex items-center justify-center">
        <div className="text-center">
          <p className="text-6xl font-black text-white/10 mb-3">404</p>
          <p className="text-zinc-400">Пользователь не найден</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-14 pb-28">
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-8">
        {/* ─── Header ─── */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
          <img
            src={user.avatar || '/default-avatar.png'}
            alt={user.name}
            className="w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover ring-4 ring-zinc-900"
          />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-3xl font-black mb-1">{user.name}</h1>
            {user.bio && (
              <p className="text-zinc-400 text-sm mb-3 max-w-lg">{user.bio}</p>
            )}
            <div className="flex items-center justify-center sm:justify-start gap-5 text-sm mb-4">
              <button
                onClick={() => setTab('followers')}
                className="hover:text-white transition-colors"
              >
                <span className="text-white font-bold">{followersCount}</span>{' '}
                <span className="text-zinc-500">подписчиков</span>
              </button>
              <button
                onClick={() => setTab('following')}
                className="hover:text-white transition-colors"
              >
                <span className="text-white font-bold">{user.followingCount}</span>{' '}
                <span className="text-zinc-500">подписок</span>
              </button>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-500">
                <Heart size={12} className="inline mr-1 text-red-400" />
                {user.likedTracksCount} треков
              </span>
            </div>
            <div className="flex items-center justify-center sm:justify-start gap-3">
              {currentUser && currentUser.id !== user.id && (
                <button
                  onClick={handleFollow}
                  className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    following
                      ? 'bg-white/10 text-white hover:bg-white/15'
                      : 'bg-red-500 text-white hover:bg-red-400'
                  }`}
                >
                  {following ? <UserMinus size={15} /> : <UserPlus size={15} />}
                  {following ? 'Отписаться' : 'Подписаться'}
                </button>
              )}
              <button
                onClick={handleShare}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                title="Поделиться"
              >
                <Share2 size={16} className="text-zinc-400" />
              </button>
            </div>
          </div>
        </div>

        {/* ─── Stats ─── */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-white/[0.03] rounded-xl p-3 text-center">
            <Headphones size={18} className="text-green-400 mx-auto mb-1" />
            <p className="text-lg font-black">{formatPlays(user.totalPlays)}</p>
            <p className="text-zinc-600 text-[10px]">Прослушиваний</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 text-center">
            <Clock size={18} className="text-amber-400 mx-auto mb-1" />
            <p className="text-lg font-black">{formatTime(user.totalTimeSeconds)}</p>
            <p className="text-zinc-600 text-[10px]">Время</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 text-center">
            <Calendar size={18} className="text-blue-400 mx-auto mb-1" />
            <p className="text-lg font-black text-sm">
              {new Date(user.joinedAt).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}
            </p>
            <p className="text-zinc-600 text-[10px]">На платформе</p>
          </div>
        </div>

        {/* ─── Tabs ─── */}
        <div className="border-b border-white/5 mb-6">
          <div className="flex gap-0">
            {([
              { key: 'playlists' as const, label: 'Плейлисты', icon: ListMusic, count: user.playlists.length },
              { key: 'followers' as const, label: 'Подписчики', icon: Users, count: followersCount },
              { key: 'following' as const, label: 'Подписки', icon: Users, count: user.followingCount },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelectedPlaylist(null); }}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                  tab === t.key
                    ? 'text-white border-red-500'
                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                }`}
              >
                <t.icon size={14} />
                {t.label}
                {t.count > 0 && (
                  <span className="bg-white/5 text-zinc-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Tab Content ─── */}

        {/* Playlists */}
        {tab === 'playlists' && !selectedPlaylist && (
          <div>
            {user.playlists.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {user.playlists.map(pl => (
                  <button
                    key={pl.id}
                    onClick={() => handleOpenPlaylist(pl.id)}
                    className="group text-left"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-white/5 mb-2 relative">
                      {pl.coverUrl ? (
                        <img src={apiUrl(pl.coverUrl)} alt={pl.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                          <ListMusic size={32} className="text-zinc-700" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play size={28} fill="white" className="text-white" />
                      </div>
                    </div>
                    <p className="text-sm font-medium truncate group-hover:text-red-400 transition-colors">{pl.title}</p>
                    <p className="text-zinc-600 text-xs">{pl.tracksCount} треков</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <ListMusic size={36} className="text-zinc-800 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">Нет публичных плейлистов</p>
              </div>
            )}
          </div>
        )}

        {/* Selected playlist detail */}
        {tab === 'playlists' && selectedPlaylist && (
          <div>
            <button
              onClick={() => setSelectedPlaylist(null)}
              className="flex items-center gap-1 text-zinc-500 hover:text-white text-sm mb-4 transition-colors"
            >
              ← Назад к плейлистам
            </button>
            <div className="flex flex-col sm:flex-row gap-5 mb-6">
              <div className="w-40 h-40 rounded-xl overflow-hidden bg-white/5 shrink-0">
                {selectedPlaylist.coverUrl ? (
                  <img src={apiUrl(selectedPlaylist.coverUrl)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                    <ListMusic size={40} className="text-zinc-700" />
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-black mb-1">{selectedPlaylist.title}</h2>
                {selectedPlaylist.description && (
                  <p className="text-zinc-400 text-sm mb-2">{selectedPlaylist.description}</p>
                )}
                <p className="text-zinc-600 text-xs mb-3">
                  {selectedPlaylist.tracksCount} треков
                  {selectedPlaylist.owner && (
                    <> · от <span className="text-zinc-400">{selectedPlaylist.owner.name}</span></>
                  )}
                </p>
                {selectedPlaylist.tracks.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedPlaylist.tracks.length > 0) {
                        playTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks);
                      }
                    }}
                    className="flex items-center gap-2 px-5 py-2 bg-red-500 hover:bg-red-400 text-white text-sm font-medium rounded-full transition-colors"
                  >
                    <Play size={14} fill="white" />
                    Слушать
                  </button>
                )}
              </div>
            </div>
            {selectedPlaylist.tracks.length > 0 ? (
              <div className="space-y-0.5">
                {selectedPlaylist.tracks.map((t, idx) => {
                  const isCurrent = player.currentTrack?.id === t.id;
                  const isPlaying = isCurrent && player.isPlaying;
                  return (
                    <button
                      key={t.id}
                      onClick={() => isCurrent ? togglePlay() : playTrack(t, selectedPlaylist.tracks)}
                      className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors group ${isCurrent ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
                    >
                      <span className={`w-6 text-center text-xs tabular-nums ${isCurrent ? 'text-red-400' : 'text-zinc-600'}`}>
                        {isCurrent ? (isPlaying ? '▸' : '❚❚') : idx + 1}
                      </span>
                      <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 relative">
                        <img src={t.cover} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-medium truncate ${isCurrent ? 'text-red-400' : 'text-white'}`}>{t.title}</p>
                        <p className="text-zinc-500 text-[11px] truncate">{t.artist}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-zinc-600 text-sm text-center py-8">Плейлист пуст</p>
            )}
          </div>
        )}

        {/* Followers */}
        {tab === 'followers' && (
          <div>
            {followers.length > 0 ? (
              <div className="space-y-1">
                {followers.map(f => (
                  <Link
                    key={f.id}
                    to={`/user/${f.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    <img src={f.avatar || '/default-avatar.png'} alt="" className="w-10 h-10 rounded-full object-cover" />
                    <span className="text-sm font-medium text-white">{f.name}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <Users size={36} className="text-zinc-800 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">Нет подписчиков</p>
              </div>
            )}
          </div>
        )}

        {/* Following */}
        {tab === 'following' && (
          <div>
            {followingList.length > 0 ? (
              <div className="space-y-1">
                {followingList.map(f => (
                  <Link
                    key={f.id}
                    to={`/user/${f.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    <img src={f.avatar || '/default-avatar.png'} alt="" className="w-10 h-10 rounded-full object-cover" />
                    <span className="text-sm font-medium text-white">{f.name}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <Users size={36} className="text-zinc-800 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">Нет подписок</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
