import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArtistSearchInput } from '../features/artist/ArtistSearchInput';
import { createMultiplayerRoom } from '../api/multiplayer';
import type { ArtistSearchResult, MultiplayerGuessMode } from '../types/api';

export function MultiplayerHomePage() {
  const navigate = useNavigate();
  const [artist, setArtist] = useState<ArtistSearchResult | null>(null);
  // Fixed for the whole room rather than per player: a race only means something if everyone
  // is answering the same way.
  const [guessMode, setGuessMode] = useState<MultiplayerGuessMode>('search');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');

  const createRoom = useCallback(async () => {
    if (!artist || creating) return;
    setCreating(true);
    setError(null);
    try {
      const { code } = await createMultiplayerRoom(artist.id, guessMode);
      navigate(`/room/${code}`, { state: { autoJoin: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a room. Please try again.');
      setCreating(false);
    }
  }, [artist, creating, guessMode, navigate]);

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center gap-8 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 text-center"
      >
        <h1 className="text-4xl font-extrabold tracking-tight text-white">Multiplayer</h1>
        <p className="max-w-md text-sm leading-relaxed text-slate-400">
          Pick an artist, create a room, and race your friends in real time. Everyone hears the same
          growing snippet on a shared timer. Guess first to lock in the most points.
        </p>
      </motion.div>

      <ArtistSearchInput onSelect={setArtist} />

      {!artist && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass w-full rounded-2xl p-6 flex flex-col gap-4"
        >
          <div>
            <h2 className="text-lg font-bold text-white">Join with Room Code</h2>
            <p className="text-xs text-slate-400">
              Have a code from a friend? Enter it below to join their lobby.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (roomCode.trim()) {
                navigate(`/room/${roomCode.trim().toUpperCase()}`);
              }
            }}
            className="flex gap-2"
          >
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={12}
              placeholder="ROOM CODE"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center font-mono text-lg font-black tracking-widest text-chorus-accent2 outline-none focus:border-chorus-accent2 uppercase placeholder:font-sans placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-600"
            />
            <button
              type="submit"
              disabled={!roomCode.trim()}
              className="btn-primary !py-2.5 !px-6 !text-sm whitespace-nowrap"
            >
              Join Room
            </button>
          </form>
        </motion.div>
      )}

      {artist && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass w-full rounded-2xl p-6"
        >
          <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3.5">
            {artist.pictureUrl ? (
              <img
                src={artist.pictureUrl}
                alt={artist.name}
                className="h-12 w-12 rounded-full border border-white/20 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-lg">
                🎤
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-white">{artist.name}</h2>
              <p className="text-xs text-slate-400">10-song real-time race</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              How does everyone guess?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['search', '🔍 Type to search', 'Search the artist’s catalog'],
                  ['choice', '🎯 Multiple choice', 'Pick one of three'],
                ] as [MultiplayerGuessMode, string, string][]
              ).map(([mode, label, hint]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGuessMode(mode)}
                  aria-pressed={guessMode === mode}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                    guessMode === mode
                      ? 'border-chorus-accent/60 bg-chorus-accent/10 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                  }`}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-slate-400">
                    {hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void createRoom()}
            disabled={creating}
            className="btn-primary mt-4 w-full !rounded-xl"
          >
            {creating ? 'Creating room…' : 'Create room →'}
          </button>

          {error && <p className="mt-3 text-sm text-chorus-danger">{error}</p>}
        </motion.div>
      )}
    </div>
  );
}
