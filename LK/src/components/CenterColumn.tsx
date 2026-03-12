import { useState } from "react";
import {
  Headphones,
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
} from "lucide-react";
import {
  currentTrack,
  recommendations,
  activityFeed,
  recentAlbums,
} from "../data/mockData";
import { useApp } from "../context/AppContext";
import { Equalizer } from "./Equalizer";

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/* ── Now Playing ────────────────────────────────────────── */
export function NowPlaying() {
  const { openModal, setListeningTogether, addToast } = useApp();
  const progress = (currentTrack.currentTime / currentTrack.duration) * 100;

  const handleListenTogether = () => {
    setListeningTogether(true);
    openModal("listen-together");
  };

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up">
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <Equalizer />
        <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">
          Сейчас играет
        </h2>
      </div>
      <div className="flex gap-3 sm:gap-4">
        <div className="relative shrink-0">
          <img
            src={currentTrack.cover}
            alt={currentTrack.title}
            className="w-24 h-24 sm:w-36 sm:h-36 rounded-xl object-cover shadow-lg shadow-black/30"
          />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/40 to-transparent" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 sm:py-1">
          <div>
            <h3 className="text-base sm:text-xl font-bold text-gromq-text truncate">
              {currentTrack.title}
            </h3>
            <p className="text-xs sm:text-sm text-gromq-muted truncate">
              {currentTrack.artist} • {currentTrack.album}
            </p>
          </div>

          {/* Progress */}
          <div className="mt-2 sm:mt-3">
            <div className="h-1.5 bg-gromq-surface rounded-full overflow-hidden cursor-pointer group">
              <div
                className="h-full bg-gromq-red rounded-full relative transition-all"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
              </div>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[11px] text-gromq-muted">
                {formatTime(currentTrack.currentTime)}
              </span>
              <span className="text-[11px] text-gromq-muted">
                {formatTime(currentTrack.duration)}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleListenTogether}
              className="flex-1 bg-gromq-red hover:bg-gromq-red-dim transition-colors text-white font-semibold text-xs py-2 sm:py-2.5 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.97]"
            >
              <Headphones size={14} />
              <span className="hidden sm:inline">Слушать вместе</span>
              <span className="sm:hidden">Вместе</span>
            </button>
            <button
              onClick={() => addToast("Трек добавлен в очередь")}
              className="bg-gromq-surface hover:bg-gromq-border transition-colors border border-gromq-border text-gromq-muted text-xs py-2 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 active:scale-[0.97]"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">В очередь</span>
            </button>
          </div>

          {/* Sync listeners */}
          <div className="flex items-center gap-2 mt-2 sm:mt-3">
            <div className="flex -space-x-2">
              {currentTrack.listenersSync.map((l, i) => (
                <img
                  key={i}
                  src={l.avatar}
                  alt={l.name}
                  title={l.name}
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-gromq-card object-cover"
                />
              ))}
            </div>
            <span className="text-[10px] sm:text-[11px] text-gromq-muted">
              {currentTrack.listenersSync.length} слушают
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Playlists (compact) ────────────────────────────────── */
export function Playlists() {
  const { allPlaylists, openModal, setSelectedPlaylist, addToast } = useApp();

  const handleOpenPlaylist = (pl: (typeof allPlaylists)[0]) => {
    setSelectedPlaylist(pl);
    openModal("playlist-detail");
  };

  return (
    <div
      className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up"
      style={{ animationDelay: "0.1s" }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">
          Плейлисты
        </h2>
        <button
          onClick={() => openModal("create-playlist")}
          className="text-xs text-gromq-red hover:text-gromq-red-dim transition-colors flex items-center gap-1 font-medium active:scale-[0.95]"
        >
          <Plus size={14} />
          Создать
        </button>
      </div>

      <div className="space-y-1.5">
        {allPlaylists.map((pl) => (
          <div
            key={pl.id}
            onClick={() => handleOpenPlaylist(pl)}
            className="group flex items-center gap-3 bg-gromq-surface/60 border border-transparent hover:border-gromq-border active:border-gromq-border rounded-xl p-2 cursor-pointer hover:bg-gromq-surface active:bg-gromq-surface transition-all"
          >
            {/* Mini mosaic cover */}
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden grid grid-cols-2 shrink-0">
              {pl.covers.map((c, i) => (
                <img
                  key={i}
                  src={c}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ))}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {pl.pinned && (
                  <Pin size={10} className="text-gromq-red shrink-0" />
                )}
                <p className="text-sm text-gromq-text font-semibold truncate">
                  {pl.name}
                </p>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[11px] text-gromq-muted">
                  {pl.trackCount} треков
                </span>
                <span className="text-[11px] text-gromq-muted flex items-center gap-1">
                  <Heart
                    size={9}
                    className="text-gromq-red"
                    fill="currentColor"
                  />
                  {pl.likes}
                </span>
              </div>
            </div>

            {/* Play hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                addToast(`▶ Играем «${pl.name}»`);
              }}
              className="w-8 h-8 rounded-full bg-gromq-red/0 sm:group-hover:bg-gromq-red flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all shrink-0"
            >
              <Play size={12} className="text-gromq-muted sm:text-white ml-0.5 sm:group-hover:text-white" fill="currentColor" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Recommendations ────────────────────────────────────── */
export function Recommendations() {
  const { addToast } = useApp();
  const [weekLiked, setWeekLiked] = useState(false);
  const [discoveryLiked, setDiscoveryLiked] = useState(false);

  return (
    <div
      className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up"
      style={{ animationDelay: "0.15s" }}
    >
      <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider mb-3 sm:mb-4">
        Рекомендует
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Track of the Week */}
        <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 hover:border-gromq-red/30 transition-all cursor-pointer group relative active:scale-[0.98]">
          <div className="flex items-center gap-1.5 mb-2">
            <Star size={12} className="text-gromq-amber" fill="currentColor" />
            <span className="text-[11px] text-gromq-amber font-semibold uppercase tracking-wider">
              Трек недели
            </span>
          </div>
          <div className="flex gap-3">
            <div className="relative shrink-0">
              <img
                src={recommendations.trackOfWeek.cover}
                alt=""
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-all">
                <Play
                  size={16}
                  className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="white"
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gromq-text font-semibold truncate">
                {recommendations.trackOfWeek.title}
              </p>
              <p className="text-xs text-gromq-muted truncate">
                {recommendations.trackOfWeek.artist}
              </p>
              <p className="text-[11px] text-gromq-muted mt-1 line-clamp-2 italic hidden sm:block">
                «{recommendations.trackOfWeek.comment}»
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setWeekLiked(!weekLiked);
              addToast(weekLiked ? "Убрано из избранного" : "💜 Добавлено в избранное");
            }}
            className={`absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              weekLiked
                ? "bg-gromq-red/20 text-gromq-red"
                : "bg-gromq-card/80 text-gromq-muted opacity-0 group-hover:opacity-100"
            }`}
          >
            <Heart size={12} fill={weekLiked ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Discovery */}
        <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 hover:border-gromq-red/30 transition-all cursor-pointer group relative active:scale-[0.98]">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={12} className="text-gromq-red" />
            <span className="text-[11px] text-gromq-red font-semibold uppercase tracking-wider">
              Моя находка
            </span>
          </div>
          <div className="flex gap-3">
            <div className="relative shrink-0">
              <img
                src={recommendations.discovery.cover}
                alt=""
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-all">
                <Play
                  size={16}
                  className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="white"
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gromq-text font-semibold truncate">
                {recommendations.discovery.title}
              </p>
              <p className="text-xs text-gromq-muted truncate">
                {recommendations.discovery.artist}
              </p>
              <p className="text-[11px] text-gromq-muted mt-1 line-clamp-2 italic hidden sm:block">
                «{recommendations.discovery.comment}»
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDiscoveryLiked(!discoveryLiked);
              addToast(discoveryLiked ? "Убрано из избранного" : "💜 Добавлено в избранное");
            }}
            className={`absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              discoveryLiked
                ? "bg-gromq-red/20 text-gromq-red"
                : "bg-gromq-card/80 text-gromq-muted opacity-0 group-hover:opacity-100"
            }`}
          >
            <Heart size={12} fill={discoveryLiked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Activity Feed ──────────────────────────────────────── */
export function ActivityFeed() {
  const { addToast } = useApp();
  const [likedItems, setLikedItems] = useState<Set<number>>(new Set());

  const iconMap = {
    listening: Music,
    like: Heart,
    playlist: ListPlus,
  };
  const colorMap = {
    listening: "text-gromq-red",
    like: "text-pink-400",
    playlist: "text-blue-400",
  };

  const toggleLike = (idx: number) => {
    setLikedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
        addToast("Лайк убран");
      } else {
        next.add(idx);
        addToast("❤️ Понравилось");
      }
      return next;
    });
  };

  return (
    <div
      className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up"
      style={{ animationDelay: "0.2s" }}
    >
      <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider mb-3 sm:mb-4">
        Лента активности
      </h2>
      <div className="space-y-0">
        {activityFeed.map((item, i) => {
          const Icon = iconMap[item.type];
          return (
            <div
              key={i}
              className="flex items-start gap-3 py-2.5 sm:py-3 border-b border-gromq-border last:border-0 group"
            >
              <div
                className={`w-7 h-7 rounded-full bg-gromq-surface flex items-center justify-center shrink-0 mt-0.5 ${colorMap[item.type]}`}
              >
                <Icon size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gromq-text leading-snug">
                  {item.text}
                </p>
                <p className="text-[11px] text-gromq-muted mt-0.5 flex items-center gap-1">
                  <Clock size={10} />
                  {item.time}
                </p>
              </div>
              {/* Quick like */}
              <button
                onClick={() => toggleLike(i)}
                className={`shrink-0 mt-1 w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                  likedItems.has(i)
                    ? "text-gromq-red opacity-100"
                    : "text-gromq-muted opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
                }`}
              >
                <Heart
                  size={13}
                  fill={likedItems.has(i) ? "currentColor" : "none"}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Recently Listened ──────────────────────────────────── */
export function RecentlyListened() {
  const { addToast } = useApp();

  return (
    <div
      className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up"
      style={{ animationDelay: "0.25s" }}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">
          Недавно слушал
        </h2>
        <button className="text-xs text-gromq-muted hover:text-gromq-text transition-colors flex items-center gap-0.5">
          Все <ChevronRight size={14} />
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 -mx-1 px-1">
        {recentAlbums.map((a, i) => (
          <div
            key={i}
            className="shrink-0 w-24 sm:w-28 group cursor-pointer active:scale-[0.96] transition-transform"
            onClick={() => addToast(`▶ Играем «${a.title}»`)}
          >
            <div className="relative rounded-xl overflow-hidden mb-2">
              <img
                src={a.cover}
                alt={a.title}
                className="w-24 h-24 sm:w-28 sm:h-28 object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                <Play
                  size={24}
                  className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="white"
                />
              </div>
            </div>
            <p className="text-xs text-gromq-text font-medium truncate">
              {a.title}
            </p>
            <p className="text-[11px] text-gromq-muted truncate">{a.artist}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Root (desktop only wrapper) ────────────────────────── */
export function CenterColumn() {
  return (
    <div className="flex-1 min-w-0 space-y-4">
      <NowPlaying />
      <Playlists />
      <Recommendations />
      <ActivityFeed />
      <RecentlyListened />
    </div>
  );
}
