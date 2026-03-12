import { useState, useEffect, type ReactNode } from "react";
import {
  X,
  Globe,
  Lock,
  Play,
  Shuffle,
  Heart,
  Plus,
  Headphones,
  Link2,
  Copy,
  Check,
  ImagePlus,
  ChevronDown,
  Clock,
  MoreHorizontal,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { currentTrack, mockPlaylistTracks } from "../data/mockData";
import { Equalizer } from "./Equalizer";

/* ── Backdrop ───────────────────────────────────────────── */
function Backdrop({
  onClose,
  children,
  size = "sm",
}: {
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
}) {
  const maxW = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    full: "max-w-2xl",
  }[size];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        className={`relative z-10 w-full ${maxW} sm:mx-4 animate-modal-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Drag handle for mobile bottom sheet ─────────────────── */
function DragHandle() {
  return (
    <div className="flex justify-center pt-2 pb-1 sm:hidden">
      <div className="w-10 h-1 bg-gromq-border rounded-full" />
    </div>
  );
}

/* ── Create Playlist ────────────────────────────────────── */
function CreatePlaylistModal() {
  const { closeModal, createPlaylist, addToast } = useApp();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const handleCreate = () => {
    if (!name.trim()) return;
    createPlaylist(name.trim(), desc.trim(), isPublic);
    addToast(`Плейлист «${name.trim()}» создан`);
  };

  return (
    <Backdrop onClose={closeModal} size="md">
      <div className="bg-gromq-card border-t sm:border border-gromq-border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DragHandle />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gromq-text">
            Создать плейлист
          </h2>
          <button
            onClick={closeModal}
            className="w-8 h-8 rounded-lg bg-gromq-surface flex items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="w-full aspect-[2.2/1] bg-gromq-surface border-2 border-dashed border-gromq-border rounded-xl flex flex-col items-center justify-center mb-5 cursor-pointer hover:border-gromq-red/40 active:border-gromq-red/40 transition-colors group">
          <ImagePlus
            size={28}
            className="text-gromq-muted mb-1.5 group-hover:text-gromq-red transition-colors"
          />
          <span className="text-xs text-gromq-muted group-hover:text-gromq-text transition-colors">
            Добавить обложку
          </span>
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-gromq-muted font-semibold uppercase tracking-wider mb-1.5 block">
            Название
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Мой новый плейлист"
            className="w-full bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3 sm:py-2.5 text-sm text-gromq-text placeholder-gromq-muted outline-none focus:border-gromq-red/50 transition-colors"
            autoFocus
          />
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-gromq-muted font-semibold uppercase tracking-wider mb-1.5 block">
            Описание
          </label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="О чём этот плейлист..."
            rows={3}
            className="w-full bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3 sm:py-2.5 text-sm text-gromq-text placeholder-gromq-muted outline-none focus:border-gromq-red/50 transition-colors resize-none"
          />
        </div>

        <div className="flex items-center justify-between mb-6 bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            {isPublic ? (
              <Globe size={16} className="text-gromq-green" />
            ) : (
              <Lock size={16} className="text-gromq-muted" />
            )}
            <div>
              <p className="text-sm text-gromq-text font-medium">
                {isPublic ? "Публичный" : "Приватный"}
              </p>
              <p className="text-[11px] text-gromq-muted">
                {isPublic
                  ? "Виден всем на вашем профиле"
                  : "Только вы видите этот плейлист"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsPublic(!isPublic)}
            className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${isPublic ? "bg-gromq-red" : "bg-gromq-border"}`}
          >
            <div
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200 ${isPublic ? "left-6" : "left-1"}`}
            />
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={closeModal}
            className="flex-1 bg-gromq-surface border border-gromq-border text-gromq-muted font-medium text-sm py-3 sm:py-2.5 rounded-xl hover:bg-gromq-border transition-colors active:scale-[0.97]"
          >
            Отмена
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="flex-1 bg-gromq-red hover:bg-gromq-red-dim disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 sm:py-2.5 rounded-xl transition-colors active:scale-[0.97]"
          >
            Создать
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

/* ── Listen Together ────────────────────────────────────── */
function ListenTogetherModal() {
  const { closeModal, setListeningTogether } = useApp();
  const [phase, setPhase] = useState<"connecting" | "connected">("connecting");

  useEffect(() => {
    const t = setTimeout(() => setPhase("connected"), 1800);
    return () => clearTimeout(t);
  }, []);

  const handleDisconnect = () => {
    setListeningTogether(false);
    closeModal();
  };

  return (
    <Backdrop onClose={closeModal} size="sm">
      <div className="bg-gromq-card border-t sm:border border-gromq-border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 text-center">
        <DragHandle />
        {phase === "connecting" ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gromq-red/10 flex items-center justify-center">
              <Headphones
                size={28}
                className="text-gromq-red animate-pulse"
              />
            </div>
            <h2 className="text-lg font-bold text-gromq-text mb-2">
              Подключение…
            </h2>
            <p className="text-sm text-gromq-muted mb-5">
              Синхронизируем воспроизведение
            </p>
            <div className="h-1.5 bg-gromq-surface rounded-full overflow-hidden">
              <div className="h-full bg-gromq-red rounded-full animate-loading-bar" />
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gromq-green/10 flex items-center justify-center">
              <Headphones size={28} className="text-gromq-green" />
            </div>
            <h2 className="text-lg font-bold text-gromq-text mb-1">
              Вы слушаете вместе!
            </h2>
            <p className="text-sm text-gromq-muted mb-5">
              Синхронное воспроизведение активно
            </p>

            <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 flex items-center gap-3 mb-4">
              <img
                src={currentTrack.cover}
                alt=""
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm text-gromq-text font-semibold truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-gromq-muted truncate">
                  {currentTrack.artist}
                </p>
              </div>
              <Equalizer />
            </div>

            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="flex -space-x-2">
                {currentTrack.listenersSync.map((l, i) => (
                  <img
                    key={i}
                    src={l.avatar}
                    alt={l.name}
                    title={l.name}
                    className="w-8 h-8 rounded-full border-2 border-gromq-card object-cover"
                  />
                ))}
                <div className="w-8 h-8 rounded-full border-2 border-gromq-card bg-gromq-red flex items-center justify-center text-[10px] text-white font-bold">
                  Вы
                </div>
              </div>
              <span className="text-xs text-gromq-muted">
                {currentTrack.listenersSync.length + 1} слушают
              </span>
            </div>

            <button
              onClick={handleDisconnect}
              className="w-full bg-gromq-surface border border-gromq-border text-gromq-text font-medium text-sm py-3 sm:py-2.5 rounded-xl hover:bg-gromq-border transition-colors active:scale-[0.97]"
            >
              Отключиться
            </button>
          </>
        )}
      </div>
    </Backdrop>
  );
}

/* ── Share ──────────────────────────────────────────────── */
function ShareModal() {
  const { closeModal, addToast } = useApp();
  const [copied, setCopied] = useState(false);
  const profileUrl = "gromq.com/@dkravtsov";

  const handleCopy = () => {
    navigator.clipboard?.writeText(`https://${profileUrl}`).catch(() => {});
    setCopied(true);
    addToast("Ссылка скопирована");
    setTimeout(() => setCopied(false), 2000);
  };

  const socials = ["Telegram", "VK", "Twitter", "WhatsApp"] as const;

  return (
    <Backdrop onClose={closeModal} size="sm">
      <div className="bg-gromq-card border-t sm:border border-gromq-border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6">
        <DragHandle />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gromq-text">Поделиться</h2>
          <button
            onClick={closeModal}
            className="w-8 h-8 rounded-lg bg-gromq-surface flex items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <div className="flex-1 bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3 sm:py-2.5 flex items-center gap-2 overflow-hidden">
            <Link2 size={14} className="text-gromq-muted shrink-0" />
            <span className="text-sm text-gromq-text truncate">
              {profileUrl}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className={`w-11 h-11 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ${
              copied
                ? "bg-gromq-green/20 text-gromq-green"
                : "bg-gromq-red text-white hover:bg-gromq-red-dim"
            }`}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {socials.map((name) => (
            <button
              key={name}
              onClick={() => addToast(`Открываем ${name}…`, "info")}
              className="bg-gromq-surface border border-gromq-border rounded-xl py-3 flex flex-col items-center gap-1.5 hover:border-gromq-red/30 active:border-gromq-red/30 transition-colors active:scale-[0.95]"
            >
              <div className="w-9 h-9 rounded-full bg-gromq-border flex items-center justify-center text-gromq-text text-sm font-bold">
                {name[0]}
              </div>
              <span className="text-[10px] text-gromq-muted">{name}</span>
            </button>
          ))}
        </div>
      </div>
    </Backdrop>
  );
}

/* ── Playlist Detail ────────────────────────────────────── */
function PlaylistDetailModal() {
  const { selectedPlaylist, closeModal, addToast } = useApp();
  const [liked, setLiked] = useState(false);

  if (!selectedPlaylist) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      onClick={closeModal}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />

      {/* Modal container */}
      <div
        className="relative z-10 w-full max-w-lg sm:mx-4 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gromq-card border-t sm:border border-gromq-border rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh]">

          {/* ── Mobile drag handle + close row ── */}
          <div className="sm:hidden bg-gromq-card relative z-10 shrink-0">
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 bg-gromq-border rounded-full" />
            </div>
          </div>

          {/* ── Cover header ── */}
          <div className="relative shrink-0">
            {/* Mosaic cover */}
            <div className="grid grid-cols-2 grid-rows-2 w-full aspect-[2.4/1] sm:aspect-[2.8/1]">
              {selectedPlaylist.covers.map((c, i) => (
                <img
                  key={i}
                  src={c}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ))}
            </div>

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-gromq-card via-gromq-card/50 to-black/20" />

            {/* Close button — always visible */}
            <button
              onClick={closeModal}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all active:scale-90 z-10"
            >
              <X size={18} />
            </button>

            {/* Mobile: down chevron */}
            <button
              onClick={closeModal}
              className="sm:hidden absolute top-3 left-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/80 active:scale-90 z-10"
            >
              <ChevronDown size={20} />
            </button>

            {/* Info over cover */}
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
              <h2 className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg leading-tight">
                {selectedPlaylist.name}
              </h2>
              {selectedPlaylist.description && (
                <p className="text-xs sm:text-sm text-white/60 mt-1 line-clamp-2">
                  {selectedPlaylist.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-white/50">
                <span>{selectedPlaylist.trackCount} треков</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Heart size={10} fill="currentColor" />
                  {selectedPlaylist.likes}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  ~{Math.round(selectedPlaylist.trackCount * 3.5)} мин
                </span>
              </div>
            </div>
          </div>

          {/* ── Action bar ── */}
          <div className="px-4 sm:px-5 py-3 flex items-center gap-2 border-b border-gromq-border shrink-0 bg-gromq-card">
            <button
              onClick={() => addToast("▶ Воспроизведение начато")}
              className="bg-gromq-red hover:bg-gromq-red-dim text-white font-semibold text-sm h-10 px-5 rounded-full flex items-center gap-2 transition-colors active:scale-[0.95] shadow-lg shadow-gromq-red/20"
            >
              <Play size={14} fill="white" /> Играть
            </button>
            <button
              onClick={() => addToast("🔀 Перемешанное воспроизведение")}
              className="bg-gromq-surface border border-gromq-border text-gromq-text text-sm h-10 px-4 rounded-full flex items-center gap-2 hover:bg-gromq-border transition-colors active:scale-[0.95]"
            >
              <Shuffle size={14} /> Микс
            </button>
            <div className="flex-1" />
            <button
              onClick={() => {
                setLiked(!liked);
                addToast(
                  liked ? "Убрано из избранного" : "❤️ Добавлено в избранное"
                );
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                liked
                  ? "bg-gromq-red/20 text-gromq-red"
                  : "bg-gromq-surface border border-gromq-border text-gromq-muted hover:text-gromq-red"
              }`}
            >
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
            </button>
            <button
              onClick={() => addToast("Меню плейлиста", "info")}
              className="w-10 h-10 rounded-full bg-gromq-surface border border-gromq-border flex items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors active:scale-90"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>

          {/* ── Track list ── */}
          <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
            <div className="px-2 sm:px-3 py-1 pb-safe">
              {mockPlaylistTracks.map((track, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-gromq-surface/60 active:bg-gromq-surface/60 cursor-pointer transition-colors group"
                >
                  {/* Track number / play icon */}
                  <div className="w-6 h-6 flex items-center justify-center shrink-0">
                    <span className="text-xs text-gromq-muted group-hover:hidden">
                      {i + 1}
                    </span>
                    <Play
                      size={12}
                      className="text-gromq-red hidden group-hover:block"
                      fill="currentColor"
                    />
                  </div>

                  {/* Cover */}
                  <img
                    src={track.cover}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gromq-text truncate font-medium">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-gromq-muted truncate">
                      {track.artist}
                    </p>
                  </div>

                  {/* Duration */}
                  <span className="text-[11px] text-gromq-muted shrink-0 tabular-nums">
                    {track.duration}
                  </span>

                  {/* Add to queue */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addToast(`«${track.title}» добавлен в очередь`);
                    }}
                    className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gromq-border/50 active:bg-gromq-border/50"
                  >
                    <Plus
                      size={14}
                      className="text-gromq-muted hover:text-gromq-text"
                    />
                  </button>
                </div>
              ))}

              {/* Bottom spacer for mobile safe area */}
              <div className="h-4 sm:h-2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Root ───────────────────────────────────────────────── */
export function Modals() {
  const { activeModal } = useApp();
  if (!activeModal) return null;
  return (
    <>
      {activeModal === "create-playlist" && <CreatePlaylistModal />}
      {activeModal === "listen-together" && <ListenTogetherModal />}
      {activeModal === "share" && <ShareModal />}
      {activeModal === "playlist-detail" && <PlaylistDetailModal />}
    </>
  );
}
