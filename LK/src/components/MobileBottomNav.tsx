import { Home, Search, Library, Heart, User } from "lucide-react";
import { useState } from "react";

const navItems = [
  { icon: Home, label: "Главная", active: true },
  { icon: Search, label: "Поиск", active: false },
  { icon: Library, label: "Библиотека", active: false },
  { icon: Heart, label: "Любимое", active: false },
  { icon: User, label: "Профиль", active: false },
];

export function MobileBottomNav() {
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-gromq-bg/90 backdrop-blur-xl border-t border-gromq-border safe-bottom">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item, i) => {
          const Icon = item.icon;
          const isActive = i === activeIdx;
          return (
            <button
              key={item.label}
              onClick={() => setActiveIdx(i)}
              className={`flex flex-col items-center justify-center gap-0.5 w-14 h-14 transition-colors ${
                isActive ? "text-gromq-red" : "text-gromq-muted"
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
