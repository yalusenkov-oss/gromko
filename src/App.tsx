import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from './store';
import Navbar from './components/Navbar';
import Player from './components/Player';
import BottomNav from './components/BottomNav';
import AuthModal from './components/AuthModal';
import Home from './pages/Home';
import TracksPage from './pages/TracksPage';
import TrackPage from './pages/TrackPage';
import ArtistPage from './pages/ArtistPage';
import ArtistsPage from './pages/ArtistsPage';
import SearchPage from './pages/SearchPage';
import ProfilePage from './pages/ProfilePage';
import SubmitPage from './pages/SubmitPage';
import LikedPage from './pages/LikedPage';
import AdminPanel from './pages/AdminPanel';

/** Scroll to top on every route change */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center">
        <p className="text-8xl font-black text-white/10 mb-4">404</p>
        <h1 className="text-2xl font-black mb-2">Страница не найдена</h1>
        <p className="text-zinc-500 mb-6">Кажется, этой страницы не существует</p>
        <a href="/" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">На главную</a>
      </div>
    </div>
  );
}

// Layout for public pages (with navbar and player)
function PublicLayout({ children }: { children: React.ReactNode }) {
  const { player } = useStore();
  const hasTrack = !!player.currentTrack;
  return (
    <>
      <Navbar />
      <div style={{ paddingBottom: hasTrack ? 'calc(120px + env(safe-area-inset-bottom, 0px))' : 'calc(56px + env(safe-area-inset-bottom, 0px))' }} className="md:!pb-20">
        {children}
      </div>
      <Player />
      <BottomNav />
      <AuthModal />
    </>
  );
}

// Redirect /login and /register to open modal on home page
function LoginRedirect() {
  const { openAuthModal } = useStore();
  useEffect(() => { openAuthModal('login'); }, []);
  return <Navigate to="/" replace />;
}
function RegisterRedirect() {
  const { openAuthModal } = useStore();
  useEffect(() => { openAuthModal('register'); }, []);
  return <Navigate to="/" replace />;
}

export function App() {
  const { restoreSession, fetchTracks, fetchArtists } = useStore();

  useEffect(() => {
    restoreSession();
    fetchTracks();
    fetchArtists();
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Auth redirects — open modal over current page */}
        <Route path="/login" element={<LoginRedirect />} />
        <Route path="/register" element={<RegisterRedirect />} />

        {/* Admin — без навбара и плеера */}
        <Route path="/admin/*" element={<AdminPanel />} />

        {/* Public routes */}
        <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
        <Route path="/tracks" element={<PublicLayout><TracksPage /></PublicLayout>} />
        <Route path="/track/:id" element={<PublicLayout><TrackPage /></PublicLayout>} />
        <Route path="/artist/:slug" element={<PublicLayout><ArtistPage /></PublicLayout>} />
        <Route path="/artists" element={<PublicLayout><ArtistsPage /></PublicLayout>} />
        <Route path="/search" element={<PublicLayout><SearchPage /></PublicLayout>} />
        <Route path="/profile" element={<PublicLayout><ProfilePage /></PublicLayout>} />
        <Route path="/liked" element={<PublicLayout><LikedPage /></PublicLayout>} />
        <Route path="/submit" element={<PublicLayout><SubmitPage /></PublicLayout>} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
