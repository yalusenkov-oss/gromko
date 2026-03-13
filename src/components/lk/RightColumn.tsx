import {
  Radio,
  Headphones,
  Heart,
  ListMusic,
  Moon,
  Music,
  LogOut,
  Check,
  X,
  ListPlus,
} from "lucide-react";
import { Equalizer } from "./Equalizer";
import { useStore, type Track } from "../../store";
import { apiUrl } from "../../lib/api";
import { Link } from "react-router-dom";

/* ── Live Room ── */
interface RoomListener {
  userId: string;
  name: string;
  avatar: string;
}

interface LiveRoomWidgetProps {
  roomActive: boolean;
  roomListeners: RoomListener[];
  onToggleRoom: () => void;
  addToast: (msg: string) => void;
}

function listenerAvatar(l: RoomListener) {
  if (l.avatar) {
    return l.avatar.startsWith('http') ? l.avatar : apiUrl(`/uploads/${l.avatar.replace(/^\/uploads\//, '')}`);
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(l.name)}&background=2a2a2a&color=fff&size=64`;
}

export function LiveRoomWidget({ roomActive, roomListeners, onToggleRoom }: LiveRoomWidgetProps) {
  const { player, roomSuggestions, setRoomSuggestions, currentUser, playTrack } = useStore();
  const np = player.currentTrack;

  const handleAcceptSuggestion = async (trackId: string) => {
    // Play the suggested track
    const allTracks = useStore.getState().tracks;
    let track: Track | undefined = allTracks.find((t: Track) => t.id === trackId);
    if (!track) {
      try {
        const res = await fetch(apiUrl(`/tracks/${trackId}`));
        if (res.ok) track = await res.json();
      } catch { /* ignore */ }
    }
    if (track) {
      playTrack(track, allTracks);
    }
    // Remove the suggestion from the server
    const token = localStorage.getItem('gromko_token');
    if (token && currentUser) {
      try {
        const res = await fetch(apiUrl(`/listening-room/${currentUser.id}/suggest/${trackId}`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          setRoomSuggestions(d.suggestions || []);
        }
      } catch { /* ignore */ }
    }
  };

  const handleRejectSuggestion = async (trackId: string) => {
    const token = localStorage.getItem('gromko_token');
    if (token && currentUser) {
      try {
        const res = await fetch(apiUrl(`/listening-room/${currentUser.id}/suggest/${trackId}`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          setRoomSuggestions(d.suggestions || []);
        }
      } catch { /* ignore */ }
    }
  };

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-gromq-red/5 rounded-full blur-2xl" />
      <div className="flex items-center gap-2 mb-3 sm:mb-4 relative">
        <div className="relative">
          <Radio size={16} className="text-gromq-red" />
          {roomActive && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-gromq-red rounded-full animate-ping" />}
        </div>
        <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">Live Комната</h2>
        {roomActive && (
          <span className="ml-auto text-[10px] bg-gromq-green/20 text-gromq-green px-2 py-0.5 rounded-full font-medium">
            Активна
          </span>
        )}
      </div>

      <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 relative">
        {roomActive && np ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gromq-red/10 flex items-center justify-center shrink-0">
                <Equalizer />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gromq-text font-medium truncate">{np.title} — {np.artist}</p>
                <p className="text-[11px] text-gromq-muted flex items-center gap-1">
                  <Headphones size={10} />
                  {roomListeners.length} {roomListeners.length === 1 ? 'слушатель' : roomListeners.length < 5 ? 'слушателя' : 'слушателей'}
                </p>
              </div>
            </div>

            {/* Connected listeners list */}
            {roomListeners.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {roomListeners.map((l) => (
                  <Link key={l.userId} to={`/user/${l.userId}`} className="flex items-center gap-2 hover:bg-gromq-border/30 rounded-lg px-1.5 py-1 transition-colors">
                    <img src={listenerAvatar(l)} alt={l.name} className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-xs text-gromq-text font-medium truncate">{l.name}</span>
                    <span className="ml-auto flex items-center gap-0.5">
                      <Equalizer className="!h-2.5" />
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <button onClick={onToggleRoom} className="w-full bg-gromq-surface border border-gromq-border text-gromq-text hover:bg-gromq-border font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.97]">
              <LogOut size={15} />
              Закрыть комнату
            </button>

            {/* Suggestions from listeners */}
            {roomSuggestions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gromq-border">
                <div className="flex items-center gap-1.5 mb-2">
                  <ListPlus size={12} className="text-gromq-green" />
                  <span className="text-[11px] text-gromq-muted font-semibold uppercase tracking-wider">Предложенные треки</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {roomSuggestions.map(s => (
                    <div key={s.trackId} className="flex items-center gap-2 p-1.5 rounded-lg bg-gromq-card border border-gromq-border">
                      <img src={s.trackCover.startsWith('http') ? s.trackCover : apiUrl(s.trackCover)} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gromq-text font-medium truncate">{s.trackTitle}</p>
                        <p className="text-[10px] text-gromq-muted truncate">{s.trackArtist} • от {s.suggestedByName}</p>
                      </div>
                      <button onClick={() => handleAcceptSuggestion(s.trackId)} title="Принять"
                        className="p-1 text-gromq-green hover:bg-gromq-green/10 rounded transition-colors shrink-0">
                        <Check size={14} />
                      </button>
                      <button onClick={() => handleRejectSuggestion(s.trackId)} title="Отклонить"
                        className="p-1 text-gromq-red hover:bg-gromq-red/10 rounded transition-colors shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-gromq-muted mb-3 text-center">
              {np ? 'Начните трансляцию текущего трека' : 'Включите трек, чтобы создать комнату'}
            </p>
            <button
              onClick={np ? onToggleRoom : undefined}
              disabled={!np}
              className="w-full bg-gromq-red hover:bg-gromq-red-dim disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.97] animate-pulse-glow"
            >
              <Headphones size={15} />
              Создать комнату
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Friends List ── */
interface Friend {
  id: string;
  name: string;
  avatar: string;
  isOnline: boolean;
  listeningTrack: { title: string; artist: string; cover: string } | null;
  hasRoom: boolean;
}

interface FriendsListProps {
  friends: Friend[];
  addToast: (msg: string) => void;
}

export function FriendsList({ friends }: FriendsListProps) {
  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider mb-3 sm:mb-4">Подписчики</h2>
      {friends.length === 0 ? (
        <p className="text-sm text-gromq-muted py-4 text-center">Вы ещё ни на кого не подписаны</p>
      ) : (
        <div className="space-y-0">
          {friends.map((f) => (
            <Link key={f.id} to={`/user/${f.id}`} className="flex items-center gap-3 py-2.5 border-b border-gromq-border last:border-0 cursor-pointer hover:bg-gromq-surface/50 active:bg-gromq-surface -mx-2 px-2 rounded-lg transition-colors group">
              <div className="relative shrink-0">
                {f.avatar ? (
                  <img src={f.avatar.startsWith('http') ? f.avatar : apiUrl(`/uploads/${f.avatar.replace(/^\/uploads\//, '')}`)} alt={f.name} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{f.name[0]?.toUpperCase()}</span>
                  </div>
                )}
                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gromq-card ${f.isOnline ? "bg-gromq-green" : "bg-gromq-muted"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gromq-text font-medium truncate">{f.name}</p>
                {f.listeningTrack ? (
                  <p className="text-[11px] text-gromq-red truncate flex items-center gap-1">
                    <Music size={9} />
                    {f.listeningTrack.title} — {f.listeningTrack.artist}
                  </p>
                ) : (
                  <p className="text-[11px] text-gromq-muted">{f.isOnline ? 'Онлайн' : 'Оффлайн'}</p>
                )}
              </div>
              {f.listeningTrack && <Equalizer className="!h-3" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Achievements ── */
interface AchievementsProps {
  totalLiked: number;
  playlistsCount: number;
  nightPercent: number;
  totalPlays: number;
}

export function AchievementsSection({ totalLiked, playlistsCount, nightPercent, totalPlays }: AchievementsProps) {
  const achievements = [
    { label: "Треков лайкнуто", value: totalLiked.toLocaleString(), icon: Heart, colors: "text-pink-400 bg-pink-400/10" },
    { label: "Плейлистов создано", value: String(playlistsCount), icon: ListMusic, colors: "text-blue-400 bg-blue-400/10" },
    ...(nightPercent > 40 ? [{ label: "Бейдж", value: "Ночной слушатель", icon: Moon, colors: "text-gromq-red bg-gromq-red/10" }] : []),
    ...(totalPlays > 100 ? [{ label: "Всего прослушиваний", value: totalPlays.toLocaleString(), icon: Headphones, colors: "text-gromq-green bg-gromq-green/10" }] : []),
  ];

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider mb-3 sm:mb-4">Достижения</h2>
      <div className="space-y-2 sm:space-y-3">
        {achievements.map((a, i) => {
          const Icon = a.icon;
          return (
            <div key={i} className="bg-gromq-surface border border-gromq-border rounded-xl p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${a.colors}`}>
                <Icon size={16} />
              </div>
              <div>
                <p className="text-sm text-gromq-text font-semibold">{a.value}</p>
                <p className="text-[11px] text-gromq-muted">{a.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Right Column wrapper ── */
interface RightColumnProps extends LiveRoomWidgetProps, FriendsListProps, AchievementsProps {}

export function RightColumn(props: RightColumnProps) {
  return (
    <aside className="w-full lg:w-[280px] xl:w-[300px] shrink-0 space-y-4">
      <LiveRoomWidget
        roomActive={props.roomActive}
        roomListeners={props.roomListeners}
        onToggleRoom={props.onToggleRoom}
        addToast={props.addToast}
      />
      <FriendsList friends={props.friends} addToast={props.addToast} />
      <AchievementsSection
        totalLiked={props.totalLiked}
        playlistsCount={props.playlistsCount}
        nightPercent={props.nightPercent}
        totalPlays={props.totalPlays}
      />
    </aside>
  );
}
