import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { Search, Upload, LogOut, Settings, Music2, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const { currentUser, logout } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) navigate(`/search?q=${encodeURIComponent(searchVal.trim())}`);
  };

  const navLinks = [
    { to: '/', label: 'Главная' },
    { to: '/tracks', label: 'Треки' },
    { to: '/artists', label: 'Артисты' },
    { to: '/genres', label: 'Жанры' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-30 bg-black/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-4 h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
            <Music2 size={18} className="text-white" />
          </div>
          <span className="text-white font-black text-xl tracking-tight">GROMKO</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 ml-4">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${location.pathname === l.to ? 'text-white bg-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md mx-4 hidden md:block">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Поиск треков, артистов..."
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 focus:bg-white/8 transition-all"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2">
          {currentUser ? (
            <>
              {(currentUser.role === 'user' || currentUser.role === 'admin') && (
                <Link to="/submit" className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors">
                  <Upload size={14} />
                  <span>Добавить трек</span>
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin" className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg transition-colors">
                  <Settings size={14} />
                  <span>Панель</span>
                </Link>
              )}
              <Link to="/profile" className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded-lg transition-colors">
                <img src={currentUser.avatar} alt={currentUser.name} className="w-7 h-7 rounded-full object-cover" />
                <span className="text-white text-sm hidden md:block">{currentUser.name}</span>
              </Link>
              <button onClick={logout} className="text-zinc-400 hover:text-white transition-colors p-1.5">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-zinc-400 hover:text-white text-sm transition-colors px-3 py-1.5">Войти</Link>
              <Link to="/register" className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors">Регистрация</Link>
            </>
          )}
          <button className="md:hidden text-zinc-400 hover:text-white transition-colors p-1.5" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-zinc-950 border-t border-white/5 px-4 py-4 space-y-2">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-white/5 transition-colors">
              {l.label}
            </Link>
          ))}
          <form onSubmit={handleSearch} className="mt-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Поиск..." value={searchVal} onChange={e => setSearchVal(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none" />
            </div>
          </form>
        </div>
      )}
    </nav>
  );
}
