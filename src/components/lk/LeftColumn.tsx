import {
  Users,
  UserPlus,
  ListMusic,
  Share2,
  Moon,
  Edit3,
  LogOut,
} from "lucide-react";
import { Equalizer } from "./Equalizer";
import { useStore } from "../../store";
import { apiUrl } from "../../lib/api";

interface TasteSummary {
  topGenres: { genre: string; count: number }[];
  topArtists: { slug: string; name?: string; count: number }[];
}

interface ProfileCardProps {
  followersCount: number;
  followingCount: number;
  playlistCount: number;
  onShare: () => void;
  onEditProfile: () => void;
  onLogout: () => void;
}

export function ProfileCard({
  followersCount,
  followingCount,
  playlistCount,
  onShare,
  onEditProfile,
  onLogout,
}: ProfileCardProps) {
  const { currentUser, player } = useStore();
  const nowPlaying = player.currentTrack;
  const isPlaying = player.isPlaying;

  if (!currentUser) return null;

  const avatar = currentUser.avatar
    ? (currentUser.avatar.startsWith('http') ? currentUser.avatar : apiUrl(`/uploads/${currentUser.avatar.replace(/^\/uploads\//, '')}`))
    : '';

  return (
    <div className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5">
      {/* Avatar + info */}
      <div className="flex items-center gap-4 sm:flex-col sm:items-center">
        <div className="relative shrink-0">
          {avatar ? (
            <img
              src={avatar}
              alt={currentUser.name}
              className="w-18 h-18 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-gromq-border"
            />
          ) : (
            <div className="w-18 h-18 sm:w-24 sm:h-24 rounded-full border-2 border-gromq-border bg-red-500 flex items-center justify-center">
              <span className="text-white text-2xl sm:text-3xl font-black">
                {currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute bottom-1 right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-gromq-green rounded-full border-2 border-gromq-card" />
          {isPlaying && nowPlaying && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gromq-card border border-gromq-border rounded-full px-2 py-0.5 flex items-center gap-1.5">
              <Equalizer />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 sm:text-center sm:mt-1">
          <h1 className="text-lg font-bold text-gromq-text">{currentUser.name}</h1>
          <span className="text-sm text-gromq-muted">@{currentUser.username || currentUser.name.toLowerCase().replace(/\s+/g, '')}</span>
          {currentUser.bio && (
            <p className="text-xs text-gromq-muted mt-1 sm:mt-2 leading-relaxed line-clamp-2 sm:line-clamp-none">
              {currentUser.bio}
            </p>
          )}
        </div>
      </div>

      {/* Live Status */}
      {isPlaying && nowPlaying && (
        <div
          className="mt-3 sm:mt-4 bg-gromq-surface border border-gromq-border rounded-xl p-3 flex items-center gap-3"
        >
          <img
            src={nowPlaying.cover.startsWith('http') ? nowPlaying.cover : apiUrl(nowPlaying.cover)}
            alt=""
            className="w-10 h-10 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gromq-red font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-gromq-red rounded-full animate-pulse" />
              Сейчас слушает
            </p>
            <p className="text-sm text-gromq-text truncate font-medium">{nowPlaying.title}</p>
            <p className="text-xs text-gromq-muted truncate">{nowPlaying.artist}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-3 sm:mt-4 flex justify-around py-3 border-t border-b border-gromq-border">
        <StatBadge icon={Users} value={followersCount} label="Подписчики" />
        <StatBadge icon={UserPlus} value={followingCount} label="Подписки" />
        <StatBadge icon={ListMusic} value={playlistCount} label="Плейлисты" />
      </div>

      {/* Action Buttons */}
      <div className="mt-3 sm:mt-4 space-y-2">
        <button
          onClick={onEditProfile}
          className="w-full bg-gromq-surface border border-gromq-border text-gromq-text font-medium text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-gromq-border transition-colors active:scale-[0.97]"
        >
          <Edit3 size={16} />
          Редактировать профиль
        </button>
        <div className="flex gap-2">
          <button
            onClick={onShare}
            className="bg-gromq-surface hover:bg-gromq-border transition-colors border border-gromq-border text-gromq-muted text-sm py-2.5 px-3 rounded-xl flex items-center justify-center active:scale-[0.97]"
            title="Поделиться"
          >
            <Share2 size={16} />
          </button>
          <button
            onClick={onLogout}
            className="bg-gromq-surface hover:bg-red-500/10 hover:border-red-500/30 transition-colors border border-gromq-border text-gromq-muted hover:text-red-400 text-sm py-2.5 px-3 rounded-xl active:scale-[0.97]"
            title="Выйти"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBadge({ icon: Icon, value, label }: { icon: React.ElementType; value: number | string; label: string }) {
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

interface MusicTasteProps {
  tasteSummary: TasteSummary | null;
  topArtists: { name: string; slug: string; photo: string; plays: number }[];
  totalPlays: number;
  nightPercent: number;
}

export function MusicTaste({ tasteSummary, topArtists, nightPercent }: MusicTasteProps) {
  const maxGenre = tasteSummary?.topGenres?.[0]?.count || 1;

  return (
    <div
      className="bg-gromq-card border border-gromq-border rounded-2xl p-4 sm:p-5"
     
    >
      <h2 className="text-sm font-semibold text-gromq-text mb-4 uppercase tracking-wider">
        Музыкальный вкус
      </h2>

      {/* Genres */}
      <div className="space-y-3">
        {(tasteSummary?.topGenres || []).slice(0, 5).map((g) => {
          const pct = Math.round((g.count / maxGenre) * 100);
          return (
            <div key={g.genre}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gromq-text font-medium">{g.genre}</span>
                <span className="text-gromq-muted">{pct}%</span>
              </div>
              <div className="h-1.5 bg-gromq-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gromq-red to-gromq-red-dim rounded-full transition-all duration-1000"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {(!tasteSummary?.topGenres || tasteSummary.topGenres.length === 0) && (
          <p className="text-xs text-gromq-muted">Слушайте больше музыки, чтобы увидеть статистику</p>
        )}
      </div>

      {/* Favorite Artists */}
      {topArtists.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gromq-border">
          <h3 className="text-xs font-semibold text-gromq-muted mb-3 uppercase tracking-wider">
            Любимые артисты
          </h3>
          <div className="space-y-3">
            {topArtists.slice(0, 3).map((a) => (
              <div
                key={a.slug}
                className="flex items-center gap-3 cursor-pointer hover:bg-gromq-surface/50 active:bg-gromq-surface -mx-2 px-2 py-1 rounded-lg transition-colors"
              >
                <img
                  src={a.photo ? (a.photo.startsWith('http') ? a.photo : apiUrl(a.photo)) : `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=2a2a2a&color=fff&size=64`}
                  alt={a.name}
                  className="w-9 h-9 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gromq-text font-medium truncate">{a.name}</p>
                  <p className="text-[11px] text-gromq-muted">{a.plays.toLocaleString()} прослушиваний</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Night Listener Badge */}
      {nightPercent > 40 && (
        <div className="mt-4 pt-4 border-t border-gromq-border">
          <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gromq-red/10 flex items-center justify-center shrink-0">
              <Moon size={16} className="text-gromq-red" />
            </div>
            <div>
              <p className="text-sm text-gromq-text font-semibold">Ночной слушатель</p>
              <p className="text-[11px] text-gromq-muted">{nightPercent}% прослушиваний после полуночи</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LeftColumn(props: ProfileCardProps & MusicTasteProps) {
  return (
    <aside className="w-full lg:w-[300px] xl:w-[320px] shrink-0 space-y-4">
      <ProfileCard
        followersCount={props.followersCount}
        followingCount={props.followingCount}
        playlistCount={props.playlistCount}
        onShare={props.onShare}
        onEditProfile={props.onEditProfile}
        onLogout={props.onLogout}
      />
      <MusicTaste
        tasteSummary={props.tasteSummary}
        topArtists={props.topArtists}
        totalPlays={props.totalPlays}
        nightPercent={props.nightPercent}
      />
    </aside>
  );
}
