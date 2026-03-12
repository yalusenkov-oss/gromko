import { Search, Bell, MessageCircle } from "lucide-react";
import { useState } from "react";

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-gromq-bg/80 backdrop-blur-xl border-b border-gromq-border">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 h-12 sm:h-14 flex items-center justify-between gap-3">
        {/* Logo */}
        <div className="flex items-center gap-4 lg:gap-6 shrink-0">
          <h1 className="text-lg sm:text-xl font-black tracking-tight">
            <span className="text-gromq-red">GROM</span>
            <span className="text-gromq-text">Q</span>
          </h1>

          {/* Nav Links - Desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {["Главная", "Обзор", "Библиотека", "Любимое"].map((item, i) => (
              <button
                key={item}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  i === 0
                    ? "text-gromq-text bg-gromq-surface"
                    : "text-gromq-muted hover:text-gromq-text hover:bg-gromq-surface/50"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Search - expandable on mobile */}
          {searchOpen ? (
            <div className="flex items-center bg-gromq-surface border border-gromq-border rounded-xl px-3 py-1.5 gap-2 flex-1 sm:w-48 lg:w-64 animate-fade-in">
              <Search size={14} className="text-gromq-muted shrink-0" />
              <input
                type="text"
                placeholder="Поиск..."
                autoFocus
                onBlur={() => setSearchOpen(false)}
                className="bg-transparent text-sm text-gromq-text placeholder-gromq-muted outline-none w-full"
              />
            </div>
          ) : (
            <>
              {/* Mobile search button */}
              <button
                onClick={() => setSearchOpen(true)}
                className="sm:hidden w-9 h-9 rounded-xl bg-gromq-surface border border-gromq-border flex items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors"
              >
                <Search size={16} />
              </button>
              {/* Desktop search input */}
              <div className="hidden sm:flex items-center bg-gromq-surface border border-gromq-border rounded-xl px-3 py-1.5 gap-2 w-48 lg:w-64">
                <Search size={14} className="text-gromq-muted shrink-0" />
                <input
                  type="text"
                  placeholder="Поиск..."
                  className="bg-transparent text-sm text-gromq-text placeholder-gromq-muted outline-none w-full"
                />
              </div>
            </>
          )}

          <button className="w-9 h-9 rounded-xl bg-gromq-surface border border-gromq-border flex items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors relative">
            <Bell size={16} />
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-gromq-red rounded-full" />
          </button>

          <button className="hidden sm:flex w-9 h-9 rounded-xl bg-gromq-surface border border-gromq-border items-center justify-center text-gromq-muted hover:text-gromq-text transition-colors">
            <MessageCircle size={16} />
          </button>

          <img
            src="https://i.pravatar.cc/40?img=12"
            alt="Me"
            className="w-8 h-8 rounded-full border border-gromq-border cursor-pointer hidden sm:block"
          />
        </div>
      </div>
    </header>
  );
}
