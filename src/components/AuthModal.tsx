import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { X, Music2 } from 'lucide-react';

export default function AuthModal() {
  const { authModal, closeAuthModal, login, register } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authModal) {
      setMode(authModal);
      setError('');
      setName('');
      setEmail('');
      setPassword('');
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

  if (!authModal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let ok = false;
    if (mode === 'login') {
      ok = await login(email, password);
      if (!ok) setError('Неверный email или пароль');
    } else {
      ok = await register(name, email, password);
      if (!ok) setError('Ошибка регистрации. Возможно, email уже занят.');
    }

    setLoading(false);
    if (ok) closeAuthModal();
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
      <div className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 p-6 animate-in">
        {/* Close button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Music2 size={24} className="text-white" />
          </div>
          <h2 className="text-xl font-black text-white">
            {mode === 'login' ? 'Вход в GROMKO' : 'Регистрация'}
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
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 transition-colors"
              placeholder="Ваше имя"
            />
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
      </div>
    </div>
  );
}
