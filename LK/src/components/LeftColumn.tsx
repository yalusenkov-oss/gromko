import {
  Users,
  UserPlus,
  UserCheck,
  ListMusic,
  Headphones,
  Share2,
  Moon,
} from "lucide-react";
import { user, currentTrack, genres, favoriteArtists } from "../data/mockData";
import { useApp } from "../context/AppContext";
import { Equalizer } from "./Equalizer";

function StatBadge({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Icon size={14} className="text-gromq-muted" />
      <span className="text-sm font-semibold text-gromq-text">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      <span className="text-[11px] text-gromq-muted">{label}</span>
    </div>
  );
}

export function ProfileCard() {
  const {
    isSubscribed,
    toggleSubscribe,
    addToast,
    openModal,
    setListeningTogether,
    allPlaylists,
  } = useApp();

  const handleSubscribe = () => {
    toggleSubscribe();
    addToast(
      isSubscribed
        ? "Вы отписались от @dkravtsov"
        : "Вы подписались на @dkravtsov",
    );
  };

  const handleListenTogether = () => {
    setListeningTogether(true);
    openModal("listen-together");
  };

  const handleShare = () => {
    openModal("share");
  };

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up">
      {/* Avatar + info - horizontal on mobile, vertical on desktop */}
      <div className="flex items-center gap-4 sm:flex-col sm:items-center">
        <div className="relative shrink-0">
          <img
            src={user.avatar}
            alt={user.name}
            className="w-18 h-18 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-gromq-border"
          />
          {user.isOnline && (
            <div className="absolute bottom-1 right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-gromq-green rounded-full border-2 border-gromq-card" />
          )}
          {user.isListening && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gromq-card border border-gromq-border rounded-full px-2 py-0.5 flex items-center gap-1.5">
              <Equalizer />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 sm:text-center sm:mt-1">
          <h1 className="text-lg font-bold text-gromq-text">{user.name}</h1>
          <span className="text-sm text-gromq-muted">{user.handle}</span>
          {user.bio && (
            <p className="text-xs text-gromq-muted mt-1 sm:mt-2 leading-relaxed line-clamp-2 sm:line-clamp-none">
              {user.bio}
            </p>
          )}
        </div>
      </div>

      {/* Live Status */}
      {user.isListening && (
        <div
          className="mt-3 sm:mt-4 bg-gromq-surface border border-gromq-border rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-gromq-red/30 transition-colors active:scale-[0.98]"
          onClick={handleListenTogether}
        >
          <img
            src={currentTrack.cover}
            alt=""
            className="w-10 h-10 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gromq-red font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-gromq-red rounded-full animate-pulse" />
              Сейчас слушает
            </p>
            <p className="text-sm text-gromq-text truncate font-medium">
              {currentTrack.title}
            </p>
            <p className="text-xs text-gromq-muted truncate">
              {currentTrack.artist}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-3 sm:mt-4 flex justify-around py-3 border-t border-b border-gromq-border">
        <StatBadge
          icon={Users}
          value={isSubscribed ? user.followers + 1 : user.followers}
          label="Подписчики"
        />
        <StatBadge icon={UserPlus} value={user.following} label="Подписки" />
        <StatBadge
          icon={ListMusic}
          value={allPlaylists.length}
          label="Плейлисты"
        />
      </div>

      {/* Action Buttons */}
      <div className="mt-3 sm:mt-4 space-y-2">
        <button
          onClick={handleSubscribe}
          className={`w-full font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] ${
            isSubscribed
              ? "bg-gromq-surface border border-gromq-border text-gromq-text hover:bg-gromq-border"
              : "bg-gromq-red hover:bg-gromq-red-dim text-white"
          }`}
        >
          {isSubscribed ? (
            <>
              <UserCheck size={16} />
              Вы подписаны
            </>
          ) : (
            <>
              <UserPlus size={16} />
              Подписаться
            </>
          )}
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleListenTogether}
            className="flex-1 bg-gromq-surface hover:bg-gromq-border transition-colors border border-gromq-border text-gromq-text font-medium text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 animate-pulse-glow active:scale-[0.97]"
          >
            <Headphones size={16} className="text-gromq-red" />
            <span className="hidden xs:inline">Слушать вместе</span>
            <span className="xs:hidden">Вместе</span>
          </button>
          <button
            onClick={handleShare}
            className="bg-gromq-surface hover:bg-gromq-border transition-colors border border-gromq-border text-gromq-muted text-sm py-2.5 px-3 rounded-xl active:scale-[0.97]"
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MusicTaste() {
  return (
    <div
      className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up"
      style={{ animationDelay: "0.1s" }}
    >
      <h2 className="text-sm font-semibold text-gromq-text mb-4 uppercase tracking-wider">
        Музыкальный вкус
      </h2>

      {/* Genres */}
      <div className="space-y-3">
        {genres.map((g) => (
          <div key={g.name}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gromq-text font-medium">{g.name}</span>
              <span className="text-gromq-muted">{g.percent}%</span>
            </div>
            <div className="h-1.5 bg-gromq-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gromq-red to-gromq-red-dim rounded-full transition-all duration-1000"
                style={{ width: `${g.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Favorite Artists */}
      <div className="mt-5 pt-4 border-t border-gromq-border">
        <h3 className="text-xs font-semibold text-gromq-muted mb-3 uppercase tracking-wider">
          Любимые артисты
        </h3>
        <div className="space-y-3">
          {favoriteArtists.map((a) => (
            <div
              key={a.name}
              className="flex items-center gap-3 cursor-pointer hover:bg-gromq-surface/50 active:bg-gromq-surface -mx-2 px-2 py-1 rounded-lg transition-colors"
            >
              <img
                src={a.avatar}
                alt={a.name}
                className="w-9 h-9 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gromq-text font-medium truncate">
                  {a.name}
                </p>
                <p className="text-[11px] text-gromq-muted">{a.monthly}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Night Listener Badge */}
      <div className="mt-4 pt-4 border-t border-gromq-border">
        <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gromq-red/10 flex items-center justify-center shrink-0">
            <Moon size={16} className="text-gromq-red" />
          </div>
          <div>
            <p className="text-sm text-gromq-text font-semibold">
              Ночной слушатель
            </p>
            <p className="text-[11px] text-gromq-muted">
              72% прослушиваний после полуночи
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LeftColumn() {
  return (
    <aside className="w-full lg:w-[300px] xl:w-[320px] shrink-0 space-y-4">
      <ProfileCard />
      <MusicTaste />
    </aside>
  );
}
