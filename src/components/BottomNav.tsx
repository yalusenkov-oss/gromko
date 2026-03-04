import { Link, useLocation } from 'react-router-dom';
import { Home, Music, Mic2, Heart } from 'lucide-react';
import { useStore } from '../store';

export default function BottomNav() {
  const location = useLocation();
  const { currentUser, player } = useStore();
  const path = location.pathname;

  // Don't show on admin pages or fullscreen player
  if (path.startsWith('/admin') || player.isFullscreen) return null;

  const tabs = [
    { to: '/', icon: Home, label: 'Главная' },
    { to: '/tracks', icon: Music, label: 'Треки' },
    { to: '/artists', icon: Mic2, label: 'Артисты' },
    { to: '/liked', icon: Heart, label: 'Любимое', auth: true },
  ];

  const filteredTabs = tabs.filter(t => !t.auth || currentUser);

  return (
    <nav
      className="fixed left-0 right-0 bottom-0 z-30 md:hidden bg-zinc-950/95 backdrop-blur-xl border-t border-white/5"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around px-4 py-2">
        {filteredTabs.map(({ to, icon: Icon }) => {
          const isActive = to === '/' ? path === '/' : path.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center justify-center w-12 h-10 rounded-xl transition-colors ${
                isActive
                  ? 'text-red-400 bg-red-500/10'
                  : 'text-zinc-500 active:text-zinc-300'
              }`}
            >
              <Icon size={22} fill={isActive && to === '/liked' ? 'currentColor' : 'none'} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
