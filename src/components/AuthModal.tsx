import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { X, Music2, AlertTriangle, Search, Check } from 'lucide-react';

const COUNTRIES = [
  'Казахстан', 'Беларусь', 'Узбекистан', 'Кыргызстан',
  'Грузия', 'Армения', 'Азербайджан', 'Молдова', 'Таджикистан', 'Туркменистан',
  'Латвия', 'Литва', 'Эстония', 'Польша', 'Германия', 'Чехия', 'Турция',
  'США', 'Великобритания', 'Канада', 'Франция', 'Другое',
];

export default function AuthModal() {
  const { authModal, closeAuthModal, login, register, artists, tracks } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<'form' | 'artists'>('form');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [artistSearch, setArtistSearch] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authModal) {
      setMode(authModal);
      setStep('form');
      setError('');
      setName('');
      setUsername('');
      setEmail('');
      setPassword('');
      setCountry('');
      setSelectedArtists([]);
      setArtistSearch('');
    }
  }, [authModal]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (authModal) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${window.scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      if (scrollY) window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    return () => {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      if (scrollY) window.scrollTo(0, parseInt(scrollY || '0') * -1);
    };
  }, [authModal]);

  // Build artist list for picker
  const displayArtists = useMemo(() => {
    const list = artists.map(a => {
      const needsFallback = !a.photo || a.photo.includes('default') || a.photo.includes('placeholder');
      if (needsFallback) {
        const artistTrack = tracks.find(t => t.artists?.some(ar => ar.slug === a.slug) || t.artistSlug === a.slug);
        return { ...a, photo: artistTrack?.cover || a.photo };
      }
      return a;
    });
    if (!artistSearch.trim()) return list;
    const q = artistSearch.toLowerCase();
    return list.filter(a => a.name.toLowerCase().includes(q));
  }, [artists, tracks, artistSearch]);

  if (!authModal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (mode === 'login') {
      const ok = await login(email, password);
      if (!ok) setError('Неверный email или пароль');
      if (ok) closeAuthModal();
    } else {
      if (!country) {
        setError('Выберите страну');
        setLoading(false);
        return;
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const result = await register(name, email, password, country, username, timezone);
      if (result === true) {
        if (artists.length > 0) {
          setStep('artists');
        } else {
          closeAuthModal();
        }
      } else {
        setError(result);
      }
    }

    setLoading(false);
  };

  const toggleArtistSelect = (slug: string) => {
    setSelectedArtists(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const handleFinishOnboarding = () => {
    const { toggleArtistLike } = useStore.getState();
    for (const slug of selectedArtists) {
      toggleArtistLike(slug);
    }
    closeAuthModal();
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      closeAuthModal();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      onClick={handleBackdrop}
    >
      {/* Backdrop — covers everything including BottomNav */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Modal */}
      <div
        ref={modalRef}
        className={`relative w-full bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 animate-in ${
          step === 'artists'
            ? 'max-w-lg flex flex-col max-h-[80dvh]'
            : 'max-w-sm p-6 max-h-[80dvh] overflow-y-auto overscroll-contain'
        }`}
      >
        {/* Close button */}
        <button
          onClick={() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            step === 'artists' ? handleFinishOnboarding() : closeAuthModal();
          }}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors z-10"
        >
          <X size={20} />
        </button>

        {step === 'artists' ? (
          <>
            <div className="shrink-0 p-6 pb-0">
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Music2 size={24} className="text-white" />
                </div>
                <h2 className="text-xl font-black text-white">Выберите артистов</h2>
                <p className="text-zinc-500 text-sm mt-1">
                  Выберите исполнителей, которые вам нравятся
                </p>
              </div>
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={artistSearch}
                  onChange={e => setArtistSearch(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 transition-colors"
                  placeholder="Поиск артистов..."
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 min-h-0">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pb-2">
                {displayArtists.map(artist => {
                  const isSelected = selectedArtists.includes(artist.slug);
                  return (
                    <button
                      key={artist.id}
                      onClick={() => toggleArtistSelect(artist.slug)}
                      className={`flex flex-col items-center p-2 rounded-xl transition-all ${isSelected ? 'bg-red-500/20 ring-2 ring-red-500' : 'bg-white/5 hover:bg-white/10'}`}
                    >
                      <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden mb-1.5">
                        {artist.photo ? (
                          <img src={artist.photo} alt={artist.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                            <Music2 size={20} className="text-zinc-600" />
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute inset-0 bg-red-500/40 flex items-center justify-center">
                            <Check size={20} className="text-white" />
                          </div>
                        )}
                      </div>
                      <p className="text-white text-xs font-medium truncate w-full text-center">{artist.name}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="shrink-0 p-6 pt-4 border-t border-white/5">
              <button
                onClick={handleFinishOnboarding}
                className="w-full py-3 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-xl transition-all text-sm"
              >
                {selectedArtists.length > 0
                  ? `Готово (${selectedArtists.length} выбрано)`
                  : 'Пропустить'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Music2 size={24} className="text-white" />
              </div>
              <h2 className="text-xl font-black text-white">
                {mode === 'login' ? 'Вход в GROMQ' : 'Регистрация'}
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                {mode === 'login'
                  ? 'Войдите, чтобы слушать музыку'
                  : 'Создайте аккаунт, чтобы начать'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'register' && (
                <>
                  <input
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 transition-colors"
                    placeholder="Ваше имя"
                  />
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
                    <input
                      required
                      value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 transition-colors"
                      placeholder="username"
                      minLength={3}
                      maxLength={30}
                    />
                  </div>
                  <div className="relative">
                    <select
                      required
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/50 transition-colors appearance-none"
                    >
                      <option value="" disabled className="bg-zinc-900 text-zinc-500">Страна</option>
                      {COUNTRIES.map(c => (
                        <option key={c} value={c} className="bg-zinc-900 text-white">{c}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 text-xs">▼</div>
                  </div>
                  <div className="flex items-start gap-2 bg-red-950/40 border border-red-500/20 rounded-xl px-3 py-2">
                    <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-red-400/80 text-[11px] leading-tight">
                      Сервис не работает на территории Российской Федерации. Регистрация из РФ недоступна.
                    </p>
                  </div>
                </>
              )}
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 transition-colors"
                placeholder="Email"
              />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 transition-colors"
                placeholder={mode === 'register' ? 'Пароль (мин. 6 символов)' : 'Пароль'}
                minLength={mode === 'register' ? 6 : undefined}
              />

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold rounded-xl transition-all text-sm"
              >
                {loading
                  ? (mode === 'login' ? 'Вход...' : 'Регистрация...')
                  : (mode === 'login' ? 'Войти' : 'Зарегистрироваться')
                }
              </button>
            </form>

            <p className="text-center text-zinc-500 text-sm mt-4">
              {mode === 'login' ? (
                <>Нет аккаунта?{' '}
                  <button onClick={() => { setMode('register'); setError(''); }} className="text-white hover:text-red-400 transition-colors">
                    Зарегистрироваться
                  </button>
                </>
              ) : (
                <>Уже есть аккаунт?{' '}
                  <button onClick={() => { setMode('login'); setError(''); }} className="text-white hover:text-red-400 transition-colors">
                    Войти
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
