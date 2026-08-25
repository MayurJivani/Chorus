import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArtistSearchInput } from '../features/artist/ArtistSearchInput';
import { createMultiplayerRoom } from '../api/multiplayer';
import { getCategories } from '../api/categories';
import type {
  ArtistSearchResult,
  Category,
  MultiplayerGameMode,
  MultiplayerGuessMode,
} from '../types/api';
import { usePageTitle } from '../hooks/usePageTitle';

/** What a room races over. Rooms accept either; the game is identical. */
type SourceKind = 'artist' | 'category';

export function MultiplayerHomePage() {
  usePageTitle('Multiplayer');
  const navigate = useNavigate();
  const [sourceKind, setSourceKind] = useState<SourceKind>('artist');
  const [artist, setArtist] = useState<ArtistSearchResult | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [gameMode, setGameMode] = useState<MultiplayerGameMode>('speed');
  const [guessMode, setGuessMode] = useState<MultiplayerGuessMode>('search');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');

  // Fetched lazily: someone racing over an artist never needs the category list.
  useEffect(() => {
    if (sourceKind !== 'category' || categories.length > 0) return;
    getCategories()
      .then(setCategories)
      .catch(() => setError('Could not load categories.'));
  }, [sourceKind, categories.length]);

  const selection = sourceKind === 'artist' ? artist : category;

  const createRoom = useCallback(async () => {
    if (!selection || creating) return;
    setCreating(true);
    setError(null);
    try {
      const source =
        sourceKind === 'artist'
          ? { artistId: (selection as ArtistSearchResult).id }
          : { categoryId: (selection as Category).id };
      const { code } = await createMultiplayerRoom(source, guessMode, gameMode);
      navigate(`/room/${code}`, { state: { autoJoin: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a room. Please try again.');
      setCreating(false);
    }
  }, [selection, sourceKind, creating, guessMode, gameMode, navigate]);

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center gap-4 sm:gap-6 px-4 py-4 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 text-center"
      >
        <h1 className="text-4xl font-extrabold tracking-tight text-white">Multiplayer</h1>
        <p className="max-w-md text-sm leading-relaxed text-slate-400">
          Pick an artist or a category, create a room, and race your friends in real time. Everyone
          hears the same growing snippet on a shared timer.
        </p>
      </motion.div>

      <div
        role="tablist"
        aria-label="What to race over"
        className="flex w-full gap-1.5 rounded-xl border border-white/5 bg-chorusify-bg/80 p-1.5"
      >
        {(
          [
            ['artist', 'An artist'],
            ['category', 'A category'],
          ] as [SourceKind, string][]
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={sourceKind === kind}
            onClick={() => {
              setSourceKind(kind);
              setArtist(null);
              setCategory(null);
            }}
            className={
              'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ' +
              (sourceKind === kind
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {sourceKind === 'artist' ? (
        <ArtistSearchInput onSelect={setArtist} />
      ) : (
        <div className="glass grid max-h-64 w-full grid-cols-2 gap-2 overflow-y-auto rounded-2xl p-3 sm:grid-cols-3">
          {categories.length === 0 && (
            <p className="col-span-full py-4 text-center text-sm text-slate-400">
              Loading categories…
            </p>
          )}
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category?.id === c.id}
              className={
                'rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all ' +
                (category?.id === c.id
                  ? 'border-chorusify-accent/60 bg-chorusify-accent/15 text-white'
                  : 'border-white/5 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]')
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {!selection && (
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
            className="flex w-full gap-2"
          >
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={12}
              placeholder="ROOM CODE"
              /* min-w-0 is the fix: a flex item defaults to min-width:auto, so this input refused
                 to shrink below the width of its own "ROOM CODE" placeholder and shoved the button
                 off the screen on a narrow phone. */
              className="w-full min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center font-mono text-base font-black tracking-widest text-chorusify-accent2 outline-none focus:border-chorusify-accent2 uppercase placeholder:font-sans placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-600"
            />
            <button
              type="submit"
              disabled={!roomCode.trim()}
              className="btn-primary shrink-0 !px-5 !py-2.5 !text-sm whitespace-nowrap"
            >
              Join Room
            </button>
          </form>
        </motion.div>
      )}

      {selection && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass w-full rounded-2xl p-6"
        >
          <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3.5">
            {artist?.pictureUrl ? (
              <img
                src={artist.pictureUrl}
                alt={artist.name}
                className="h-12 w-12 shrink-0 rounded-full border border-white/20 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
                ♪
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-white">
                {sourceKind === 'artist' ? artist?.name : category?.label}
              </h2>
              <p className="text-xs text-slate-400">10-song real-time race</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Game mode
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['classic', 'Classic', 'Progressive reveal, points by stage'],
                  ['speed', 'Speed Round', 'Full snippet, fastest correct = most points'],
                ] as [MultiplayerGameMode, string, string][]
              ).map(([mode, label, hint]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGameMode(mode)}
                  aria-pressed={gameMode === mode}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                    gameMode === mode
                      ? 'border-chorusify-accent/60 bg-chorusify-accent/10 text-white'
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

          {gameMode === 'classic' && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                How does everyone guess?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['search', 'Type to search', 'Search the full catalog'],
                    ['choice', 'Multiple choice', 'Pick one of three'],
                  ] as [MultiplayerGuessMode, string, string][]
                ).map(([mode, label, hint]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setGuessMode(mode)}
                    aria-pressed={guessMode === mode}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                      guessMode === mode
                        ? 'border-chorusify-accent/60 bg-chorusify-accent/10 text-white'
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
          )}

          <button
            type="button"
            onClick={() => void createRoom()}
            disabled={creating}
            className="btn-primary mt-4 w-full !rounded-xl"
          >
            {creating ? 'Creating room…' : 'Create room →'}
          </button>

          {error && <p className="mt-3 text-sm text-chorusify-danger">{error}</p>}
        </motion.div>
      )}
    </div>
  );
}
