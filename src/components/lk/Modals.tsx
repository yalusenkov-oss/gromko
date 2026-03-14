import { useEffect, useState, useRef } from "react";
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
  Search,
} from "lucide-react";
import { Backdrop, DragHandle, useSwipeDown } from "./Backdrop";
import { Equalizer } from "./Equalizer";
import { useStore, type Track, type Playlist } from "../../store";
import { apiUrl } from "../../lib/api";
import { formatDuration } from "../../utils/format";

function coverUrl(src: string) {
  if (!src) return '';
  return src.startsWith('http') ? src : apiUrl(src);
}

export type ModalType =
  | "create-playlist"
  | "listen-together"
  | "share"
  | "playlist-detail"
  | "edit-profile"
  | "pick-track"
  | null;

/* ── Create Playlist ── */
interface CreatePlaylistModalProps {
  onClose: () => void;
  addToast: (msg: string) => void;
}

export function CreatePlaylistModal({ onClose, addToast }: CreatePlaylistModalProps) {
  const { addPlaylist, currentUser, tracks: allTracks } = useStore();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [trackSearch, setTrackSearch] = useState("");

  // Get liked tracks
  const likedTrackIds = currentUser?.likedTracks || [];
  const likedTracks = likedTrackIds
    .map(id => allTracks.find(t => t.id === id))
    .filter(Boolean) as Track[];

  // Filter liked tracks by search
  const filteredLiked = trackSearch.trim()
    ? likedTracks.filter(t =>
        t.title.toLowerCase().includes(trackSearch.toLowerCase()) ||
        t.artist.toLowerCase().includes(trackSearch.toLowerCase())
      )
    : likedTracks;

  const toggleTrack = (trackId: string) => {
    setSelectedTrackIds(prev =>
      prev.includes(trackId)
        ? prev.filter(id => id !== trackId)
        : [...prev, trackId]
    );
  };

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await addPlaylist(name.trim(), selectedTrackIds, desc.trim(), isPublic);
      addToast(`Плейлист «${name.trim()}» создан${selectedTrackIds.length > 0 ? ` (${selectedTrackIds.length} треков)` : ''}`);
      onClose();
    } catch {
      addToast("Ошибка создания плейлиста");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Backdrop onClose={onClose} size="lg">
      <div className="bg-gromq-card border-t sm:border border-gromq-border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DragHandle />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gromq-text">Создать плейлист</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gromq-surface flex items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="w-full aspect-[2.2/1] bg-gromq-surface border-2 border-dashed border-gromq-border rounded-xl flex flex-col items-center justify-center mb-5 cursor-pointer hover:border-gromq-red/40 transition-colors group">
          <ImagePlus size={28} className="text-gromq-muted mb-1.5 group-hover:text-gromq-red transition-colors" />
          <span className="text-xs text-gromq-muted group-hover:text-gromq-text transition-colors">Добавить обложку</span>
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-gromq-muted font-semibold uppercase tracking-wider mb-1.5 block">Название</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Мой новый плейлист"
            className="w-full bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm text-gromq-text placeholder-gromq-muted outline-none focus:border-gromq-red/50 transition-colors" autoFocus />
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-gromq-muted font-semibold uppercase tracking-wider mb-1.5 block">Описание</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="О чём этот плейлист..." rows={2}
            className="w-full bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm text-gromq-text placeholder-gromq-muted outline-none focus:border-gromq-red/50 transition-colors resize-none" />
        </div>

        {/* Liked tracks selector */}
        {likedTracks.length > 0 && (
          <div className="mb-4">
            <label className="text-[11px] text-gromq-muted font-semibold uppercase tracking-wider mb-1.5 block">
              Добавить из Любимое
              {selectedTrackIds.length > 0 && (
                <span className="ml-2 text-gromq-red normal-case">({selectedTrackIds.length} выбрано)</span>
              )}
            </label>
            <div className="flex items-center bg-gromq-surface border border-gromq-border rounded-xl px-3 py-2 gap-2 mb-2">
              <Search size={14} className="text-gromq-muted shrink-0" />
              <input type="text" value={trackSearch} onChange={(e) => setTrackSearch(e.target.value)} placeholder="Поиск в Любимое..."
                className="bg-transparent text-base sm:text-sm text-gromq-text placeholder-gromq-muted outline-none w-full" />
            </div>
            <div className="max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-gromq-border bg-gromq-surface/50">
              {filteredLiked.length === 0 ? (
                <p className="text-xs text-gromq-muted py-4 text-center">Ничего не найдено</p>
              ) : (
                filteredLiked.map((track) => {
                  const isSelected = selectedTrackIds.includes(track.id);
                  return (
                    <div
                      key={track.id}
                      onClick={() => toggleTrack(track.id)}
                      className={`flex items-center gap-3 py-2 px-3 cursor-pointer transition-colors ${isSelected ? 'bg-gromq-red/10' : 'hover:bg-gromq-surface'}`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'border-gromq-red bg-gromq-red' : 'border-gromq-border'}`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <img src={coverUrl(track.cover)} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gromq-text font-medium truncate">{track.title}</p>
                        <p className="text-[11px] text-gromq-muted truncate">{track.artist}</p>
                      </div>
                      <span className="text-[11px] text-gromq-muted shrink-0 tabular-nums">{formatDuration(track.duration)}</span>
                    </div>
                  );
                })
              )}
            </div>
            {selectedTrackIds.length > 0 && (
              <button
                onClick={() => setSelectedTrackIds([])}
                className="mt-1.5 text-[11px] text-gromq-muted hover:text-gromq-text transition-colors"
              >
                Снять выбор
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mb-6 bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            {isPublic ? <Globe size={16} className="text-gromq-green" /> : <Lock size={16} className="text-gromq-muted" />}
            <div>
              <p className="text-sm text-gromq-text font-medium">{isPublic ? "Публичный" : "Приватный"}</p>
              <p className="text-[11px] text-gromq-muted">{isPublic ? "Виден всем на вашем профиле" : "Только вы видите этот плейлист"}</p>
            </div>
          </div>
          <button onClick={() => setIsPublic(!isPublic)}
            className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${isPublic ? "bg-gromq-red" : "bg-gromq-border"}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200 ${isPublic ? "left-6" : "left-1"}`} />
          </button>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-gromq-surface border border-gromq-border text-gromq-muted font-medium text-sm py-3 sm:py-2.5 rounded-xl hover:bg-gromq-border transition-colors active:scale-[0.97]">Отмена</button>
          <button onClick={handleCreate} disabled={!name.trim() || creating}
            className="flex-1 bg-gromq-red hover:bg-gromq-red-dim disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 sm:py-2.5 rounded-xl transition-colors active:scale-[0.97]">
            {creating ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

/* ── Listen Together ── */
interface ListenTogetherModalProps {
  onClose: () => void;
}

export function ListenTogetherModal({ onClose }: ListenTogetherModalProps) {
  const { player, roomActive, roomPublic, roomInviteToken, roomLastSyncAt, setRoomPublic, toggleRoom, currentUser } = useStore();
  const np = player.currentTrack;
  const [phase, setPhase] = useState<"choosing" | "connecting" | "connected">("choosing");
  const [copied, setCopied] = useState(false);

  const roomLink = currentUser
    ? `${window.location.origin}/user/${currentUser.id}${!roomPublic && roomInviteToken ? `?room=${encodeURIComponent(roomInviteToken)}` : ''}`
    : '';

  const handleStart = (isPublic: boolean) => {
    setRoomPublic(isPublic);
    toggleRoom();
    setPhase("connecting");
  };

  useEffect(() => {
    if (!roomActive) {
      setPhase("choosing");
      return;
    }
    if (roomLastSyncAt && (roomPublic || roomInviteToken)) {
      setPhase("connected");
    }
  }, [roomActive, roomPublic, roomInviteToken, roomLastSyncAt]);

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(roomLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Backdrop onClose={onClose} size="sm">
      <div className="bg-gromq-card border-t sm:border border-gromq-border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 text-center">
        <DragHandle />
        {phase === "choosing" ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gromq-red/10 flex items-center justify-center">
              <Headphones size={28} className="text-gromq-red" />
            </div>
            <h2 className="text-lg font-bold text-gromq-text mb-1">Создать комнату</h2>
            <p className="text-sm text-gromq-muted mb-6">Выберите тип доступа</p>
            <div className="space-y-3">
              <button
                onClick={() => handleStart(true)}
                className="w-full bg-gromq-surface border border-gromq-border rounded-xl p-4 flex items-center gap-3 hover:border-gromq-red/40 transition-colors active:scale-[0.98] text-left"
              >
                <div className="w-10 h-10 rounded-full bg-gromq-green/10 flex items-center justify-center shrink-0">
                  <Globe size={18} className="text-gromq-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gromq-text font-semibold">Открытая комната</p>
                  <p className="text-[11px] text-gromq-muted">Видна всем на главной странице</p>
                </div>
              </button>
              <button
                onClick={() => handleStart(false)}
                className="w-full bg-gromq-surface border border-gromq-border rounded-xl p-4 flex items-center gap-3 hover:border-gromq-red/40 transition-colors active:scale-[0.98] text-left"
              >
                <div className="w-10 h-10 rounded-full bg-gromq-amber/10 flex items-center justify-center shrink-0">
                  <Lock size={18} className="text-gromq-amber" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gromq-text font-semibold">По ссылке</p>
                  <p className="text-[11px] text-gromq-muted">Только по приглашению через ссылку</p>
                </div>
              </button>
            </div>
          </>
        ) : phase === "connecting" ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gromq-red/10 flex items-center justify-center">
              <Headphones size={28} className="text-gromq-red animate-pulse" />
            </div>
            <h2 className="text-lg font-bold text-gromq-text mb-2">Подключение…</h2>
            <p className="text-sm text-gromq-muted mb-5">Синхронизируем воспроизведение</p>
            <div className="h-1.5 bg-gromq-surface rounded-full overflow-hidden">
              <div className="h-full bg-gromq-red rounded-full animate-loading-bar" />
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gromq-green/10 flex items-center justify-center">
              <Headphones size={28} className="text-gromq-green" />
            </div>
            <h2 className="text-lg font-bold text-gromq-text mb-1">Комната активна!</h2>
            <p className="text-sm text-gromq-muted mb-1">
              {roomPublic ? 'Открытая комната — видна всем' : 'Приватная — доступ по ссылке'}
            </p>
            <div className="flex items-center justify-center gap-2 mb-4">
              {roomPublic ? (
                <span className="text-[10px] bg-gromq-green/20 text-gromq-green px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><Globe size={10} /> Открытая</span>
              ) : (
                <span className="text-[10px] bg-gromq-amber/20 text-gromq-amber px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><Lock size={10} /> По ссылке</span>
              )}
            </div>
            {np && (
              <div className="bg-gromq-surface border border-gromq-border rounded-xl p-3 flex items-center gap-3 mb-4">
                <img src={coverUrl(np.cover)} alt="" className="w-12 h-12 rounded-lg object-cover" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm text-gromq-text font-semibold truncate">{np.title}</p>
                  <p className="text-xs text-gromq-muted truncate">{np.artist}</p>
                </div>
                <Equalizer />
              </div>
            )}
            {/* Copy room link */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 bg-gromq-surface border border-gromq-border rounded-xl px-3 py-2.5 flex items-center gap-2 overflow-hidden">
                <Link2 size={14} className="text-gromq-muted shrink-0" />
                <span className="text-xs text-gromq-text truncate">{roomLink}</span>
              </div>
              <button onClick={handleCopyLink}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ${copied ? "bg-gromq-green/20 text-gromq-green" : "bg-gromq-red text-white hover:bg-gromq-red-dim"}`}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <button onClick={onClose}
              className="w-full bg-gromq-surface border border-gromq-border text-gromq-text font-medium text-sm py-3 sm:py-2.5 rounded-xl hover:bg-gromq-border transition-colors active:scale-[0.97]">
              Закрыть
            </button>
          </>
        )}
      </div>
    </Backdrop>
  );
}

/* ── Share ── */
interface ShareModalProps {
  onClose: () => void;
  addToast: (msg: string) => void;
}

export function ShareModal({ onClose, addToast }: ShareModalProps) {
  const { currentUser } = useStore();
  const [copied, setCopied] = useState(false);
  const profileUrl = `gromq.com/@${currentUser?.username || currentUser?.name?.toLowerCase().replace(/\s+/g, '') || 'user'}`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(`https://${profileUrl}`).catch(() => {});
    setCopied(true);
    addToast("Ссылка скопирована");
    setTimeout(() => setCopied(false), 2000);
  };

  const socials = ["Telegram", "VK", "Twitter", "WhatsApp"] as const;

  return (
    <Backdrop onClose={onClose} size="sm">
      <div className="bg-gromq-card border-t sm:border border-gromq-border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6">
        <DragHandle />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gromq-text">Поделиться</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gromq-surface flex items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 mb-5">
          <div className="flex-1 bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3 sm:py-2.5 flex items-center gap-2 overflow-hidden">
            <Link2 size={14} className="text-gromq-muted shrink-0" />
            <span className="text-sm text-gromq-text truncate">{profileUrl}</span>
          </div>
          <button onClick={handleCopy}
            className={`w-11 h-11 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ${copied ? "bg-gromq-green/20 text-gromq-green" : "bg-gromq-red text-white hover:bg-gromq-red-dim"}`}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {socials.map((name) => (
            <button key={name} onClick={() => addToast(`Открываем ${name}…`)}
              className="bg-gromq-surface border border-gromq-border rounded-xl py-3 flex flex-col items-center gap-1.5 hover:border-gromq-red/30 transition-colors active:scale-[0.95]">
              <div className="w-9 h-9 rounded-full bg-gromq-border flex items-center justify-center text-gromq-text text-sm font-bold">{name[0]}</div>
              <span className="text-[10px] text-gromq-muted">{name}</span>
            </button>
          ))}
        </div>
      </div>
    </Backdrop>
  );
}

/* ── Playlist Detail ── */
interface PlaylistDetailModalProps {
  playlist: Playlist;
  onClose: () => void;
  addToast: (msg: string) => void;
}

export function PlaylistDetailModal({ playlist, onClose, addToast }: PlaylistDetailModalProps) {
  const { tracks: allTracks, playTrack } = useStore();
  const [liked, setLiked] = useState(false);

  const plTracks = (playlist.trackIds || [])
    .map(tid => allTracks.find(t => t.id === tid))
    .filter(Boolean) as Track[];

  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeDown(sheetRef, onClose, scrollRef);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col sm:items-center sm:justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 animate-fade-in" />

      <div
        ref={sheetRef}
        className="relative z-10 w-full sm:max-w-lg sm:mx-4 animate-modal-in flex flex-col
                   h-full sm:h-auto sm:max-h-[85vh] sm:rounded-2xl overflow-hidden will-change-transform"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gromq-card flex flex-col h-full sm:h-auto sm:border sm:border-gromq-border sm:rounded-2xl overflow-hidden">
          {/* Mobile drag handle — swipe only here */}
          <div
            className="sm:hidden bg-gromq-card relative z-10 shrink-0"
            onTouchStart={swipe.onTouchStart}
            onTouchMove={swipe.onTouchMove}
            onTouchEnd={swipe.onTouchEnd}
          >
            <div className="flex justify-center pt-2.5 pb-1"><div className="w-10 h-1 bg-gromq-border rounded-full" /></div>
          </div>

          {/* Cover / header */}
          <div className="relative shrink-0">
            <div className="w-full aspect-[2.8/1] bg-gromq-surface flex items-center justify-center">
              {playlist.coverUrl ? (
                <img src={coverUrl(playlist.coverUrl)} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="text-gromq-muted text-4xl font-black">{playlist.title[0]}</div>
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-gromq-card via-gromq-card/50 to-black/20" />
            <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white z-10">
              <X size={18} />
            </button>
            <button onClick={onClose} className="sm:hidden absolute top-3 left-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/80 z-10">
              <ChevronDown size={20} />
            </button>
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
              <h2 className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg">{playlist.title}</h2>
              {playlist.description && <p className="text-xs sm:text-sm text-white/60 mt-1 line-clamp-2">{playlist.description}</p>}
              <div className="flex items-center gap-3 mt-2 text-xs text-white/50">
                <span>{playlist.tracksCount} треков</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Heart size={10} fill="currentColor" />{playlist.likesCount}</span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="px-4 sm:px-5 py-3 flex items-center gap-2 border-b border-gromq-border shrink-0 bg-gromq-card">
            <button onClick={() => { if (plTracks.length > 0) playTrack(plTracks[0], plTracks); addToast("▶ Воспроизведение начато"); }}
              className="bg-gromq-red hover:bg-gromq-red-dim text-white font-semibold text-sm h-10 px-5 rounded-full flex items-center gap-2 transition-colors active:scale-[0.95] shadow-lg shadow-gromq-red/20">
              <Play size={14} fill="white" /> Играть
            </button>
            <button onClick={() => addToast("🔀 Перемешанное воспроизведение")}
              className="bg-gromq-surface border border-gromq-border text-gromq-text text-sm h-10 px-4 rounded-full flex items-center gap-2 hover:bg-gromq-border transition-colors active:scale-[0.95]">
              <Shuffle size={14} /> Микс
            </button>
            <div className="flex-1" />
            <button onClick={() => { setLiked(!liked); addToast(liked ? "Убрано из избранного" : "❤️ Добавлено"); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${liked ? "bg-gromq-red/20 text-gromq-red" : "bg-gromq-surface border border-gromq-border text-gromq-muted hover:text-gromq-red"}`}>
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
            </button>
          </div>

          {/* Track list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain min-h-0">
            <div className="px-2 sm:px-3 py-1 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:pb-2">
              {plTracks.length === 0 && (
                <p className="text-sm text-gromq-muted py-8 text-center">Плейлист пока пуст</p>
              )}
              {plTracks.map((track, i) => (
                <div key={track.id} onClick={() => playTrack(track, plTracks)}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-gromq-surface/60 cursor-pointer transition-colors group">
                  <div className="w-6 h-6 flex items-center justify-center shrink-0">
                    <span className="text-xs text-gromq-muted group-hover:hidden">{i + 1}</span>
                    <Play size={12} className="text-gromq-red hidden group-hover:block" fill="currentColor" />
                  </div>
                  <img src={coverUrl(track.cover)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gromq-text truncate font-medium">{track.title}</p>
                    <p className="text-[11px] text-gromq-muted truncate">{track.artist}</p>
                  </div>
                  <span className="text-[11px] text-gromq-muted shrink-0 tabular-nums">{formatDuration(track.duration)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Edit Profile ── */
interface EditProfileModalProps {
  onClose: () => void;
  addToast: (msg: string) => void;
}

export function EditProfileModal({ onClose, addToast }: EditProfileModalProps) {
  const { currentUser, updateProfile } = useStore();
  const [name, setName] = useState(currentUser?.name || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        username: username.trim(),
      });
      if (ok) {
        addToast("Профиль обновлён");
        onClose();
      } else {
        addToast("Ошибка сохранения");
      }
    } catch {
      addToast("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Backdrop onClose={onClose} size="md">
      <div className="bg-gromq-card border-t sm:border border-gromq-border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6">
        <DragHandle />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gromq-text">Редактировать профиль</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gromq-surface flex items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="mb-4">
          <label className="text-[11px] text-gromq-muted font-semibold uppercase tracking-wider mb-1.5 block">Имя</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя"
            className="w-full bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm text-gromq-text placeholder-gromq-muted outline-none focus:border-gromq-red/50 transition-colors" />
        </div>
        <div className="mb-4">
          <label className="text-[11px] text-gromq-muted font-semibold uppercase tracking-wider mb-1.5 block">Имя пользователя</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gromq-muted text-sm">@</span>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="username"
              className="w-full bg-gromq-surface border border-gromq-border rounded-xl pl-8 pr-4 py-3 sm:py-2.5 text-base sm:text-sm text-gromq-text placeholder-gromq-muted outline-none focus:border-gromq-red/50 transition-colors" />
          </div>
        </div>
        <div className="mb-6">
          <label className="text-[11px] text-gromq-muted font-semibold uppercase tracking-wider mb-1.5 block">О себе</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Расскажите о себе..." rows={3}
            className="w-full bg-gromq-surface border border-gromq-border rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm text-gromq-text placeholder-gromq-muted outline-none focus:border-gromq-red/50 transition-colors resize-none" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-gromq-surface border border-gromq-border text-gromq-muted font-medium text-sm py-3 sm:py-2.5 rounded-xl hover:bg-gromq-border transition-colors active:scale-[0.97]">Отмена</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-gromq-red hover:bg-gromq-red-dim disabled:opacity-40 text-white font-semibold text-sm py-3 sm:py-2.5 rounded-xl transition-colors active:scale-[0.97]">
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

/* ── Pick Track modal (for recommendations) ── */
interface PickTrackModalProps {
  title: string;
  onClose: () => void;
  onPick: (track: Track) => void;
}

export function PickTrackModal({ title, onClose, onPick }: PickTrackModalProps) {
  const { tracks } = useStore();
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? tracks.filter(t =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.artist.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 20)
    : tracks.slice(0, 20);

  return (
    <Backdrop onClose={onClose} size="md">
      <div className="bg-gromq-card border-t sm:border border-gromq-border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[85vh] flex flex-col">
        <DragHandle />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gromq-text">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gromq-surface flex items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex items-center bg-gromq-surface border border-gromq-border rounded-xl px-3 py-2.5 gap-2 mb-4">
          <Search size={14} className="text-gromq-muted shrink-0" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск трека..."
            className="bg-transparent text-base sm:text-sm text-gromq-text placeholder-gromq-muted outline-none w-full" autoFocus />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 space-y-1">
          {filtered.map((track) => (
            <div key={track.id} onClick={() => { onPick(track); onClose(); }}
              className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-gromq-surface cursor-pointer transition-colors">
              <img src={coverUrl(track.cover)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gromq-text font-medium truncate">{track.title}</p>
                <p className="text-[11px] text-gromq-muted truncate">{track.artist}</p>
              </div>
              <Plus size={16} className="text-gromq-muted shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </Backdrop>
  );
}
