import {
  Radio,
  Headphones,
  Heart,
  ListMusic,
  Moon,
  Music,
  LogOut,
} from "lucide-react";
import { liveRoom, friends, achievements } from "../data/mockData";
import { useApp } from "../context/AppContext";
import { Equalizer } from "./Equalizer";

export function LiveRoomWidget() {
  const { joinedLiveRoom, setJoinedLiveRoom, addToast } = useApp();

  const handleToggle = () => {
    if (joinedLiveRoom) {
      setJoinedLiveRoom(false);
      addToast("Вы покинули комнату");
    } else {
      setJoinedLiveRoom(true);
      addToast("🎧 Вы присоединились к комнате");
    }
  };

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up relative overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-gromq-red/5 rounded-full blur-2xl" />

      <div className="flex items-center gap-2 mb-3 sm:mb-4 relative">
        <div className="relative">
          <Radio size={16} className="text-gromq-red" />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-gromq-red rounded-full animate-ping" />
        </div>
        <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider">
          Live Комната
        </h2>
        {joinedLiveRoom && (
          <span className="ml-auto text-[10px] bg-gromq-green/20 text-gromq-green px-2 py-0.5 rounded-full font-medium">
            Вы в комнате
          </span>
        )}
      </div>

      <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-gromq-red/10 flex items-center justify-center shrink-0">
            <Equalizer />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gromq-text font-medium truncate">
              {liveRoom.currentTrack}
            </p>
            <p className="text-[11px] text-gromq-muted flex items-center gap-1">
              <Headphones size={10} />
              {joinedLiveRoom ? liveRoom.listeners + 1 : liveRoom.listeners}{" "}
              слушателей
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          className={`w-full font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] ${
            joinedLiveRoom
              ? "bg-gromq-surface border border-gromq-border text-gromq-text hover:bg-gromq-border"
              : "bg-gromq-red hover:bg-gromq-red-dim text-white animate-pulse-glow"
          }`}
        >
          {joinedLiveRoom ? (
            <>
              <LogOut size={15} />
              Покинуть
            </>
          ) : (
            <>
              <Headphones size={15} />
              Присоединиться
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function FriendsList() {
  const { addToast } = useApp();

  return (
    <div
      className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up"
      style={{ animationDelay: "0.1s" }}
    >
      <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider mb-3 sm:mb-4">
        Друзья
      </h2>
      <div className="space-y-0">
        {friends.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-2.5 border-b border-gromq-border last:border-0 cursor-pointer hover:bg-gromq-surface/50 active:bg-gromq-surface -mx-2 px-2 rounded-lg transition-colors group"
            onClick={() =>
              addToast(
                f.listening
                  ? `🎵 ${f.name} слушает: ${f.listening}`
                  : `Открываем профиль ${f.name}`,
                "info",
              )
            }
          >
            <div className="relative shrink-0">
              <img
                src={f.avatar}
                alt={f.name}
                className="w-9 h-9 rounded-full object-cover"
              />
              <div
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gromq-card ${
                  f.online ? "bg-gromq-green" : "bg-gromq-muted"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gromq-text font-medium truncate">
                {f.name}
              </p>
              {f.listening ? (
                <p className="text-[11px] text-gromq-red truncate flex items-center gap-1">
                  <Music size={9} />
                  {f.listening}
                </p>
              ) : (
                <p className="text-[11px] text-gromq-muted">
                  {f.online ? "Онлайн" : "Оффлайн"}
                </p>
              )}
            </div>
            {f.listening && (
              <div className="shrink-0">
                <Equalizer className="!h-3" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AchievementsSection() {
  const iconMap = {
    heart: Heart,
    list: ListMusic,
    badge: Moon,
  };
  const colorMap = {
    heart: "text-pink-400 bg-pink-400/10",
    list: "text-blue-400 bg-blue-400/10",
    badge: "text-gromq-red bg-gromq-red/10",
  };

  return (
    <div
      className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5 animate-slide-up"
      style={{ animationDelay: "0.15s" }}
    >
      <h2 className="text-sm font-semibold text-gromq-text uppercase tracking-wider mb-3 sm:mb-4">
        Достижения
      </h2>
      <div className="space-y-2 sm:space-y-3">
        {achievements.map((a, i) => {
          const Icon = iconMap[a.icon];
          const colors = colorMap[a.icon];
          return (
            <div
              key={i}
              className="bg-gromq-surface border border-gromq-border rounded-xl p-3 flex items-center gap-3"
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${colors}`}
              >
                <Icon size={16} />
              </div>
              <div>
                <p className="text-sm text-gromq-text font-semibold">
                  {a.value}
                </p>
                <p className="text-[11px] text-gromq-muted">{a.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RightColumn() {
  return (
    <aside className="w-full lg:w-[280px] xl:w-[300px] shrink-0 space-y-4">
      <LiveRoomWidget />
      <FriendsList />
      <AchievementsSection />
    </aside>
  );
}
