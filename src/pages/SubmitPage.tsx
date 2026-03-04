 а import { useState, useRef, useCallback } from 'react';
import { useStore, GENRES } from '../store';
import { Link } from 'react-router-dom';
import { Upload, CheckCircle, X, Music, Image, AlertCircle, Loader2 } from 'lucide-react';
import { apiUrl } from '../lib/api';

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export default function SubmitPage() {
  const { currentUser, artists } = useStore();
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({
    title: '', artist: '', genre: GENRES[0], year: new Date().getFullYear(), comment: '',
  });

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white pt-16 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Для отправки трека необходимо войти</p>
          <Link to="/login" className="px-6 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">Войти</Link>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser.role === 'admin';

  if (status === 'done') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white pt-16 flex items-center justify-center">
        <div className="text-center max-w-md p-8 bg-white/5 rounded-2xl">
          <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-2">{isAdmin ? 'Трек загружен!' : 'Трек отправлен!'}</h2>
          <p className="text-zinc-400 mb-6">
            {isAdmin
              ? 'Аудио обрабатывается на сервере — создаётся несколько качеств, HLS-поток и вейвформа. Это может занять пару минут.'
              : 'Ваш трек отправлен на модерацию. После проверки администратором он появится на платформе. Вы получите уведомление о решении.'
            }
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setStatus('idle'); setAudioFile(null); setCoverFile(null); setCoverPreview(null); setForm({ title: '', artist: '', genre: GENRES[0], year: new Date().getFullYear(), comment: '' }); }} className="px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-lg text-sm transition-colors">Загрузить ещё</button>
            <Link to="/tracks" className="px-5 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">К трекам</Link>
          </div>
        </div>
      </div>
    );
  }

  const handleAudioDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.name)) {
      setAudioFile(file);
      if (!form.title) {
        // Auto-fill title from filename
        const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        setForm(f => ({ ...f, title: name }));
      }
    }
  }, [form.title]);

  const handleCoverSelect = (file: File) => {
    setCoverFile(file);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!audioFile) {
      setErrorMsg('Выберите аудиофайл');
      return;
    }

    setStatus('uploading');
    setUploadProgress(0);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      if (coverFile) formData.append('cover', coverFile);
      formData.append('title', form.title);
      formData.append('artist', form.artist);
      formData.append('genre', form.genre);
      formData.append('year', form.year.toString());
      if (form.comment) formData.append('comment', form.comment);

      // Admin → direct upload + processing; User → submission for moderation
      const endpoint = isAdmin ? apiUrl('/tracks/upload') : apiUrl('/submissions');

      const xhr = new XMLHttpRequest();
      const token = localStorage.getItem('gromko_token');

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const resp = JSON.parse(xhr.responseText);
              if (isAdmin && resp.trackId) {
                // Admin: track is being processed, poll status
                setStatus('processing');
                pollProcessingStatus(resp.trackId);
              } else {
                // User: submission created, done
                setStatus('done');
              }
            } catch {
              setStatus('done');
            }
            resolve();
          } else {
            let msg = 'Ошибка загрузки';
            try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* ignore */ }
            reject(new Error(msg));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Ошибка сети')));
        xhr.addEventListener('abort', () => reject(new Error('Загрузка отменена')));

        xhr.open('POST', endpoint);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });

    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Неизвестная ошибка');
    }
  };

  const pollProcessingStatus = (trackId: string) => {
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(apiUrl(`/tracks/${trackId}/status`));
        const data = await resp.json();
        if (data.status === 'ready') {
          clearInterval(interval);
          setStatus('done');
        } else if (data.status === 'error') {
          clearInterval(interval);
          setStatus('error');
          setErrorMsg('Ошибка обработки аудио на сервере');
        }
      } catch { /* keep polling */ }
    }, 2000);

    // Safety: stop after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
      if (status === 'processing') setStatus('done'); // assume it's fine
    }, 300000);
  };

  const isUploading = status === 'uploading' || status === 'processing';

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-24">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
            <Upload size={20} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black">{isAdmin ? 'Загрузить трек' : 'Предложить трек'}</h1>
            <p className="text-zinc-500 text-sm">
              {isAdmin
                ? 'Аудио будет транскодировано в несколько качеств + HLS'
                : 'Трек будет отправлен на модерацию администратору'
              }
            </p>
          </div>
        </div>

        {/* Error banner */}
        {status === 'error' && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 text-sm font-medium">Ошибка</p>
              <p className="text-red-400/70 text-sm">{errorMsg}</p>
            </div>
            <button onClick={() => setStatus('idle')} className="ml-auto text-red-400/50 hover:text-red-400">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Upload progress overlay */}
        {isUploading && (
          <div className="mb-6 bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 size={20} className="text-red-400 animate-spin" />
              <div>
                <p className="text-white text-sm font-medium">
                  {status === 'uploading' ? 'Загрузка файла...' : 'Обработка аудио...'}
                </p>
                <p className="text-zinc-500 text-xs">
                  {status === 'uploading'
                    ? `${uploadProgress}% — загрузка на сервер`
                    : 'Транскодирование, генерация HLS, анализ громкости, создание вейвформы...'
                  }
                </p>
              </div>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-300"
                style={{ width: status === 'uploading' ? `${uploadProgress}%` : '100%' }}
              />
            </div>
            {status === 'processing' && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {['64 kbps', '128 kbps', '256 kbps', 'FLAC', 'HLS', 'Waveform'].map(step => (
                  <span key={step} className="text-[10px] bg-white/5 text-zinc-400 px-2 py-1 rounded animate-pulse">{step}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Audio file drop zone */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Аудиофайл *</label>
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                audioFile ? 'border-green-500/50 bg-green-500/5' : 'border-white/10 hover:border-red-500/50'
              }`}
              onClick={() => audioInputRef.current?.click()}
              onDrop={handleAudioDrop}
              onDragOver={e => e.preventDefault()}
            >
              <input ref={audioInputRef} type="file" accept=".mp3,.wav,.flac,.aac,.ogg,.m4a" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setAudioFile(f); if (!form.title) setForm(ff => ({ ...ff, title: f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') })); } }} />

              {audioFile ? (
                <div className="flex items-center justify-center gap-3">
                  <Music size={20} className="text-green-400" />
                  <div className="text-left">
                    <p className="text-white text-sm font-medium truncate max-w-xs">{audioFile.name}</p>
                    <p className="text-zinc-500 text-xs">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button type="button" onClick={e => { e.stopPropagation(); setAudioFile(null); }} className="text-zinc-500 hover:text-red-400">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={24} className="text-zinc-600 mx-auto mb-2" />
                  <p className="text-zinc-400 text-sm">Перетащите файл или нажмите для выбора</p>
                  <p className="text-zinc-600 text-xs mt-1">MP3, WAV, FLAC, AAC, OGG до 100MB</p>
                </>
              )}
            </div>
          </div>

          {/* Cover art */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Обложка (необязательно)</label>
            <div className="flex items-center gap-4">
              <div
                className={`w-24 h-24 rounded-xl border-2 border-dashed overflow-hidden flex items-center justify-center cursor-pointer transition-all ${
                  coverPreview ? 'border-transparent' : 'border-white/10 hover:border-red-500/50'
                }`}
                onClick={() => coverInputRef.current?.click()}
              >
                <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverSelect(f); }} />
                {coverPreview ? (
                  <img src={coverPreview} className="w-full h-full object-cover" />
                ) : (
                  <Image size={20} className="text-zinc-600" />
                )}
              </div>
              <div className="text-zinc-500 text-xs">
                <p>JPG, PNG до 5MB</p>
                <p>Рекомендуемый размер: 1200×1200</p>
                {coverFile && (
                  <button type="button" onClick={() => { setCoverFile(null); setCoverPreview(null); }} className="text-red-400 text-xs mt-1 hover:underline">
                    Удалить
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Название трека *</label>
            <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
              placeholder="Введите название" />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Артист *</label>
            <input required list="artists-list" value={form.artist} onChange={e => setForm(f => ({ ...f, artist: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
              placeholder="Имя артиста или группы" />
            <datalist id="artists-list">
              {artists.map(a => <option key={a.id} value={a.name} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Жанр *</label>
              <select required value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none">
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Год *</label>
              <input required type="number" min="1900" max={new Date().getFullYear()} value={form.year}
                onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500/50" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Комментарий</label>
            <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 resize-none"
              placeholder="Дополнительная информация..." />
          </div>

          <div className="pt-2">
            <p className="text-zinc-600 text-xs mb-4">Отправляя трек, вы подтверждаете права на его распространение.</p>
            <button type="submit" disabled={isUploading}
              className="w-full py-3.5 bg-red-500 hover:bg-red-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-500/20 disabled:shadow-none">
              {isUploading ? 'Загрузка...' : isAdmin ? 'Загрузить трек' : 'Отправить на модерацию'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
