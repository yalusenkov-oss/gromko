import {
  Plus,
  Heart,
  Pin,
  Music,
  ListPlus,
  Play,
  Clock,
  Sparkles,
  Star,
  ChevronRight,
  Headphones,
} from "lucide-react";
import { Equalizer } from "./Equalizer";
import { useStore, type Track, type Playlist } from "../../store";
import { apiUrl } from "../../lib/api";
import { formatDuration } from "../../utils/format";

function coverUrl(src: string) {
  if (!src) return '';
  return src.startsWith('http') ? src : apiUrl(src);
}

/* ── Now Playing ── */
interface NowPlayingProps {
  addToast: (msg: string) => void;
  roomActive?: boolean;
  roomListeners?: { userId: string; name: string; avatar: string }[];
  onToggleRoom?: () => void;
}

export function NowPlaying({ addToast, roomActive, roomListeners, onToggleRoom }: NowPlayingProps) {
  const { player, queueNext } = useStore();
  const np = player.currentTrack;

  if (!np) {
    return (
      <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Music size={16} className="text-gromq-muted" />
          <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">Сейчас играет</h2>
        </div>
        <p className="text-sm text-gromq-muted">Ничего не воспроизводится</p>
      </div>
    );
  }

  const progress = player.progress || 0;
  const pct = np.duration > 0 ? (progress / np.duration) * 100 : 0;
  const listeners = roomListeners || [];

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <Equalizer />
        <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">Сейчас играет</h2>
      </div>
      <div className="flex gap-3 sm:gap-4">
        <div className="relative shrink-0 w-24 h-24 sm:w-36 sm:h-36">
          <img src={coverUrl(np.cover)} alt={np.title} className="w-full h-full rounded-xl object-cover shadow-lg shadow-black/30" />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/40 to-transparent" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 sm:py-1">
          <div>
            <h3 className="text-base sm:text-xl font-bold text-gromq-text truncate">{np.title}</h3>
            <p className="text-xs sm:text-sm text-gromq-muted truncate">{np.artist}{np.meta?.album ? ` • ${np.meta.album}` : ''}</p>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="h-1.5 bg-gromq-surface rounded-full overflow-hidden cursor-pointer group">
              <div className="h-full bg-gromq-red rounded-full relative transition-all" style={{ width: `${pct}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
              </div>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[11px] text-gromq-muted">{formatDuration(progress)}</span>
              <span className="text-[11px] text-gromq-muted">{formatDuration(np.duration)}</span>
            </div>
          </div>
          {/* Action buttons — "Слушать вместе" + "+ В очередь" */}
          <div className="flex gap-2 mt-2">
            {onToggleRoom && (
              <button
                onClick={onToggleRoom}
                className={`flex-1 font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.97] ${
                  roomActive
                    ? 'bg-gromq-surface border border-gromq-border text-gromq-text hover:bg-gromq-border'
                    : 'bg-gromq-red hover:bg-gromq-red-dim text-white shadow-lg shadow-gromq-red/20'
                }`}
              >
                <Headphones size={15} />
                {roomActive ? 'Закрыть комнату' : 'Слушать вместе'}
              </button>
            )}
            <button
              onClick={() => { queueNext(np); addToast('Трек добавлен в очередь'); }}
              className="bg-gromq-surface hover:bg-gromq-border transition-colors border border-gromq-border text-gromq-muted text-xs py-2 px-2.5 sm:px-3 rounded-xl flex items-center gap-1.5 active:scale-[0.97]"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">В очередь</span>
            </button>
          </div>
          {/* Listener avatars when room is active */}
          {roomActive && listeners.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2.5">
              <div className="flex -space-x-2">
                {listeners.slice(0, 5).map((l) => (
                  <img
                    key={l.userId}
                    src={l.avatar ? (l.avatar.startsWith('http') ? l.avatar : `/uploads/${l.avatar.replace(/^\/uploads\//, '')}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(l.name)}&background=2a2a2a&color=fff&size=32`}
                    alt={l.name}
                    className="w-6 h-6 rounded-full object-cover border-2 border-gromq-card"
                    title={l.name}
                  />
                ))}
              </div>
              <span className="text-[11px] text-gromq-muted ml-1">
                {listeners.length} {listeners.length === 1 ? 'слушает' : 'слушают'} синхронно
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Playlists ── */
interface PlaylistsProps {
  playlists: Playlist[];
  onCreatePlaylist: () => void;
  onOpenPlaylist: (pl: Playlist) => void;
  addToast: (msg: string) => void;
  hideCreate?: boolean;
}

export function Playlists({ playlists, onCreatePlaylist, onOpenPlaylist, addToast, hideCreate }: PlaylistsProps) {
  const { tracks } = useStore();

  /** Build up to 4 cover URLs from playlist's trackIds */
  function mosaicCovers(pl: Playlist): string[] {
    if (pl.coverUrl) return [pl.coverUrl];
    const out: string[] = [];
    for (const tid of pl.trackIds) {
      const t = tracks.find((tr) => tr.id === tid);
      if (t?.cover) out.push(t.cover);
      if (out.length >= 4) break;
    }
    return out;
  }
  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">Плейлисты</h2>
        {!hideCreate && (
          <button onClick={onCreatePlaylist} className="text-xs text-gromq-red hover:text-gromq-red-dim transition-colors flex items-center gap-1 font-medium active:scale-[0.95]">
            <Plus size={14} /> Создать
          </button>
        )}
      </div>
      {playlists.length === 0 ? (
        <p className="text-sm text-gromq-muted py-4 text-center">{hideCreate ? 'Нет публичных плейлистов' : 'У вас пока нет плейлистов'}</p>
      ) : (
        <div className="space-y-1.5">
          {playlists.map((pl) => {
            const covers = mosaicCovers(pl);
            return (
              <div key={pl.id} onClick={() => onOpenPlaylist(pl)} className="group flex items-center gap-3 bg-gromq-surface/60 border border-transparent hover:border-gromq-border active:border-gromq-border rounded-xl p-2 cursor-pointer hover:bg-gromq-surface active:bg-gromq-surface transition-all">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 bg-gromq-border flex items-center justify-center">
                  {covers.length >= 4 ? (
                    <div className="grid grid-cols-2 w-full h-full">
                      {covers.slice(0, 4).map((c, ci) => (
                        <img key={ci} src={coverUrl(c)} alt="" className="w-full h-full object-cover" />
                      ))}
                    </div>
                  ) : covers.length > 0 ? (
                    <img src={coverUrl(covers[0])} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music size={18} className="text-gromq-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {!pl.isPublic && <Pin size={10} className="text-gromq-red shrink-0" />}
                    <p className="text-sm text-gromq-text font-semibold truncate">{pl.title}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-gromq-muted">{pl.tracksCount} треков</span>
                    <span className="text-[11px] text-gromq-muted flex items-center gap-1">
                      <Heart size={9} className="text-gromq-red" fill="currentColor" />
                      {pl.likesCount}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); addToast(`▶ Играем «${pl.title}»`); }}
                  className="w-8 h-8 rounded-full bg-gromq-red/0 sm:group-hover:bg-gromq-red flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all shrink-0"
                >
                  <Play size={12} className="text-gromq-muted sm:text-white ml-0.5 sm:group-hover:text-white" fill="currentColor" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Recommendations ── */
interface RecPicks {
  trackOfWeek: Track | null;
  discovery: Track | null;
}
interface RecommendationsProps {
  recPicks: RecPicks;
  onPickTrackOfWeek: () => void;
  onPickDiscovery: () => void;
  readOnly?: boolean;
}

export function Recommendations({ recPicks, onPickTrackOfWeek, onPickDiscovery, readOnly }: RecommendationsProps) {
  const { playTrack } = useStore();

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider mb-3 sm:mb-4">Рекомендует</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Track of the Week */}
        {recPicks.trackOfWeek ? (
          <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 hover:border-gromq-red/30 transition-all cursor-pointer group relative active:scale-[0.98]" onClick={() => playTrack(recPicks.trackOfWeek!)}>
            <div className="flex items-center gap-1.5 mb-2">
              <Star size={12} className="text-gromq-amber" fill="currentColor" />
              <span className="text-[11px] text-gromq-amber font-semibold uppercase tracking-wider">Трек недели</span>
            </div>
            <div className="flex gap-3">
              <div className="relative shrink-0">
                <img src={coverUrl(recPicks.trackOfWeek.cover)} alt="" className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-all">
                  <Play size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="white" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gromq-text font-semibold truncate">{recPicks.trackOfWeek.title}</p>
                <p className="text-xs text-gromq-muted truncate">{recPicks.trackOfWeek.artist}</p>
              </div>
            </div>
          </div>
        ) : !readOnly ? (
          <button onClick={onPickTrackOfWeek} className="bg-gromq-surface border border-dashed border-gromq-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-gromq-red/30 transition-colors active:scale-[0.98]">
            <Star size={20} className="text-gromq-amber" />
            <span className="text-xs text-gromq-muted">Выбрать трек недели</span>
          </button>
        ) : null}

        {/* Discovery */}
        {recPicks.discovery ? (
          <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 hover:border-gromq-red/30 transition-all cursor-pointer group relative active:scale-[0.98]" onClick={() => playTrack(recPicks.discovery!)}>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={12} className="text-gromq-red" />
              <span className="text-[11px] text-gromq-red font-semibold uppercase tracking-wider">Моя находка</span>
            </div>
            <div className="flex gap-3">
              <div className="relative shrink-0">
                <img src={coverUrl(recPicks.discovery.cover)} alt="" className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-all">
                  <Play size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="white" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gromq-text font-semibold truncate">{recPicks.discovery.title}</p>
                <p className="text-xs text-gromq-muted truncate">{recPicks.discovery.artist}</p>
              </div>
            </div>
          </div>
        ) : !readOnly ? (
          <button onClick={onPickDiscovery} className="bg-gromq-surface border border-dashed border-gromq-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-gromq-red/30 transition-colors active:scale-[0.98]">
            <Sparkles size={20} className="text-gromq-red" />
            <span className="text-xs text-gromq-muted">Выбрать находку</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ── Activity Feed ── */
interface ActivityItem {
  type: string;
  trackTitle?: string;
  trackArtist?: string;
  trackCover?: string;
  artistName?: string;
  createdAt: string;
}
interface ActivityFeedProps {
  feed: ActivityItem[];
}

export function ActivityFeed({ feed }: ActivityFeedProps) {
  const iconMap: Record<string, typeof Music> = {
    play: Music,
    like: Heart,
    finish: Music,
    follow_artist: Heart,
    add_to_playlist: ListPlus,
    share: Music,
    playlist_create: ListPlus,
    playlist_add: ListPlus,
  };
  const colorMap: Record<string, string> = {
    play: "text-gromq-red",
    like: "text-pink-400",
    finish: "text-gromq-green",
    follow_artist: "text-purple-400",
    add_to_playlist: "text-blue-400",
    share: "text-amber-400",
    playlist_create: "text-blue-400",
    playlist_add: "text-blue-400",
  };

  function describeEvent(item: ActivityItem) {
    switch (item.type) {
      case 'play': return `Слушал «${item.trackTitle || ''}» — ${item.trackArtist || ''}`;
      case 'like': return `Лайкнул трек «${item.trackTitle || ''}» — ${item.trackArtist || ''}`;
      case 'finish': return `Дослушал «${item.trackTitle || ''}» — ${item.trackArtist || ''}`;
      case 'follow_artist': return `Подписался на ${item.artistName || 'артиста'}`;
      case 'add_to_playlist': return `Добавил «${item.trackTitle || 'трек'}» в плейлист`;
      case 'share': return `Поделился треком «${item.trackTitle || ''}»`;
      case 'playlist_create': return `Создал новый плейлист`;
      case 'playlist_add': return `Добавил трек в плейлист`;
      default: return item.type;
    }
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Сейчас';
    if (mins < 60) return `${mins} мин назад`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ч назад`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Вчера';
    return `${days} дн назад`;
  }

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider mb-3 sm:mb-4">Лента активности</h2>
      {feed.length === 0 ? (
        <p className="text-sm text-gromq-muted py-4 text-center">Пока нет активности</p>
      ) : (
        <div className="space-y-0">
          {feed.slice(0, 5).map((item, i) => {
            const Icon = iconMap[item.type] || Music;
            const color = colorMap[item.type] || "text-gromq-muted";
            return (
              <div key={i} className="flex items-start gap-3 py-2.5 sm:py-3 border-b border-gromq-border last:border-0">
                <div className={`w-7 h-7 rounded-full bg-gromq-surface flex items-center justify-center shrink-0 mt-0.5 ${color}`}>
                  <Icon size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gromq-text leading-snug">{describeEvent(item)}</p>
                  <p className="text-[11px] text-gromq-muted mt-0.5 flex items-center gap-1">
                    <Clock size={10} />
                    {timeAgo(item.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Recently Listened ── */
interface RecentTrack extends Track {
  playedAt?: string;
}
interface RecentlyListenedProps {
  tracks: RecentTrack[];
}

export function RecentlyListened({ tracks }: RecentlyListenedProps) {
  const { playTrack } = useStore();

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">Недавно слушал</h2>
        <button className="text-xs text-gromq-muted hover:text-gromq-text transition-colors flex items-center gap-0.5">
          Все <ChevronRight size={14} />
        </button>
      </div>
      {tracks.length === 0 ? (
        <p className="text-sm text-gromq-muted py-4 text-center">Нет истории прослушиваний</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 -mx-1 px-1">
          {tracks.slice(0, 8).map((t, i) => (
            <div key={i} className="shrink-0 w-24 sm:w-28 group cursor-pointer active:scale-[0.96] transition-transform" onClick={() => playTrack(t)}>
              <div className="relative rounded-xl overflow-hidden mb-2">
                <img src={coverUrl(t.cover)} alt={t.title} className="w-24 h-24 sm:w-28 sm:h-28 object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                  <Play size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="white" />
                </div>
              </div>
              <p className="text-xs text-gromq-text font-medium truncate">{t.title}</p>
              <p className="text-[11px] text-gromq-muted truncate">{t.artist}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── CenterColumn wrapper ── */
interface CenterColumnProps {
  playlists: Playlist[];
  feed: ActivityItem[];
  historyTracks: RecentTrack[];
  recPicks: RecPicks;
  onCreatePlaylist: () => void;
  onOpenPlaylist: (pl: Playlist) => void;
  onPickTrackOfWeek: () => void;
  onPickDiscovery: () => void;
  addToast: (msg: string) => void;
  roomActive?: boolean;
  roomListeners?: { userId: string; name: string; avatar: string }[];
  onToggleRoom?: () => void;
}

export function CenterColumn(props: CenterColumnProps) {
  return (
    <div className="flex-1 min-w-0 space-y-4">
      <NowPlaying addToast={props.addToast} roomActive={props.roomActive} roomListeners={props.roomListeners} onToggleRoom={props.onToggleRoom} />
      <Playlists playlists={props.playlists} onCreatePlaylist={props.onCreatePlaylist} onOpenPlaylist={props.onOpenPlaylist} addToast={props.addToast} />
      <Recommendations recPicks={props.recPicks} onPickTrackOfWeek={props.onPickTrackOfWeek} onPickDiscovery={props.onPickDiscovery} />
      <ActivityFeed feed={props.feed} />
      <RecentlyListened tracks={props.historyTracks} />
    </div>
  );
}
