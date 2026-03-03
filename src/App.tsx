import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from './store';
import Navbar from './components/Navbar';
import Player from './components/Player';
import Home from './pages/Home';
import TracksPage from './pages/TracksPage';
import TrackPage from './pages/TrackPage';
import ArtistPage from './pages/ArtistPage';
import ArtistsPage from './pages/ArtistsPage';
import GenresPage from './pages/GenresPage';
import SearchPage from './pages/SearchPage';
import ProfilePage from './pages/ProfilePage';
import SubmitPage from './pages/SubmitPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminPanel from './pages/AdminPanel';

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
  return (
    <>
      <Navbar />
      {children}
      <Player />
    </>
  );
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
      <Routes>
        {/* Auth pages - no navbar */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Admin */}
        <Route path="/admin/*" element={<PublicLayout><AdminPanel /></PublicLayout>} />

        {/* Public routes */}
        <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
        <Route path="/tracks" element={<PublicLayout><TracksPage /></PublicLayout>} />
        <Route path="/track/:id" element={<PublicLayout><TrackPage /></PublicLayout>} />
        <Route path="/artist/:slug" element={<PublicLayout><ArtistPage /></PublicLayout>} />
        <Route path="/artists" element={<PublicLayout><ArtistsPage /></PublicLayout>} />
        <Route path="/genres" element={<PublicLayout><GenresPage /></PublicLayout>} />
        <Route path="/search" element={<PublicLayout><SearchPage /></PublicLayout>} />
        <Route path="/profile" element={<PublicLayout><ProfilePage /></PublicLayout>} />
        <Route path="/submit" element={<PublicLayout><SubmitPage /></PublicLayout>} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
