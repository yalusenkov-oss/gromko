import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore, type Track, type Playlist } from '../store';
import { apiUrl } from '../lib/api';
import { audioEngine } from '../audio/engine';

// Same LK components used in ProfilePage
import { MusicTaste } from '../components/lk/LeftColumn';
import { Playlists, ActivityFeed, RecentlyListened, Recommendations } from '../components/lk/CenterColumn';
import { AchievementsSection } from '../components/lk/RightColumn';
import { ToastContainer, type ToastItem } from '../components/lk/Toast';
import { PlaylistDetailModal, ShareModal } from '../components/lk/Modals';
import { Equalizer } from '../components/lk/Equalizer';

import {
  UserPlus, UserMinus, Users, ListMusic, Share2,
  Radio, Headphones, LogOut, RotateCcw, ListPlus, Search,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

interface PublicUser {
  id: string;
  name: string;
  username: string | null;
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

interface TasteSummary {
  topGenres: { genre: string; count: number }[];
  topArtists: { slug: string; name?: string; count: number }[];
  timePreferences?: Record<string, number>;
}

interface ProfileStats {
  totalPlays: number;
  monthPlays: number;
  totalTimeSeconds: number;
  monthTimeSeconds: number;
  topListenedArtists: { name: string; slug: string; photo: string; plays: number }[];
  playlistsCount: number;
  lastActive: string | null;
}

interface ActivityItem {
  type: string;
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackCover?: string;
  artistSlug?: string;
  artistName?: string;
  createdAt: string;
}

interface HistoryTrack extends Track {
  playedAt?: string;
}

type RoomSuggestion = {
  trackId: string; trackTitle: string; trackArtist: string; trackCover: string;
  suggestedBy: string; suggestedByName: string;
};

type RoomState = {
  trackId: string; trackTitle: string; trackArtist: string; trackCover: string;
  progress: number; isPlaying: boolean; listenersCount: number;
  suggestions?: RoomSuggestion[];
};

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function getToken(): string | null {
  return localStorage.getItem('gromko_token');
}

function resolveAvatar(avatar: string | null): string {
  if (!avatar) return '';
  if (avatar.startsWith('http')) return avatar;
  return apiUrl(`/uploads/${avatar.replace(/^\/uploads\//, '')}`);
}

async function publicFetchJson(path: string) {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* ═══════════════════════════════════════════════════════
   UserProfileCard — adapted from ProfileCard for other users
   ═══════════════════════════════════════════════════════ */

interface UserProfileCardProps {
  user: PublicUser;
  following: boolean;
  followersCount: number;
  followingCount: number;
  onFollow: () => void;
  onShare: () => void;
  roomState: RoomState | null;
  joinedRoom: boolean;
  onJoinRoom: () => void;
  onLeaveRoom: () => void;
}

function UserProfileCard({
  user, following, followersCount, followingCount, onFollow, onShare,
  roomState, joinedRoom, onJoinRoom, onLeaveRoom,
}: UserProfileCardProps) {
  const avatar = resolveAvatar(user.avatar);

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
      {/* Avatar + info */}
      <div className="flex items-center gap-4 sm:flex-col sm:items-center">
        <div className="relative shrink-0">
          {avatar ? (
            <img src={avatar} alt={user.name} className="w-18 h-18 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-gromq-border" />
          ) : (
            <div className="w-18 h-18 sm:w-24 sm:h-24 rounded-full border-2 border-gromq-border bg-red-500 flex items-center justify-center">
              <span className="text-white text-2xl sm:text-3xl font-black">
                {user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          {roomState && (
            <div className="absolute bottom-1 right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-gromq-green rounded-full border-2 border-gromq-card" />
          )}
        </div>
        <div className="flex-1 min-w-0 sm:text-center sm:mt-1">
          <h1 className="text-lg font-bold text-gromq-text">{user.name}</h1>
          <span className="text-sm text-gromq-muted">@{user.username || user.name.toLowerCase().replace(/\s+/g, '')}</span>
          {user.bio && (
            <p className="text-xs text-gromq-muted mt-1 sm:mt-2 leading-relaxed line-clamp-2 sm:line-clamp-none">
              {user.bio}
            </p>
          )}
        </div>
      </div>

      {/* Listening room banner */}
      {roomState && (
        <div className="mt-3 sm:mt-4 bg-gromq-surface border border-gromq-border rounded-xl p-3 flex items-center gap-3">
          <img
            src={roomState.trackCover.startsWith('http') ? roomState.trackCover : apiUrl(roomState.trackCover)}
            alt=""
            className="w-10 h-10 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gromq-green font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-gromq-green rounded-full animate-pulse" />
              Слушает сейчас
            </p>
            <p className="text-sm text-gromq-text truncate font-medium">{roomState.trackTitle}</p>
            <p className="text-xs text-gromq-muted truncate">{roomState.trackArtist}</p>
          </div>
          {!joinedRoom ? (
            <button onClick={onJoinRoom}
              className="px-3 py-1.5 bg-gromq-green hover:bg-gromq-green/80 text-black text-xs font-bold rounded-full transition-colors shrink-0 flex items-center gap-1">
              <Radio size={12} />
              Слушать
            </button>
          ) : (
            <button onClick={onLeaveRoom}
              className="shrink-0 flex items-center gap-1.5 text-gromq-green text-xs font-semibold hover:text-gromq-red transition-colors cursor-pointer"
              title="Покинуть комнату">
              <Equalizer className="!h-3" />
              Подключён
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="mt-3 sm:mt-4 flex justify-around py-3 border-t border-b border-gromq-border">
        <StatBadge icon={Users} value={followersCount} label="Подписчики" />
        <StatBadge icon={UserPlus} value={followingCount} label="Подписки" />
        <StatBadge icon={ListMusic} value={user.playlists.length} label="Плейлисты" />
      </div>

      {/* Action Buttons */}
      <div className="mt-3 sm:mt-4 space-y-2">
        <button
          onClick={onFollow}
          className={`w-full font-medium text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-[0.97] ${
            following
              ? 'bg-gromq-surface border border-gromq-border text-gromq-text hover:bg-gromq-border'
              : 'bg-gromq-red hover:bg-gromq-red-dim text-white'
          }`}
        >
          {following ? <UserMinus size={16} /> : <UserPlus size={16} />}
          {following ? 'Отписаться' : 'Подписаться'}
        </button>
        <button
          onClick={onShare}
          className="w-full bg-gromq-surface hover:bg-gromq-border transition-colors border border-gromq-border text-gromq-text font-medium text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.97]"
        >
          <Share2 size={16} className="text-gromq-muted" />
          Поделиться
        </button>
      </div>
    </div>
  );
}

function StatBadge({ icon: Icon, value, label }: { icon: React.ElementType; value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Icon size={14} className="text-gromq-muted" />
      <span className="text-sm font-semibold text-gromq-text">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      <span className="text-[11px] text-gromq-muted">{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   UserPage — same 3-column layout as ProfilePage
   ═══════════════════════════════════════════════════════ */

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, toggleFollow, playTrack, joinedRoomHostId, joinedRoomDesync, setJoinedRoom, setJoinedRoomDesync } = useStore();

  // ── Toast system ──
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const tidRef = useRef(0);
  const addToast = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    const tid = ++tidRef.current;
    setToasts(p => [...p, { id: tid, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== tid)), 3000);
  }, []);

  // ── Modal state ──
  const [activeModal, setActiveModal] = useState<'share' | 'playlist-detail' | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  // ── User data ──
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // ── Profile data (same sections as ProfilePage) ──
  const [tasteSummary, setTasteSummary] = useState<TasteSummary | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [historyTracks, setHistoryTracks] = useState<HistoryTrack[]>([]);

  // ── Listening room ──
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const joinedRoom = joinedRoomHostId === id;
  const roomDesync = joinedRoom && joinedRoomDesync;
  const [suggestQuery, setSuggestQuery] = useState('');
  const [suggestResults, setSuggestResults] = useState<Track[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Recommendation picks (for this user) ──
  const [recPicks, setRecPicks] = useState<{ trackOfWeek: Track | null; discovery: Track | null }>({ trackOfWeek: null, discovery: null });

  // ── Redirect to own profile ──
  useEffect(() => {
    if (currentUser && id === currentUser.id) {
      navigate('/profile', { replace: true });
    }
  }, [currentUser, id, navigate]);

  // ── Fetch user data + extended data ──
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const token = getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(apiUrl(`/users/${id}`), { headers })
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(d => {
        setUser(d);
        setFollowing(d.isFollowing);
        setFollowersCount(d.followersCount);
        setFollowingCount(d.followingCount);
        setLoading(false);
      })
      .catch(() => { setUser(null); setLoading(false); });

    // Extended data
    publicFetchJson(`/users/${id}/stats`).then(setProfileStats).catch(() => {});
    publicFetchJson(`/users/${id}/taste`).then(setTasteSummary).catch(() => {});
    publicFetchJson(`/users/${id}/activity`).then(d => setActivityFeed(Array.isArray(d) ? d : (d.feed || []))).catch(() => {});
    publicFetchJson(`/users/${id}/history`).then(d => setHistoryTracks(Array.isArray(d) ? d : (d.tracks || []))).catch(() => {});

    // Recommendation picks
    publicFetchJson(`/users/${id}/recommendation-picks`).then(d => {
      const allTracks = useStore.getState().tracks;
      if (d?.trackOfWeekId) {
        const t = allTracks.find((tr: Track) => tr.id === d.trackOfWeekId);
        if (t) setRecPicks(p => ({ ...p, trackOfWeek: t }));
      }
      if (d?.discoveryId) {
        const t = allTracks.find((tr: Track) => tr.id === d.discoveryId);
        if (t) setRecPicks(p => ({ ...p, discovery: t }));
      }
    }).catch(() => {});
  }, [id]);

  // ── Listening room polling ──
  useEffect(() => {
    if (!id) return;
    const checkRoom = () => {
      fetch(apiUrl(`/listening-room/${id}`))
        .then(r => r.ok ? r.json() : null)
        .then(d => setRoomState(d || null))
        .catch(() => setRoomState(null));
    };
    checkRoom();
    const iv = setInterval(checkRoom, 8000);
    return () => clearInterval(iv);
  }, [id]);

  // (Room sync & desync detection handled globally by useRoomListener in App)

  // ── Handlers ──
  const handleFollow = async () => {
    if (!currentUser || !id) return;
    const result = await toggleFollow(id);
    setFollowing(result);
    setFollowersCount(c => result ? c + 1 : Math.max(0, c - 1));
    addToast(result ? 'Вы подписались' : 'Вы отписались');
  };

  const handleJoinRoom = async () => {
    if (!id || !currentUser || !roomState) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/listening-room/${id}/join`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setJoinedRoom(id!);

        // Find track in store, or build a minimal Track from room data
        const allTracks = useStore.getState().tracks;
        let track = allTracks.find((t: Track) => t.id === data.trackId);
        if (!track && data.trackId) {
          // Track not in global list — fetch it from API
          try {
            const tRes = await fetch(apiUrl(`/tracks/${data.trackId}`));
            if (tRes.ok) track = await tRes.json();
          } catch { /* ignore */ }
        }
        if (!track && data.trackId) {
          // Last resort — construct minimal Track from room data
          track = {
            id: data.trackId,
            title: data.trackTitle || roomState.trackTitle,
            artist: data.trackArtist || roomState.trackArtist,
            artistSlug: '',
            genre: '',
            year: 0,
            cover: data.trackCover || roomState.trackCover,
            duration: 0,
            plays: 0,
            likes: 0,
          };
        }

        if (track) {
          playTrack(track, [track]);
          // Seek to host's current position after a short delay for the engine to load
          if (data.progress > 0) {
            setTimeout(() => {
              audioEngine.seek(data.progress);
            }, 800);
          }
        }
        addToast('🎧 Подключён к комнате');
      }
    } catch { /* ignore */ }
  };

  const handleLeaveRoom = async () => {
    if (!id) return;
    const token = getToken();
    if (token) {
      fetch(apiUrl(`/listening-room/${id}/leave`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setJoinedRoom(null);
    audioEngine.pause();
    addToast('Вы покинули комнату');
  };

  const handleResync = async () => {
    if (!roomState || !id) return;
    setJoinedRoomDesync(false);
    // Re-fetch room state and resync
    try {
      const res = await fetch(apiUrl(`/listening-room/${id}`));
      if (!res.ok) return;
      const d = await res.json();
      setRoomState(d);
      if (!d.trackId) return;
      const { player: p } = useStore.getState();
      // If different track, switch
      if (p.currentTrack?.id !== d.trackId) {
        const allTracks = useStore.getState().tracks;
        let track = allTracks.find((t: Track) => t.id === d.trackId);
        if (!track) {
          try { const tRes = await fetch(apiUrl(`/tracks/${d.trackId}`)); if (tRes.ok) track = await tRes.json(); } catch {}
        }
        if (!track) {
          track = { id: d.trackId, title: d.trackTitle, artist: d.trackArtist, artistSlug: '', genre: '', year: 0, cover: d.trackCover, duration: 0, plays: 0, likes: 0 };
        }
        playTrack(track, [track]);
        setTimeout(() => { if (d.progress > 0) audioEngine.seek(d.progress); }, 800);
      } else {
        // Same track — just seek and resume
        if (d.progress > 0) audioEngine.seek(d.progress);
        if (d.isPlaying) audioEngine.resume();
      }
      addToast('🎧 Синхронизировано');
    } catch { /* ignore */ }
  };

  const handleSuggestTrack = async (trackId: string) => {
    if (!id) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/listening-room/${id}/suggest`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      });
      if (res.ok) {
        const data = await res.json();
        setRoomState(prev => prev ? { ...prev, suggestions: data.suggestions } : prev);
        setSuggestQuery('');
        setSuggestResults([]);
        addToast('🎵 Трек предложен');
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.error || 'Не удалось предложить трек');
      }
    } catch { addToast('Ошибка сети'); }
  };

  const handleSuggestSearch = (q: string) => {
    setSuggestQuery(q);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!q.trim()) { setSuggestResults([]); return; }
    suggestTimer.current = setTimeout(() => {
      fetch(apiUrl(`/search?q=${encodeURIComponent(q.trim())}`))
        .then(r => r.ok ? r.json() : { tracks: [] })
        .then(d => setSuggestResults((d.tracks || []).slice(0, 6)))
        .catch(() => {});
    }, 300);
  };

  const handleShare = () => {
    if (!id) return;
    const url = `${window.location.origin}/user/${id}`;
    if (navigator.share) {
      navigator.share({ title: user?.name || 'Профиль', url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => addToast('Ссылка скопирована')).catch(() => {});
    }
  };

  // ── Night percent ──
  const nightPercent = (() => {
    if (!tasteSummary?.timePreferences) return 0;
    const tp = tasteSummary.timePreferences;
    const total = Object.values(tp).reduce((s, v) => s + v, 0) || 1;
    // Server may return named keys (morning/day/evening/night) or numeric hour keys
    if ('night' in tp) {
      return Math.round(((tp['night'] || 0) / total) * 100);
    }
    const nightHrs = ['0', '1', '2', '3', '4', '5', '22', '23'];
    const nightTotal = nightHrs.reduce((s, h) => s + (tp[h] || 0), 0);
    return Math.round((nightTotal / total) * 100);
  })();

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gromq-bg text-white flex items-center justify-center pt-16">
        <div className="w-8 h-8 border-2 border-white/10 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gromq-bg text-white pt-16 flex items-center justify-center">
        <div className="text-center">
          <p className="text-6xl font-black text-white/10 mb-3">404</p>
          <p className="text-gromq-muted">Пользователь не найден</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gromq-bg text-gromq-text pt-16">
      <main className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
        {/* ── Desktop: 3-column layout (same as ProfilePage) ── */}
        <div className="hidden lg:flex gap-5">
          {/* Left Column */}
          <aside className="w-full lg:w-[300px] xl:w-[320px] shrink-0 space-y-4">
            <UserProfileCard
              user={user}
              following={following}
              followersCount={followersCount}
              followingCount={followingCount}
              onFollow={handleFollow}
              onShare={handleShare}
              roomState={roomState}
              joinedRoom={joinedRoom}
              onJoinRoom={handleJoinRoom}
              onLeaveRoom={handleLeaveRoom}
            />
            <MusicTaste
              tasteSummary={tasteSummary}
              topArtists={profileStats?.topListenedArtists || []}
              totalPlays={profileStats?.totalPlays || 0}
              nightPercent={nightPercent}
            />
          </aside>

          {/* Center Column */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* LIVE КОМНАТА — full room experience */}
            {roomState && (
              <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-gromq-green/5 rounded-full blur-2xl" />
                <div className="flex items-center gap-2 mb-4 relative">
                  <div className="relative">
                    <Radio size={18} className="text-gromq-green" />
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-gromq-green rounded-full animate-ping" />
                  </div>
                  <h2 className="text-base font-bold text-gromq-text uppercase tracking-wider">Live Комната</h2>
                  <span className="ml-auto text-[10px] bg-gromq-green/20 text-gromq-green px-2.5 py-0.5 rounded-full font-medium">
                    Активна
                  </span>
                </div>

                {/* Now playing */}
                <div className="flex gap-4 mb-4">
                  <img
                    src={roomState.trackCover.startsWith('http') ? roomState.trackCover : apiUrl(roomState.trackCover)}
                    alt=""
                    className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl object-cover shadow-lg shadow-black/30"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div>
                      <p className="text-xs text-gromq-green font-medium flex items-center gap-1.5 mb-1">
                        <Equalizer className="!h-3" />
                        Сейчас играет
                      </p>
                      <h3 className="text-lg sm:text-xl font-bold text-gromq-text truncate">{roomState.trackTitle}</h3>
                      <p className="text-sm text-gromq-muted truncate">{roomState.trackArtist}</p>
                      <p className="text-[11px] text-gromq-muted flex items-center gap-1 mt-1.5">
                        <Headphones size={10} />
                        {roomState.listenersCount} {roomState.listenersCount === 1 ? 'слушатель' : roomState.listenersCount < 5 ? 'слушателя' : 'слушателей'}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {!joinedRoom ? (
                        <button onClick={handleJoinRoom}
                          className="flex-1 bg-gromq-green hover:bg-gromq-green/80 transition-colors text-black font-semibold text-xs py-2.5 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.97]">
                          <Headphones size={14} />
                          Присоединиться
                        </button>
                      ) : (
                        <button onClick={handleLeaveRoom}
                          className="flex-1 bg-gromq-surface border border-gromq-border text-gromq-green hover:text-gromq-red hover:border-gromq-red/50 font-semibold text-xs py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          title="Покинуть комнату">
                          <Equalizer className="!h-3" />
                          Подключён
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Desync banner — inside room card */}
                {joinedRoom && roomDesync && (
                  <div className="bg-gromq-amber/10 border border-gromq-amber/30 rounded-xl p-3 mb-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gromq-text">Рассинхронизировано</p>
                      <p className="text-[11px] text-gromq-muted">Вы поставили на паузу или переключили трек</p>
                    </div>
                    <button onClick={handleResync}
                      className="px-3 py-1.5 bg-gromq-green hover:bg-gromq-green/80 text-black text-xs font-bold rounded-lg flex items-center gap-1 shrink-0 active:scale-[0.97]">
                      <RotateCcw size={11} />
                      Синхронизировать
                    </button>
                  </div>
                )}

                {/* Suggest track */}
                {joinedRoom && (
                  <>
                    <div className="border-t border-gromq-border pt-3 mt-1">
                      <div className="flex items-center gap-2 mb-2">
                        <ListPlus size={14} className="text-gromq-green" />
                        <span className="text-xs font-semibold text-gromq-text uppercase tracking-wider">Предложить трек</span>
                      </div>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gromq-muted pointer-events-none" />
                        <input
                          type="text"
                          value={suggestQuery}
                          onChange={e => handleSuggestSearch(e.target.value)}
                          placeholder="Поиск трека..."
                          className="w-full bg-gromq-surface border border-gromq-border rounded-lg pl-9 pr-3 py-2 text-sm text-gromq-text placeholder:text-gromq-muted focus:outline-none focus:border-gromq-green/50"
                        />
                      </div>
                      {suggestResults.length > 0 && (
                        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                          {suggestResults.map(t => (
                            <button key={t.id} onClick={() => handleSuggestTrack(t.id)}
                              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gromq-surface transition-colors text-left">
                              <img src={t.cover} alt="" className="w-8 h-8 rounded object-cover" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gromq-text truncate">{t.title}</p>
                                <p className="text-xs text-gromq-muted truncate">{t.artist}</p>
                              </div>
                              <ListPlus size={14} className="text-gromq-green shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {roomState.suggestions && roomState.suggestions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gromq-border space-y-1.5">
                        <p className="text-xs text-gromq-muted font-medium">Предложенные треки:</p>
                        {roomState.suggestions.map(s => (
                          <div key={s.trackId} className="flex items-center gap-3 p-2 rounded-lg bg-gromq-surface">
                            <img src={s.trackCover} alt="" className="w-8 h-8 rounded object-cover" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gromq-text truncate">{s.trackTitle}</p>
                              <p className="text-xs text-gromq-muted truncate">{s.trackArtist}</p>
                            </div>
                            <span className="text-[10px] text-gromq-muted shrink-0">{s.suggestedByName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <Playlists
              playlists={user.playlists}
              onCreatePlaylist={() => {}}
              onOpenPlaylist={(pl) => { setSelectedPlaylist(pl); setActiveModal('playlist-detail'); }}
              addToast={addToast}
              hideCreate
            />
            {(recPicks.trackOfWeek || recPicks.discovery) && (
              <Recommendations recPicks={recPicks} onPickTrackOfWeek={() => {}} onPickDiscovery={() => {}} readOnly />
            )}
            <ActivityFeed feed={activityFeed} />
            <RecentlyListened tracks={historyTracks} />
          </div>

          {/* Right Column */}
          <aside className="w-full lg:w-[280px] xl:w-[300px] shrink-0 space-y-4">
            <AchievementsSection
              totalLiked={user.likedTracksCount}
              playlistsCount={user.playlists.length}
              nightPercent={nightPercent}
              totalPlays={profileStats?.totalPlays || 0}
            />
          </aside>
        </div>

        {/* ── Mobile: single-column ── */}
        <div className="lg:hidden space-y-3 sm:space-y-4">
          <UserProfileCard
            user={user}
            following={following}
            followersCount={followersCount}
            followingCount={followingCount}
            onFollow={handleFollow}
            onShare={handleShare}
            roomState={roomState}
            joinedRoom={joinedRoom}
            onJoinRoom={handleJoinRoom}
            onLeaveRoom={handleLeaveRoom}
          />
          {/* Mobile desync banner */}
          {joinedRoom && roomDesync && (
            <div className="bg-gromq-card border border-gromq-amber/30 rounded-2xl p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-gromq-text">Вы отключились от совместного прослушивания</p>
                <p className="text-xs text-gromq-muted mt-0.5">Вы поставили на паузу или переключили трек</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleResync}
                  className="flex-1 py-2 bg-gromq-green hover:bg-gromq-green/80 text-black text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors active:scale-[0.97]">
                  <RotateCcw size={13} />
                  Продолжить
                </button>
                <button onClick={handleLeaveRoom}
                  className="flex-1 py-2 bg-gromq-surface border border-gromq-border text-gromq-muted hover:text-gromq-red text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors">
                  <LogOut size={13} />
                  Выйти
                </button>
              </div>
            </div>
          )}
          {roomState && (
            <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <Equalizer />
                <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">Сейчас играет</h2>
              </div>
              <div className="flex gap-3">
                <img
                  src={roomState.trackCover.startsWith('http') ? roomState.trackCover : apiUrl(roomState.trackCover)}
                  alt=""
                  className="w-24 h-24 rounded-xl object-cover"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gromq-text truncate">{roomState.trackTitle}</h3>
                    <p className="text-xs text-gromq-muted truncate">{roomState.trackArtist}</p>
                  </div>
                  {!joinedRoom ? (
                    <button onClick={handleJoinRoom}
                      className="mt-2 bg-gromq-green hover:bg-gromq-green/80 text-black font-semibold text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.97]">
                      <Headphones size={14} />
                      Присоединиться
                    </button>
                  ) : (
                    <button onClick={handleLeaveRoom}
                      className="mt-2 text-gromq-green hover:text-gromq-red text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Покинуть комнату">
                      <Equalizer className="!h-3" /> Подключён
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Mobile: suggest track */}
          {joinedRoom && roomState && (
            <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ListPlus size={16} className="text-gromq-green" />
                <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">Предложить трек</h2>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gromq-muted pointer-events-none" />
                <input
                  type="text"
                  value={suggestQuery}
                  onChange={e => handleSuggestSearch(e.target.value)}
                  placeholder="Поиск трека..."
                  className="w-full bg-gromq-surface border border-gromq-border rounded-lg pl-9 pr-3 py-2 text-base sm:text-sm text-gromq-text placeholder:text-gromq-muted focus:outline-none focus:border-gromq-green/50"
                />
              </div>
              {suggestResults.length > 0 && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {suggestResults.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleSuggestTrack(t.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gromq-surface transition-colors text-left"
                    >
                      <img src={t.cover} alt="" className="w-8 h-8 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gromq-text truncate">{t.title}</p>
                        <p className="text-xs text-gromq-muted truncate">{t.artist}</p>
                      </div>
                      <ListPlus size={14} className="text-gromq-green shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {roomState.suggestions && roomState.suggestions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gromq-border space-y-1.5">
                  <p className="text-xs text-gromq-muted font-medium">Предложенные треки:</p>
                  {roomState.suggestions.map(s => (
                    <div key={s.trackId} className="flex items-center gap-3 p-2 rounded-lg bg-gromq-surface">
                      <img src={s.trackCover} alt="" className="w-8 h-8 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gromq-text truncate">{s.trackTitle}</p>
                        <p className="text-xs text-gromq-muted truncate">{s.trackArtist}</p>
                      </div>
                      <span className="text-[10px] text-gromq-muted shrink-0">{s.suggestedByName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <Playlists
            playlists={user.playlists}
            onCreatePlaylist={() => {}}
            onOpenPlaylist={(pl) => { setSelectedPlaylist(pl); setActiveModal('playlist-detail'); }}
            addToast={addToast}
            hideCreate
          />
          <RecentlyListened tracks={historyTracks} />
          {(recPicks.trackOfWeek || recPicks.discovery) && (
            <Recommendations recPicks={recPicks} onPickTrackOfWeek={() => {}} onPickDiscovery={() => {}} readOnly />
          )}
          <ActivityFeed feed={activityFeed} />
          <MusicTaste
            tasteSummary={tasteSummary}
            topArtists={profileStats?.topListenedArtists || []}
            totalPlays={profileStats?.totalPlays || 0}
            nightPercent={nightPercent}
          />
          <AchievementsSection
            totalLiked={user.likedTracksCount}
            playlistsCount={user.playlists.length}
            nightPercent={nightPercent}
            totalPlays={profileStats?.totalPlays || 0}
          />
        </div>
      </main>

      {/* ── Modals ── */}
      {activeModal === 'share' && (
        <ShareModal onClose={() => setActiveModal(null)} addToast={addToast} />
      )}
      {activeModal === 'playlist-detail' && selectedPlaylist && (
        <PlaylistDetailModal playlist={selectedPlaylist} onClose={() => { setActiveModal(null); setSelectedPlaylist(null); }} addToast={addToast} />
      )}

      {/* ── Toasts ── */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
