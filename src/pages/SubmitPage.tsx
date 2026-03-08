import { useState, useRef, useEffect } from 'react';
import { useStore, GENRES } from '../store';
import { Link } from 'react-router-dom';
import { Upload, CheckCircle, X, Music, Image, AlertCircle, Loader2, Info, Plus, Trash2, Disc3, Search, ExternalLink } from 'lucide-react';
import { apiUrl } from '../lib/api';

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';
type ReleaseType = 'single' | 'album';
type SourceType = 'file' | 'spotify';

interface TrackEntry {
  id: string;
  title: string;
  audioFile: File | null;
}

interface SpotifyJobTrack {
  spotifyId: string;
  title: string;
  artist: string;
  album: string;
  status: 'pending' | 'downloading' | 'processing' | 'done' | 'error';
  error?: string;
}

interface SpotifyJob {
  id: string;
  status: 'pending' | 'fetching_metadata' | 'downloading' | 'processing' | 'done' | 'error';
  progress: number;
  totalTracks: number;
  completedTracks: number;
  failedTracks: number;
  tracks: SpotifyJobTrack[];
  error?: string;
}

interface SpotifyPreview {
  type: 'track' | 'album';
  name: string;
  artist: string;
  cover?: string;
  trackCount?: number;
  tracks?: { name: string; artists: string }[];
}


interface ExistingTrackRef {
  id: string;
  title: string;
  artist: string;
  url?: string;
}

function extractExistingTrackFromMessage(msg: string): ExistingTrackRef | null {
  if (!msg) return null;
  const linkMatch = msg.match(/\/track\/([a-z0-9-]+)/i);
  if (!linkMatch) return null;
  const id = linkMatch[1];
  const metaMatch = msg.match(/:\s*(.+?)\s+—\s+(.+?)\s+\(\/track\//);
  return {
    id,
    artist: metaMatch?.[1] || 'Артист',
    title: metaMatch?.[2] || 'Трек',
    url: `/track/${id}`,
  };
}

export default function SubmitPage() {
  const { currentUser, artists } = useStore();
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [existingTrack, setExistingTrack] = useState<ExistingTrackRef | null>(null);
  const [releaseType, setReleaseType] = useState<ReleaseType>('single');
  const [sourceType, setSourceType] = useState<SourceType>('spotify');

  const [form, setForm] = useState({
    title: '', artist: '', genre: GENRES[0], year: new Date().getFullYear(), comment: '',
    albumName: '',
  });

  // Single track
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const albumBatchInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Multi-track album
  const [albumTracks, setAlbumTracks] = useState<TrackEntry[]>([
    { id: crypto.randomUUID(), title: '', audioFile: null },
    { id: crypto.randomUUID(), title: '', audioFile: null },
  ]);

  // Spotify import
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyAvailable, setSpotifyAvailable] = useState<boolean | null>(null);
  const [spotifyJob, setSpotifyJob] = useState<SpotifyJob | null>(null);
  const [spotifyPreview, setSpotifyPreview] = useState<SpotifyPreview | null>(null);
  const [spotifyLoading, setSpotifyLoading] = useState(false);

  // Check SpotiFLAC availability on mount
  useEffect(() => {
    if (sourceType === 'spotify' && spotifyAvailable === null) {
      const token = localStorage.getItem('gromko_token');
      fetch(apiUrl('/submissions/spotify/health'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then(d => setSpotifyAvailable(d.available))
        .catch(() => setSpotifyAvailable(false));
    }
  }, [sourceType, spotifyAvailable]);


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
          <h2 className="text-2xl font-black mb-2">{isAdmin ? 'Загружено!' : 'Заявка отправлена!'}</h2>
          <p className="text-zinc-400 mb-6">
            {isAdmin
              ? 'Аудио обрабатывается'
              : 'Ваша заявка отправлена на модерацию. После одобрения трек появится на платформе.'
            }
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => {
              setStatus('idle'); setAudioFile(null); setCoverFile(null); setCoverPreview(null);
              setForm({ title: '', artist: '', genre: GENRES[0], year: new Date().getFullYear(), comment: '', albumName: '' });
              setAlbumTracks([{ id: crypto.randomUUID(), title: '', audioFile: null }, { id: crypto.randomUUID(), title: '', audioFile: null }]);
              setSpotifyJob(null); setSpotifyPreview(null); setSpotifyUrl('');
            }} className="px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-lg text-sm transition-colors">Отправить ещё</button>
            <Link to="/tracks" className="px-5 py-2.5 bg-red-500 hover:bg-red-400 rounded-lg text-sm font-medium transition-colors">К трекам</Link>
          </div>
        </div>
      </div>
    );
  }

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.name)) {
      setAudioFile(file);
      if (!form.title) {
        const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        setForm(f => ({ ...f, title: name }));
      }
    }
  };

  const handleCoverSelect = (file: File) => {
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const addAlbumTrack = () => {
    setAlbumTracks(prev => [...prev, { id: crypto.randomUUID(), title: '', audioFile: null }]);
  };

  const removeAlbumTrack = (id: string) => {
    if (albumTracks.length <= 2) return;
    setAlbumTracks(prev => prev.filter(t => t.id !== id));
  };

  const updateAlbumTrack = (id: string, data: Partial<TrackEntry>) => {
    setAlbumTracks(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
  };

  const handleAlbumBatchSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter(f => /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(f.name));
    if (list.length === 0) return;
    list.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' }));
    setAlbumTracks(list.map(file => ({
      id: crypto.randomUUID(),
      title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      audioFile: file,
    })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (releaseType === 'single' && !audioFile) {
      setErrorMsg('Выберите аудиофайл');
      return;
    }
    if (releaseType === 'album') {
      const missing = albumTracks.some(t => !t.audioFile || !t.title.trim());
      if (missing) { setErrorMsg('Заполните все треки альбома'); return; }
      if (!form.albumName.trim()) { setErrorMsg('Укажите название альбома'); return; }
    }

    setStatus('uploading');
    setUploadProgress(0);
    setErrorMsg('');
    setExistingTrack(null);

    try {
      if (releaseType === 'single') {
        const formData = new FormData();
        formData.append('audio', audioFile!);
        formData.append('title', form.title);
        if (coverFile) formData.append('cover', coverFile);
        formData.append('artist', form.artist);
        formData.append('genre', form.genre);
        formData.append('year', form.year.toString());
        if (form.comment) formData.append('comment', form.comment);

        const endpoint = isAdmin ? apiUrl('/tracks/upload') : apiUrl('/submissions');

        const xhr = new XMLHttpRequest();
        const token = localStorage.getItem('gromko_token');

        await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
          });
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const resp = JSON.parse(xhr.responseText);
                if (isAdmin && resp.trackId) {
                  setStatus('processing');
                  pollProcessingStatus(resp.trackId);
                } else {
                  setStatus('done');
                }
              } catch {
                setStatus('done');
              }
              resolve();
            } else {
              let msg = 'Ошибка загрузки';
              try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
              reject(new Error(msg));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('Ошибка сети')));
          xhr.addEventListener('abort', () => reject(new Error('Загрузка отменена')));
          xhr.addEventListener('timeout', () => reject(new Error('Превышено время ожидания')));
          xhr.open('POST', endpoint);
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.send(formData);
        });
      } else {
        // Album mode: upload each track one by one
        const endpoint = isAdmin ? apiUrl('/tracks/upload') : apiUrl('/submissions');
        const token = localStorage.getItem('gromko_token');
        const total = albumTracks.length;
        const releaseId = crypto.randomUUID();

        for (let i = 0; i < total; i++) {
          const t = albumTracks[i];
          const formData = new FormData();
          formData.append('audio', t.audioFile!);
          formData.append('title', t.title);
          formData.append('artist', form.artist);
          formData.append('genre', form.genre);
          formData.append('year', form.year.toString());
          formData.append('albumName', form.albumName);
          formData.append('releaseId', releaseId);
          if (coverFile) formData.append('cover', coverFile);
          if (form.comment && i === 0) formData.append('comment', form.comment);

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const trackProgress = (e.loaded / e.total);
                const overallProgress = Math.round(((i + trackProgress) / total) * 100);
                setUploadProgress(overallProgress);
              }
            });
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                let msg = `Ошибка загрузки трека "${t.title}"`;
                try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
                reject(new Error(msg));
              }
            });
            xhr.addEventListener('error', () => reject(new Error(`Ошибка сети при загрузке "${t.title}"`)));
            xhr.open('POST', endpoint);
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.send(formData);
          });
        }

        setStatus('done');
      }
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
        if (data.status === 'ready') { clearInterval(interval); setStatus('done'); }
        else if (data.status === 'error') { clearInterval(interval); setStatus('error'); setErrorMsg('Ошибка обработки аудио'); }
      } catch {}
    }, 2000);
    setTimeout(() => { clearInterval(interval); if (status === 'processing') setStatus('done'); }, 300000);
  };

  // ─── Spotify import handlers ───

  const isSpotifyUrl = (url: string) =>
    /https?:\/\/open\.spotify\.com\/(track|album)\//.test(url);

  const handleSpotifyPreview = async () => {
    if (!spotifyUrl.trim() || !isSpotifyUrl(spotifyUrl)) {
      setErrorMsg('Вставьте корректную ссылку на трек или альбом Spotify');
      setStatus('error');
      return;
    }

    setSpotifyLoading(true);
    setSpotifyPreview(null);
    setErrorMsg('');

    try {
      const token = localStorage.getItem('gromko_token');
      // Use admin metadata endpoint if admin, otherwise we'll just submit directly
      const metaEndpoint = isAdmin
        ? apiUrl(`/admin/spotify/metadata?url=${encodeURIComponent(spotifyUrl)}`)
        : null;

      if (metaEndpoint) {
        const resp = await fetch(metaEndpoint, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Не удалось получить метаданные');

        if (data.album_info) {
          setSpotifyPreview({
            type: 'album',
            name: data.album_info.name,
            artist: data.album_info.artists,
            cover: data.album_info.images,
            trackCount: data.track_list?.length || data.album_info.total_tracks,
            tracks: data.track_list?.map((t: any) => ({ name: t.name, artists: t.artists })),
          });
        } else if (data.track) {
          setSpotifyPreview({
            type: 'track',
            name: data.track.name,
            artist: data.track.artists,
            cover: data.track.images,
            trackCount: 1,
          });
        }
      } else {
        // For regular users, just validate the URL format
        const isAlbum = spotifyUrl.includes('/album/');
        setSpotifyPreview({
          type: isAlbum ? 'album' : 'track',
          name: isAlbum ? 'Альбом Spotify' : 'Трек Spotify',
          artist: '',
          trackCount: isAlbum ? undefined : 1,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus('error');
    } finally {
      setSpotifyLoading(false);
    }
  };

  const handleSpotifySubmit = async () => {
    if (!spotifyUrl.trim() || !isSpotifyUrl(spotifyUrl)) {
      setErrorMsg('Вставьте корректную ссылку на трек или альбом Spotify');
      setStatus('error');
      return;
    }

    setStatus('uploading');
    setUploadProgress(0);
    setErrorMsg('');
    setExistingTrack(null);

    try {
      const token = localStorage.getItem('gromko_token');
      const resp = await fetch(apiUrl('/submissions/spotify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          url: spotifyUrl.trim(),
          service: 'tidal',
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        if (resp.status === 409 && data?.existingTrack) {
          setExistingTrack(data.existingTrack);
        }
        throw new Error(data.error || 'Ошибка при отправке');
      }

      // Poll job status
      const jobId = data.jobId;
      setStatus('processing');

      const pollInterval = setInterval(async () => {
        try {
          const jobResp = await fetch(apiUrl(`/submissions/spotify/job/${jobId}`), {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const jobData = await jobResp.json();
          setSpotifyJob(jobData);

          if (jobData.totalTracks > 0) {
            setUploadProgress(Math.round((jobData.completedTracks / jobData.totalTracks) * 100));
          }

          if (jobData.status === 'done') {
            if (jobData.completedTracks === 0 && jobData.failedTracks > 0) {
              clearInterval(pollInterval);
              setStatus('error');
              setErrorMsg(jobData.error || 'Импорт завершился с ошибкой, ни один трек не был добавлен');
              return;
            }
            clearInterval(pollInterval);
            setStatus('done');
          } else if (jobData.status === 'error') {
            clearInterval(pollInterval);
            setStatus('error');
            const existingFromError = extractExistingTrackFromMessage(jobData.error || '');
            if (existingFromError) setExistingTrack(existingFromError);
            setErrorMsg(jobData.error || 'Ошибка при импорте');
          }
        } catch { /* ignore poll errors */ }
      }, 2000);

      // Timeout after 10 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (status === 'processing') {
          setStatus('done');
        }
      }, 600000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  const isUploading = status === 'uploading' || status === 'processing';

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8 overflow-x-hidden">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
            <Upload size={20} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black">{isAdmin ? 'Загрузить трек' : 'Предложить трек'}</h1>
            <p className="text-zinc-500 text-sm">
              {isAdmin ? 'Прямая загрузка с обработкой' : 'Предложите музыку для GROMQ'}
            </p>
          </div>
        </div>

        {/* Info panel for regular users */}
        {!isAdmin && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 mb-6">
            <div className="flex gap-3">
              <Info size={20} className="text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="text-blue-200 font-medium">Как это работает?</p>
                <p className="text-blue-300/70">
                  Вы можете предложить трек или альбом, который вам нравится, но которого ещё нет на платформе.
                  Загрузите аудиофайл или вставьте ссылку на Spotify — заявка будет отправлена на модерацию.
                </p>
                <p className="text-blue-300/70">
                  После одобрения администратором трек пройдёт обработку и появится на платформе.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error banner */}
        {status === 'error' && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 text-sm font-medium">Ошибка</p>
              <p className="text-red-400/70 text-sm">{errorMsg}</p>
              {existingTrack?.id && (
                <Link
                  to={`/track/${existingTrack.id}`}
                  className="inline-flex mt-2 text-sm text-red-300 hover:text-red-200 underline underline-offset-2"
                >
                  Открыть существующий трек: {existingTrack.artist} — {existingTrack.title}
                </Link>
              )}
            </div>
            <button onClick={() => setStatus('idle')} className="ml-auto text-red-400/50 hover:text-red-400"><X size={16} /></button>
          </div>
        )}

        {/* Upload progress overlay */}
        {isUploading && (
          <div className="mb-6 bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 size={20} className="text-red-400 animate-spin" />
              <div>
                <p className="text-white text-sm font-medium">
                  {sourceType === 'spotify'
                    ? (status === 'uploading' ? 'Отправка запроса...' : 'Загрузка из Spotify...')
                    : (status === 'uploading' ? 'Загрузка файла...' : 'Обработка аудио...')}
                </p>
                <p className="text-zinc-500 text-xs">
                  {sourceType === 'spotify'
                    ? (spotifyJob
                      ? `${spotifyJob.completedTracks} из ${spotifyJob.totalTracks} треков`
                      : 'Подождите, идёт загрузка...')
                    : (status === 'uploading' ? `${uploadProgress}%` : 'Транскодирование, HLS, вейвформа...')}
                </p>
              </div>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }} />
            </div>

            {/* Import job track list */}
            {sourceType === 'spotify' && spotifyJob && spotifyJob.tracks.length > 0 && (
              <div className="mt-4 space-y-1.5 max-h-48 overflow-y-auto">
                {spotifyJob.tracks.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-center shrink-0">
                      {t.status === 'done' && <CheckCircle size={12} className="text-green-400" />}
                      {t.status === 'error' && <AlertCircle size={12} className="text-red-400" />}
                      {(t.status === 'downloading' || t.status === 'processing') && <Loader2 size={12} className="text-yellow-400 animate-spin" />}
                      {t.status === 'pending' && <span className="w-2 h-2 rounded-full bg-zinc-600 block mx-auto" />}
                    </span>
                    <span className={`truncate ${t.status === 'done' ? 'text-zinc-300' : t.status === 'error' ? 'text-red-400' : 'text-zinc-500'}`}>
                      {t.artist} — {t.title}
                    </span>
                    {t.error && <span className="text-red-500/60 text-[10px] ml-auto shrink-0">{t.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Source type selector */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
          <button type="button" onClick={() => setSourceType('spotify')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${sourceType === 'spotify' ? 'bg-green-500/20 text-green-400' : 'text-zinc-500 hover:text-white'}`}>
            <ExternalLink size={16} /> Ссылка Spotify
          </button>
          <button type="button" onClick={() => setSourceType('file')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${sourceType === 'file' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}>
            <Upload size={16} /> Загрузить файл
          </button>
        </div>

        {/* ═══════════════ SPOTIFY MODE ═══════════════ */}
        {sourceType === 'spotify' && (
          <div className="space-y-5">
            {spotifyAvailable === false && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                <div className="flex gap-3">
                  <AlertCircle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-yellow-300/80 text-sm">
                    Сервис импорта из Spotify временно недоступен. Попробуйте позже или загрузите файл вручную.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Ссылка Spotify *</label>
              <div className="flex gap-2">
                <input
                  value={spotifyUrl}
                  onChange={e => { setSpotifyUrl(e.target.value); setSpotifyPreview(null); }}
                  placeholder="https://open.spotify.com/track/... или /album/..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-green-500/50"
                />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleSpotifyPreview}
                    disabled={spotifyLoading || !spotifyUrl.trim()}
                    className="px-4 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 border border-white/10 rounded-xl text-zinc-300 transition-colors shrink-0"
                  >
                    {spotifyLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  </button>
                )}
              </div>
              <p className="text-zinc-600 text-xs mt-1.5">
                Вставьте ссылку на трек или альбом из Spotify
              </p>
            </div>

            {/* Spotify preview card */}
            {spotifyPreview && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex gap-4">
                  {spotifyPreview.cover && (
                    <img
                      src={spotifyPreview.cover.startsWith('http')
                        ? spotifyPreview.cover
                        : `https://i.scdn.co/image/${spotifyPreview.cover}`}
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                      alt=""
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{spotifyPreview.name}</p>
                    <p className="text-zinc-400 text-sm truncate">{spotifyPreview.artist}</p>
                    <p className="text-zinc-600 text-xs mt-1">
                      {spotifyPreview.type === 'album'
                        ? `Альбом · ${spotifyPreview.trackCount || '?'} треков`
                        : 'Трек'}
                    </p>
                  </div>
                </div>

                {/* Album track list */}
                {spotifyPreview.tracks && spotifyPreview.tracks.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1 max-h-40 overflow-y-auto">
                    {spotifyPreview.tracks.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                        <span className="w-5 text-right shrink-0 text-zinc-600">{i + 1}</span>
                        <span className="truncate">{t.name}</span>
                        <span className="text-zinc-700 ml-auto shrink-0">{t.artists}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Disclaimer */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-yellow-300/80 text-xs leading-relaxed">
                ⚠️ Предлагайте только реально существующие релизы. Отправляя заявку, вы подтверждаете, что трек является
                публично доступным произведением и размещается в ознакомительных целях.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSpotifySubmit}
              disabled={isUploading || !spotifyUrl.trim() || spotifyAvailable === false}
              className="w-full py-3.5 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-600/20 disabled:shadow-none"
            >
              {isUploading ? 'Загрузка...' : isAdmin ? 'Импортировать' : 'Отправить на модерацию'}
            </button>
          </div>
        )}

        {/* ═══════════════ FILE UPLOAD MODE ═══════════════ */}
        {sourceType === 'file' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Release type selector */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            <button type="button" onClick={() => setReleaseType('single')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${releaseType === 'single' ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <Music size={16} /> Сингл
            </button>
            <button type="button" onClick={() => setReleaseType('album')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${releaseType === 'album' ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <Disc3 size={16} /> Альбом / EP
            </button>
          </div>

          {/* === SINGLE TRACK === */}
          {releaseType === 'single' && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Аудиофайл *</label>
                <div
                  className={`relative border-2 border-dashed rounded-xl p-5 md:p-8 text-center transition-all cursor-pointer ${
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
                      <button type="button" onClick={e => { e.stopPropagation(); setAudioFile(null); }} className="text-zinc-500 hover:text-red-400"><X size={16} /></button>
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

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Название трека *</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
                  placeholder="Введите название" />
              </div>
            </>
          )}

          {/* === ALBUM / EP === */}
          {releaseType === 'album' && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Название альбома *</label>
                <input required value={form.albumName} onChange={e => setForm(f => ({ ...f, albumName: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
                  placeholder="Название альбома или EP" />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">Треки *</label>
                <div className="mb-2">
                  <input
                    ref={albumBatchInputRef}
                    type="file"
                    accept=".mp3,.wav,.flac,.aac,.ogg,.m4a"
                    multiple
                    className="hidden"
                    onChange={e => handleAlbumBatchSelect(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => albumBatchInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-sm transition-colors"
                  >
                    <Upload size={14} /> Загрузить треки пачкой
                  </button>
                </div>
                <div className="space-y-2">
                  {albumTracks.map((track, i) => (
                    <div key={track.id} className="flex items-center gap-2 bg-white/5 rounded-xl p-2.5 md:p-3 overflow-hidden">
                      <span className="text-zinc-500 text-sm font-bold w-6 text-center shrink-0">{i + 1}</span>
                      <input
                        value={track.title}
                        onChange={e => updateAlbumTrack(track.id, { title: e.target.value })}
                        placeholder="Название трека"
                        className="flex-1 bg-transparent border-none text-white text-sm placeholder-zinc-500 focus:outline-none min-w-0"
                      />
                      <label className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${track.audioFile ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-zinc-400 hover:text-white'}`}>
                        {track.audioFile ? '✓' : 'Файл'}
                        <input type="file" accept=".mp3,.wav,.flac,.aac,.ogg,.m4a" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) updateAlbumTrack(track.id, { audioFile: f, title: track.title || f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') }); }} />
                      </label>
                      {albumTracks.length > 2 && (
                        <button type="button" onClick={() => removeAlbumTrack(track.id)} className="text-zinc-600 hover:text-red-400 transition-colors shrink-0">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addAlbumTrack}
                  className="mt-2 flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors px-3 py-2">
                  <Plus size={14} /> Добавить трек
                </button>
              </div>
            </>
          )}

          {/* Common fields */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Обложка</label>
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
                  <button type="button" onClick={() => { setCoverFile(null); setCoverPreview(null); }} className="text-red-400 text-xs mt-1 hover:underline">Удалить</button>
                )}
              </div>
            </div>
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
              placeholder="Ссылка на релиз, дополнительная информация..." />
          </div>

          {/* Disclaimer */}
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
            <p className="text-yellow-300/80 text-xs leading-relaxed">
              ⚠️ Предлагайте только реально существующие релизы. Отправляя заявку, вы подтверждаете, что трек является 
              публично доступным произведением и размещается в ознакомительных целях.
            </p>
          </div>

          <button type="submit" disabled={isUploading}
            className="w-full py-3.5 bg-red-500 hover:bg-red-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-500/20 disabled:shadow-none">
            {isUploading ? 'Загрузка...' : isAdmin ? 'Загрузить' : 'Отправить на модерацию'}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
