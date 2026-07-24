import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArtistSearchInput } from '../features/artist/ArtistSearchInput';
import { ArtistLeaderboard } from '../features/artist/ArtistLeaderboard';
import type { ArtistSearchResult } from '../types/api';

type GuessMode = 'search' | 'choice';

export function ArtistSearchPage() {
  const navigate = useNavigate();
  const [artist, setArtist] = useState<ArtistSearchResult | null>(null);
  const [guessMode, setGuessMode] = useState<GuessMode>('search');
  const [includeFeatures, setIncludeFeatures] = useState(false);
  const [showMultiplayerTeaser, setShowMultiplayerTeaser] = useState(false);

  const startGame = () => {
    if (!artist) return;
    navigate(`/artist/${artist.id}/play?guessMode=${guessMode}&includeFeatures=${includeFeatures}`);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-xl flex-col items-center gap-8 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 text-center"
      >
        <h1 className="text-4xl font-extrabold text-white tracking-tight">Search an Artist</h1>
        <p className="max-w-md text-slate-400 text-sm">
          Pick any artist and guess your way through 10 songs from their discography.
        </p>
      </motion.div>

      <ArtistSearchInput
        onSelect={(a) => {
          setArtist(a);
          setShowMultiplayerTeaser(false);
        }}
      />

      {artist && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass w-full rounded-2xl p-6 flex flex-col gap-5 border border-white/10"
        >
          {/* Selected artist header card */}
          <div className="flex items-center gap-4 bg-white/5 p-3.5 rounded-xl border border-white/10">
            {artist.pictureUrl ? (
              <img
                src={artist.pictureUrl}
                alt={artist.name}
                className="h-12 w-12 rounded-full object-cover border border-white/20"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center text-lg">
                🎤
              </div>
            )}
            <div>
              <p className="text-xs text-slate-400 font-medium">Selected Artist</p>
              <h2 className="text-lg font-bold text-white">{artist.name}</h2>
            </div>
          </div>

          {/* Guess mode pill tabs */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-300">How do you want to guess?</p>
            <div className="flex rounded-xl bg-chorus-bg/80 p-1.5 gap-1.5 border border-white/5">
              <ModeButton active={guessMode === 'search'} onClick={() => setGuessMode('search')}>
                🔍 Type to search
              </ModeButton>
              <ModeButton active={guessMode === 'choice'} onClick={() => setGuessMode('choice')}>
                🎯 Multiple choice
              </ModeButton>
            </div>
          </div>

          {/* Include features toggle */}
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm text-slate-300">
              Include featured tracks
              <span className="ml-1 text-xs text-slate-500">
                (collabs where this artist is a guest)
              </span>
            </span>
            <div className="relative flex-shrink-0">
              <input
                type="checkbox"
                checked={includeFeatures}
                onChange={(e) => setIncludeFeatures(e.target.checked)}
                className="sr-only peer"
              />
              <div className="h-6 w-11 rounded-full bg-chorus-surface-2 peer-checked:bg-white transition-colors duration-200 cursor-pointer border border-white/10" />
              <div className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-black shadow transition-transform duration-200 peer-checked:translate-x-5" />
            </div>
          </label>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button type="button" onClick={startGame} className="btn-primary flex-1">
              Start Solo Game
            </button>
            <button
              type="button"
              onClick={() => setShowMultiplayerTeaser(true)}
              className="btn-secondary flex-1"
            >
              Leaderboard
            </button>
          </div>

          {showMultiplayerTeaser && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex flex-col items-center gap-4 rounded-xl border border-white/10 bg-chorus-bg/60 p-4"
            >
              <ArtistLeaderboard artistId={artist.id} artistName={artist.name} />
              <button type="button" onClick={startGame} className="btn-primary w-full">
                Start challenge
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ' +
        (active ? 'bg-white text-black font-semibold shadow-sm' : 'text-slate-400 hover:text-white')
      }
    >
      {children}
    </button>
  );
}
