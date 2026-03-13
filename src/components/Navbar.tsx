import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { Search, Upload, Settings, Heart } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { apiUrl } from '../lib/api';
import { trackEvent } from '../utils/trackEvent';

interface SearchUser {
  id: string;
  name: string;
  username: string | null;
  avatar: string;
  bio: string | null;
}

export default function Navbar() {
  const { currentUser, tracks, artists, openAuthModal } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchVal, setSearchVal] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<SearchUser[]>([]);
  const searchRef = useRef<HTMLFormElement>(null);
  const mobileSearchRef = useRef<HTMLFormElement>(null);
  const userSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchRef.current && !searchRef.current.contains(e.target as Node) &&
        (!mobileSearchRef.current || !mobileSearchRef.current.contains(e.target as Node))
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close suggestions on route change
  useEffect(() => {
    setShowSuggestions(false);
  }, [location.pathname]);

  // Search users with debounce
  useEffect(() => {
    if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    const q = searchVal.trim();
    if (q.length < 2) { setSuggestedUsers([]); return; }
    userSearchTimeout.current = setTimeout(() => {
      fetch(apiUrl(`/users/search?q=${encodeURIComponent(q)}&limit=3`))
        .then(r => r.ok ? r.json() : [])
        .then(d => setSuggestedUsers(Array.isArray(d) ? d : []))
        .catch(() => setSuggestedUsers([]));
    }, 300);
    return () => { if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current); };
  }, [searchVal]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      trackEvent('search', { context: searchVal.trim() });
      navigate(`/search?q=${encodeURIComponent(searchVal.trim())}`);
      setShowSuggestions(false);
    }
  };

  const q = searchVal.toLowerCase().trim();
  const suggestedTracks = q.length >= 2
    ? tracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)).slice(0, 5)
    : [];
  const suggestedArtists = q.length >= 2
    ? artists.filter(a => a.name.toLowerCase().includes(q)).slice(0, 3)
    : [];
  const hasSuggestions = suggestedTracks.length > 0 || suggestedArtists.length > 0 || suggestedUsers.length > 0;

  const navLinks = [
    { to: '/', label: 'Главная' },
    { to: '/tracks', label: 'Треки' },
    { to: '/artists', label: 'Артисты' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-30 bg-black/80 backdrop-blur-xl border-b border-white/5" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-7xl mx-auto px-3 md:px-6 flex items-center gap-3 md:gap-4 h-14 md:h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0 ml-3 md:ml-0">
          <span className="text-white font-black text-lg md:text-xl tracking-tight">GROMQ</span>
        </Link>

        {/* Mobile search — compact bar next to logo */}
        <form onSubmit={handleSearch} className="flex-1 md:hidden relative min-w-0" ref={mobileSearchRef}>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Поиск..."
              value={searchVal}
              onChange={e => { setSearchVal(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 transition-all"
            />
          </div>
          {showSuggestions && hasSuggestions && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shadow-xl shadow-black/50 z-50 max-h-80 overflow-y-auto">
              {suggestedArtists.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Артисты</div>
                  {suggestedArtists.map(a => (
                    <Link key={a.id} to={`/artist/${a.slug}`} onClick={() => { setShowSuggestions(false); setSearchVal(''); }}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors">
                      <img src={a.photo} alt={a.name} className="w-8 h-8 rounded-full object-cover" />
                      <div><p className="text-white text-sm font-medium">{a.name}</p></div>
                    </Link>
                  ))}
                </div>
              )}
              {suggestedTracks.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-t border-white/5">Треки</div>
                  {suggestedTracks.map(t => (
                    <Link key={t.id} to={`/track/${t.id}`} onClick={() => { setShowSuggestions(false); setSearchVal(''); }}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors">
                      <img src={t.cover} alt={t.title} className="w-8 h-8 rounded-lg object-cover" />
                      <div className="min-w-0"><p className="text-white text-sm font-medium truncate">{t.title}</p><p className="text-zinc-500 text-xs truncate">{t.artist}</p></div>
                    </Link>
                  ))}
                </div>
              )}
              {suggestedUsers.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-t border-white/5">Пользователи</div>
                  {suggestedUsers.map(u => (
                    <Link key={u.id} to={`/user/${u.id}`} onClick={() => { setShowSuggestions(false); setSearchVal(''); }}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors">
                      {u.avatar ? (
                        <img src={u.avatar.startsWith('http') ? u.avatar : apiUrl(`/uploads/${u.avatar.replace(/^\/uploads\//, '')}`)} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shrink-0"><span className="text-white text-xs font-bold">{u.name[0]?.toUpperCase()}</span></div>
                      )}
                      <div className="min-w-0"><p className="text-white text-sm font-medium truncate">{u.name}</p></div>
                    </Link>
                  ))}
                </div>
              )}
              <Link to={`/search?q=${encodeURIComponent(searchVal.trim())}`} onClick={() => setShowSuggestions(false)}
                className="block px-3 py-2.5 text-center text-red-400 text-xs font-medium border-t border-white/5 hover:bg-white/5 transition-colors">
                Показать все результаты →
              </Link>
            </div>
          )}
        </form>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 ml-6">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${location.pathname === l.to ? 'text-white bg-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Desktop search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md mx-4 hidden md:block relative" ref={searchRef}>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Поиск треков, артистов..."
              value={searchVal}
              onChange={e => { setSearchVal(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 focus:bg-white/8 transition-all"
            />
          </div>
          {showSuggestions && hasSuggestions && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shadow-xl shadow-black/50 z-50 max-h-80 overflow-y-auto">
              {suggestedArtists.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Артисты</div>
                  {suggestedArtists.map(a => (
                    <Link key={a.id} to={`/artist/${a.slug}`} onClick={() => { setShowSuggestions(false); setSearchVal(''); }}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors">
                      <img src={a.photo} alt={a.name} className="w-8 h-8 rounded-full object-cover" />
                      <div>
                        <p className="text-white text-sm font-medium">{a.name}</p>
                        <p className="text-zinc-500 text-xs">{a.genre}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {suggestedTracks.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-t border-white/5">Треки</div>
                  {suggestedTracks.map(t => (
                    <Link key={t.id} to={`/track/${t.id}`} onClick={() => { setShowSuggestions(false); setSearchVal(''); }}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors">
                      <img src={t.cover} alt={t.title} className="w-8 h-8 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{t.title}</p>
                        <p className="text-zinc-500 text-xs truncate">{t.artist}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {suggestedUsers.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-t border-white/5">Пользователи</div>
                  {suggestedUsers.map(u => (
                    <Link key={u.id} to={`/user/${u.id}`} onClick={() => { setShowSuggestions(false); setSearchVal(''); }}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors">
                      {u.avatar ? (
                        <img src={u.avatar.startsWith('http') ? u.avatar : apiUrl(`/uploads/${u.avatar.replace(/^\/uploads\//, '')}`)} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                          <span className="text-white text-xs font-bold">{u.name[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{u.name}</p>
                        <p className="text-zinc-500 text-xs truncate">@{u.username || u.name.toLowerCase().replace(/\s+/g, '')}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <Link to={`/search?q=${encodeURIComponent(searchVal.trim())}`} onClick={() => { setShowSuggestions(false); }}
                className="block px-3 py-2.5 text-center text-red-400 text-xs font-medium border-t border-white/5 hover:bg-white/5 transition-colors">
                Показать все результаты →
              </Link>
            </div>
          )}
        </form>

        <div className="ml-auto flex items-center gap-2">
          {currentUser ? (
            <>
              {(currentUser.role === 'user' || currentUser.role === 'admin') && (
                <Link to="/submit" className="flex items-center gap-2 px-2.5 md:px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors">
                  <Upload size={14} />
                  <span className="hidden md:inline">Предложить трек</span>
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin" className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg transition-colors">
                  <Settings size={14} />
                  <span>Панель</span>
                </Link>
              )}
              <Link to="/liked" className="hidden md:flex items-center gap-1 px-2 py-1.5 hover:bg-white/5 rounded-lg transition-colors group" title="Любимое">
                <Heart size={18} className="text-red-400 group-hover:text-red-300 transition-colors" fill="currentColor" />
              </Link>
              <Link to="/profile" className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded-lg transition-colors">
                {currentUser.avatar ? (
                  <img src={currentUser.avatar.startsWith('http') ? currentUser.avatar : apiUrl(`/uploads/${currentUser.avatar.replace(/^\/uploads\//, '')}`)} alt={currentUser.name} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">{currentUser.name[0]?.toUpperCase()}</span>
                  </div>
                )}
                <span className="text-white text-sm hidden md:block">{currentUser.name}</span>
              </Link>
            </>
          ) : (
            <>
              <button onClick={() => openAuthModal('login')} className="text-zinc-400 hover:text-white text-sm transition-colors px-3 py-1.5">Войти</button>
              <button onClick={() => openAuthModal('register')} className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors">Регистрация</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
