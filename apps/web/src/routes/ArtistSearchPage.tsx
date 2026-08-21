import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArtistSearchInput } from '../features/artist/ArtistSearchInput';
import type { ArtistSearchResult } from '../types/api';

export function ArtistSearchPage() {
  const navigate = useNavigate();
  const [artist, setArtist] = useState<ArtistSearchResult | null>(null);

  const startGame = (mode: 'search' | 'choice') => {
    if (!artist) return;
    navigate(`/artist/${artist.id}/play?guessMode=${mode}&includeFeatures=false`);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center gap-4 sm:gap-6 px-4 py-4 sm:py-8">
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

      <ArtistSearchInput onSelect={(a) => setArtist(a)} />

      {artist && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass w-full rounded-2xl p-6 flex flex-col gap-4 border border-white/10"
        >
          {/* Artist card */}
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
            <h2 className="text-lg font-bold text-white">{artist.name}</h2>
          </div>

          {/* Mode selection — clicking starts the game immediately */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-300">How do you want to guess?</p>
            <div className="flex rounded-xl bg-chorusify-bg/80 p-1.5 gap-1.5 border border-white/5">
              <ModeButton onClick={() => startGame('search')}>Type to search</ModeButton>
              <ModeButton onClick={() => startGame('choice')}>Multiple choice</ModeButton>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ModeButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-[0.97]"
    >
      {children}
    </button>
  );
}
