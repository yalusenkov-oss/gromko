import { useState, useEffect, useMemo } from 'react';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [artistSearch, setArtistSearch] = useState('');

  useEffect(() => {
    if (authModal) {
      setMode(authModal);
      setStep('form');
      setError('');
      setName('');
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
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [authModal]);

  // Build artist list for picker (with covers from their tracks)
  // MUST be before early return to keep hooks order stable
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

    let ok = false;
    if (mode === 'login') {
      ok = await login(email, password);
      if (!ok) setError('Неверный email или пароль');
      if (ok) closeAuthModal();
    } else {
      if (!country) {
        setError('Выберите страну');
        setLoading(false);
        return;
      }
      ok = await register(name, email, password, country);
      if (!ok) setError('Ошибка регистрации. Возможно, email уже занят.');
      if (ok && artists.length > 0) {
        // Show artist preference picker
        setStep('artists');
      } else if (ok) {
        closeAuthModal();
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
    // Like selected artists
    const { toggleArtistLike } = useStore.getState();
    for (const slug of selectedArtists) {
      toggleArtistLike(slug);
    }
    closeAuthModal();
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeAuthModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={handleBackdrop}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Modal */}
      <div className={`relative w-full bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 p-6 animate-in max-h-[90vh] overflow-y-auto ${step === 'artists' ? 'max-w-lg' : 'max-w-sm'}`}>
        {/* Close button */}
        <button
          onClick={step === 'artists' ? handleFinishOnboarding : closeAuthModal}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors z-10"
        >
          <X size={20} />
        </button>

        {step === 'artists' ? (
          /* Artist preference picker */
          <>
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Music2 size={24} className="text-white" />
              </div>
              <h2 className="text-xl font-black text-white">Выберите артистов</h2>
              <p className="text-zinc-500 text-sm mt-1">
                Выберите исполнителей, которые вам нравятся
              </p>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={artistSearch}
                onChange={e => setArtistSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 transition-colors"
                placeholder="Поиск артистов..."
              />
            </div>

            {/* Artist grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-5 max-h-[50vh] overflow-y-auto pr-1">
              {displayArtists.map(artist => {
                const isSelected = selectedArtists.includes(artist.slug);
                return (
                  <button
                    key={artist.id}
                    onClick={() => toggleArtistSelect(artist.slug)}
                    className={`flex flex-col items-center p-2 rounded-xl transition-all ${isSelected ? 'bg-red-500/20 ring-2 ring-red-500' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    <div className="relative w-16 h-16 rounded-full overflow-hidden mb-1.5">
                      {artist.photo ? (
                        <img src={artist.photo} alt={artist.name} className="w-full h-full object-cover" />
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

            {/* Done button */}
            <button
              onClick={handleFinishOnboarding}
              className="w-full py-3 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-xl transition-all text-sm"
            >
              {selectedArtists.length > 0
                ? `Готово (${selectedArtists.length} выбрано)`
                : 'Пропустить'}
            </button>
          </>
        ) : (
          /* Login / Register form */
          <>
            {/* Header */}
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

        {/* Form */}
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

        {/* Toggle mode */}
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
