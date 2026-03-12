import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore, type Track, type Playlist } from '../store';
import { apiUrl } from '../lib/api';

// LK components
import { ProfileCard, MusicTaste, LeftColumn } from '../components/lk/LeftColumn';
import { NowPlaying, Playlists, Recommendations, ActivityFeed, RecentlyListened, CenterColumn } from '../components/lk/CenterColumn';
import { LiveRoomWidget, FriendsList, AchievementsSection, RightColumn } from '../components/lk/RightColumn';
import { ToastContainer, type ToastItem } from '../components/lk/Toast';
import {
  CreatePlaylistModal,
  ListenTogetherModal,
  ShareModal,
  PlaylistDetailModal,
  EditProfileModal,
  PickTrackModal,
  type ModalType,
} from '../components/lk/Modals';

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

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

interface Friend {
  id: string;
  name: string;
  avatar: string;
  isOnline: boolean;
  listeningTrack: { title: string; artist: string; cover: string } | null;
  hasRoom: boolean;
}

interface RecPicks {
  trackOfWeek: Track | null;
  discovery: Track | null;
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function getToken(): string | null {
  return localStorage.getItem('gromko_token');
}

async function apiFetchJson(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { ...opts, headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* ═══════════════════════════════════════════════════════
   ProfilePage
   ═══════════════════════════════════════════════════════ */

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, playlists, fetchMyPlaylists, tracks, logout, roomActive, roomListeners, toggleRoom } = useStore();

  // ── Toast system ──
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const tidRef = useRef(0);
  const addToast = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    const id = ++tidRef.current;
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Modal state ──
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [pickTarget, setPickTarget] = useState<'trackOfWeek' | 'discovery' | null>(null);

  // ── Data state ──
  const [tasteSummary, setTasteSummary] = useState<TasteSummary | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [historyTracks, setHistoryTracks] = useState<HistoryTrack[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [recPicks, setRecPicks] = useState<RecPicks>({ trackOfWeek: null, discovery: null });

  // ── Redirect if not logged in ──
  useEffect(() => {
    if (!currentUser) navigate('/', { replace: true });
  }, [currentUser, navigate]);

  // ── Fetch all profile data (refetches on navigation back) ──
  useEffect(() => {
    if (!currentUser) return;
    fetchMyPlaylists();

    apiFetchJson('/profile/taste-summary').then(setTasteSummary).catch(() => {});
    apiFetchJson('/profile/stats').then(setProfileStats).catch(() => {});
    apiFetchJson('/profile/activity').then(d => setActivityFeed(d.feed || d || [])).catch(() => {});
    apiFetchJson('/profile/history').then(d => setHistoryTracks(d.tracks || d || [])).catch(() => {});
    apiFetchJson('/profile/followers-stats').then(d => {
      setFollowersCount(d.followersCount || 0);
      setFollowingCount(d.followingCount || 0);
    }).catch(() => {});
    apiFetchJson('/profile/friends').then(d => setFriends(d || [])).catch(() => {});

    // Load recommendation picks
    apiFetchJson('/profile/recommendation-picks').then(d => {
      if (d?.trackOfWeekId) {
        const t = tracks.find(tr => tr.id === d.trackOfWeekId);
        if (t) setRecPicks(p => ({ ...p, trackOfWeek: t }));
      }
      if (d?.discoveryId) {
        const t = tracks.find(tr => tr.id === d.discoveryId);
        if (t) setRecPicks(p => ({ ...p, discovery: t }));
      }
    }).catch(() => {});
  }, [currentUser, location.key]);

  // ── Night percent calculation ──
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

  // ── Handlers ──
  const handleToggleRoom = useCallback(() => {
    if (roomActive) {
      toggleRoom();
      addToast('Комната закрыта');
    } else {
      // Open the listen-together modal to choose room type
      setActiveModal('listen-together');
    }
  }, [roomActive, toggleRoom, addToast]);

  const handleLogout = useCallback(() => {
    // Close listening room if active before logging out
    if (roomActive) {
      toggleRoom();
    }
    logout();
    navigate('/', { replace: true });
  }, [logout, navigate, roomActive, toggleRoom]);

  const handlePickTrack = useCallback((track: Track) => {
    if (pickTarget === 'trackOfWeek') {
      setRecPicks(p => ({ ...p, trackOfWeek: track }));
      apiFetchJson('/profile/recommendation-picks', {
        method: 'PUT',
        body: JSON.stringify({ trackOfWeekId: track.id, discoveryId: recPicks.discovery?.id || null }),
      }).catch(() => {});
      addToast(`Трек недели: ${track.title}`);
    } else if (pickTarget === 'discovery') {
      setRecPicks(p => ({ ...p, discovery: track }));
      apiFetchJson('/profile/recommendation-picks', {
        method: 'PUT',
        body: JSON.stringify({ trackOfWeekId: recPicks.trackOfWeek?.id || null, discoveryId: track.id }),
      }).catch(() => {});
      addToast(`Находка: ${track.title}`);
    }
    setPickTarget(null);
  }, [pickTarget, recPicks, addToast]);

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gromq-bg text-gromq-text pt-16">
      <main className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
        {/* ── Desktop: 3-column layout ── */}
        <div className="hidden lg:flex gap-5">
          <LeftColumn
            followersCount={followersCount}
            followingCount={followingCount}
            playlistCount={playlists.length}
            onShare={() => setActiveModal('share')}
            onEditProfile={() => setActiveModal('edit-profile')}
            onLogout={handleLogout}
            tasteSummary={tasteSummary}
            topArtists={profileStats?.topListenedArtists || []}
            totalPlays={profileStats?.totalPlays || 0}
            nightPercent={nightPercent}
          />
          <CenterColumn
            playlists={playlists}
            feed={activityFeed}
            historyTracks={historyTracks}
            recPicks={recPicks}
            onCreatePlaylist={() => setActiveModal('create-playlist')}
            onOpenPlaylist={(pl) => { setSelectedPlaylist(pl); setActiveModal('playlist-detail'); }}
            onPickTrackOfWeek={() => { setPickTarget('trackOfWeek'); setActiveModal('pick-track'); }}
            onPickDiscovery={() => { setPickTarget('discovery'); setActiveModal('pick-track'); }}
            addToast={addToast}
          />
          <RightColumn
            roomActive={roomActive}
            roomListeners={roomListeners}
            onToggleRoom={handleToggleRoom}
            addToast={addToast}
            friends={friends}
            totalLiked={currentUser.likedTracks.length}
            playlistsCount={playlists.length}
            nightPercent={nightPercent}
            totalPlays={profileStats?.totalPlays || 0}
          />
        </div>

        {/* ── Mobile: single-column ── */}
        <div className="lg:hidden space-y-3 sm:space-y-4">
          <ProfileCard
            followersCount={followersCount}
            followingCount={followingCount}
            playlistCount={playlists.length}
            onShare={() => setActiveModal('share')}
            onEditProfile={() => setActiveModal('edit-profile')}
            onLogout={handleLogout}
          />
          <NowPlaying
            addToast={addToast}
          />
          <LiveRoomWidget
            roomActive={roomActive}
            roomListeners={roomListeners}
            onToggleRoom={handleToggleRoom}
            addToast={addToast}
          />
          <Playlists
            playlists={playlists}
            onCreatePlaylist={() => setActiveModal('create-playlist')}
            onOpenPlaylist={(pl) => { setSelectedPlaylist(pl); setActiveModal('playlist-detail'); }}
            addToast={addToast}
          />
          <Recommendations
            recPicks={recPicks}
            onPickTrackOfWeek={() => { setPickTarget('trackOfWeek'); setActiveModal('pick-track'); }}
            onPickDiscovery={() => { setPickTarget('discovery'); setActiveModal('pick-track'); }}
          />
          <RecentlyListened tracks={historyTracks} />
          <FriendsList friends={friends} addToast={addToast} />
          <ActivityFeed feed={activityFeed} />
          <MusicTaste
            tasteSummary={tasteSummary}
            topArtists={profileStats?.topListenedArtists || []}
            totalPlays={profileStats?.totalPlays || 0}
            nightPercent={nightPercent}
          />
          <AchievementsSection
            totalLiked={currentUser.likedTracks.length}
            playlistsCount={playlists.length}
            nightPercent={nightPercent}
            totalPlays={profileStats?.totalPlays || 0}
          />
        </div>
      </main>

      {/* ── Modals ── */}
      {activeModal === 'create-playlist' && (
        <CreatePlaylistModal onClose={() => { setActiveModal(null); fetchMyPlaylists(); }} addToast={addToast} />
      )}
      {activeModal === 'listen-together' && (
        <ListenTogetherModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'share' && (
        <ShareModal onClose={() => setActiveModal(null)} addToast={addToast} />
      )}
      {activeModal === 'playlist-detail' && selectedPlaylist && (
        <PlaylistDetailModal playlist={selectedPlaylist} onClose={() => { setActiveModal(null); setSelectedPlaylist(null); }} addToast={addToast} />
      )}
      {activeModal === 'edit-profile' && (
        <EditProfileModal onClose={() => setActiveModal(null)} addToast={addToast} />
      )}
      {activeModal === 'pick-track' && pickTarget && (
        <PickTrackModal
          title={pickTarget === 'trackOfWeek' ? 'Выберите трек недели' : 'Выберите находку'}
          onClose={() => { setActiveModal(null); setPickTarget(null); }}
          onPick={handlePickTrack}
        />
      )}

      {/* ── Toasts ── */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
