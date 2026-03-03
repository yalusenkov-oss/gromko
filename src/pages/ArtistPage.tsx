import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Play, Pause, Music } from 'lucide-react';
import { formatPlays } from '../utils/format';
import TrackCard from '../components/TrackCard';

export default function ArtistPage() {
  const { slug } = useParams();
  const { artists, tracks, player, playTrack, togglePlay } = useStore();

  const artist = artists.find(a => a.slug === slug);
  const artistTracks = tracks.filter(t => t.artistSlug === slug);

  if (!artist) return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center pt-16">
      <p className="text-zinc-500">Артист не найден</p>
    </div>
  );

  const isAnyPlaying = artistTracks.some(t => t.id === player.currentTrack?.id) && player.isPlaying;

  const handlePlayAll = () => {
    if (isAnyPlaying) togglePlay();
    else if (artistTracks[0]) playTrack(artistTracks[0], artistTracks);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-16 pb-24">
      {/* Banner */}
      <div className="relative h-72 md:h-96 overflow-hidden"
        style={{ backgroundImage: `url(${artist.photo})`, backgroundSize: 'cover', backgroundPosition: 'center top' }}>
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 max-w-5xl mx-auto flex items-end gap-6">
          <img src={artist.photo} alt={artist.name}
            className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-4 border-zinc-950 shadow-xl" />
          <div>
            <p className="text-zinc-400 text-sm mb-1">{artist.genre}</p>
            <h1 className="text-3xl md:text-5xl font-black">{artist.name}</h1>
            <p className="text-zinc-400 text-sm mt-1">{formatPlays(artist.totalPlays)} прослушиваний · {artist.tracksCount} треков</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {/* Bio */}
        {artist.bio && (
          <p className="text-zinc-400 max-w-2xl">{artist.bio}</p>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button onClick={handlePlayAll}
            className="flex items-center gap-2.5 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-full font-semibold text-sm transition-all shadow-lg shadow-red-500/30">
            {isAnyPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" className="ml-0.5" />}
            {isAnyPlaying ? 'Пауза' : 'Слушать всё'}
          </button>
        </div>

        {/* Tracks */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Music size={18} className="text-red-400" />
            <h2 className="text-lg font-bold">Треки ({artistTracks.length})</h2>
          </div>
          {artistTracks.length === 0 ? (
            <p className="text-zinc-600">У артиста пока нет треков</p>
          ) : (
            <div className="space-y-1">
              {artistTracks.map((t, i) => <TrackCard key={t.id} track={t} queue={artistTracks} showRank={i + 1} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
