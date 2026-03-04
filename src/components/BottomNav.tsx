import { Link, useLocation } from 'react-router-dom';
import { Home, Music, Mic2, Heart, User } from 'lucide-react';
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
    { to: '/profile', icon: User, label: 'Профиль', auth: true },
  ];

  const filteredTabs = tabs.filter(t => !t.auth || currentUser);

  return (
    <nav
      className="fixed left-0 right-0 bottom-0 z-30 md:hidden bg-zinc-950/95 backdrop-blur-xl border-t border-white/5"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around px-1 py-1.5">
        {filteredTabs.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? path === '/' : path.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors min-w-[56px] ${
                isActive
                  ? 'text-red-400'
                  : 'text-zinc-500 active:text-zinc-300'
              }`}
            >
              <Icon size={20} fill={isActive && to === '/liked' ? 'currentColor' : 'none'} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
