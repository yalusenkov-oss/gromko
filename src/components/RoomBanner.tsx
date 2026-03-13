/**
 * Floating room banner for mobile — shows when the user is in someone's room.
 * Sits above the BottomNav so it's always visible regardless of what page they're on.
 */
import { Link } from 'react-router-dom';
import { Radio, RotateCcw, X } from 'lucide-react';
import { useStore } from '../store';
import { apiUrl } from '../lib/api';

function getToken(): string | null {
  return localStorage.getItem('gromko_token');
}

export default function RoomBanner() {
  const {
    joinedRoomHostId,
    joinedRoomDesync,
    joinedRoomState,
    setJoinedRoom,
    setJoinedRoomDesync,
  } = useStore();

  if (!joinedRoomHostId || !joinedRoomState) return null;

  const handleLeave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = getToken();
    if (token) {
      try {
        await fetch(apiUrl(`/listening-room/${joinedRoomHostId}/leave`), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* ignore */ }
    }
    setJoinedRoom(null);
  };

  const handleResync = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setJoinedRoomDesync(false);
  };

  return (
    <div className="fixed left-2 right-2 z-[64] md:hidden" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 4px)' }}>
      <Link
        to={`/user/${joinedRoomHostId}`}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border backdrop-blur-xl shadow-lg ${
          joinedRoomDesync
            ? 'bg-amber-900/80 border-amber-500/30'
            : 'bg-zinc-900/90 border-gromq-green/30'
        }`}
      >
        {/* Cover */}
        <img
          src={joinedRoomState.trackCover.startsWith('http') ? joinedRoomState.trackCover : apiUrl(joinedRoomState.trackCover)}
          alt=""
          className="w-9 h-9 rounded-lg object-cover shrink-0"
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Radio size={10} className="text-gromq-green shrink-0" />
            <span className="text-[10px] text-gromq-green font-semibold uppercase tracking-wider truncate">
              {joinedRoomDesync ? 'Рассинхрон' : `Комната ${joinedRoomState.hostName}`}
            </span>
          </div>
          <p className="text-xs text-white font-medium truncate">
            {joinedRoomState.trackTitle} — {joinedRoomState.trackArtist}
          </p>
        </div>

        {/* Action */}
        {joinedRoomDesync ? (
          <button onClick={handleResync}
            className="shrink-0 px-2.5 py-1.5 bg-gromq-green text-black text-[10px] font-bold rounded-lg flex items-center gap-1 active:scale-95">
            <RotateCcw size={10} />
            Синхр.
          </button>
        ) : (
          <button onClick={handleLeave}
            className="shrink-0 p-1.5 text-zinc-400 hover:text-red-400 active:scale-95">
            <X size={16} />
          </button>
        )}
      </Link>
    </div>
  );
}
