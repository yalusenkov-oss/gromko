import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Music2 } from 'lucide-react';

export default function LoginPage() {
  const { login } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await login(email, password);
    setLoading(false);
    if (ok) navigate('/');
    else setError('Неверный email или пароль');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Music2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black">GROMKO</h1>
          <p className="text-zinc-500 text-sm mt-1">Войдите в свой аккаунт</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
              placeholder="your@email.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Пароль</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
              placeholder="••••••••" />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold rounded-xl transition-all mt-2">
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-6">
          Нет аккаунта? <Link to="/register" className="text-white hover:text-red-400 transition-colors">Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  );
}
