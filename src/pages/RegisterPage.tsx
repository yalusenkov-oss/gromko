import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Music2 } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await register(name, email, password);
    setLoading(false);
    if (ok) navigate('/');
    else setError('Ошибка регистрации. Возможно, email уже занят.');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Music2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black">GROMQ</h1>
          <p className="text-zinc-500 text-sm mt-1">Создайте аккаунт</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Имя</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
              placeholder="Ваше имя" />
          </div>
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
              placeholder="Минимум 6 символов" minLength={6} />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold rounded-xl transition-all mt-2">
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-6">
          Уже есть аккаунт? <Link to="/login" className="text-white hover:text-red-400 transition-colors">Войти</Link>
        </p>
      </div>
    </div>
  );
}
