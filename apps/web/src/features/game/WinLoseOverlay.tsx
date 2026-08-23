import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { RevealedSong } from '../../types/api';
import type { GuessAttempt } from './useGameState';
import { SongPreviewButton } from './SongPreviewButton';
import { buildShareText } from '../stats/shareText';
import { useGameConfig } from '../../hooks/useGameConfig';

interface WinLoseOverlayProps {
  won: boolean;
  song: RevealedSong;
  history: GuessAttempt[];
  puzzleDate: string;
  previewUrl?: string | null;
}

export function WinLoseOverlay({
  won,
  song,
  history,
  puzzleDate,
  previewUrl,
}: WinLoseOverlayProps) {
  const { maxGuesses } = useGameConfig();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (won) {
      void confetti({
        particleCount: 140,
        spread: 90,
        origin: { y: 0.6 },
        colors: ['#7c5cff', '#22d3ee', '#22c55e'],
      });
    }
  }, [won]);

  const handleShare = async () => {
    const text = buildShareText(history, won, puzzleDate, maxGuesses);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="glass flex w-full max-w-md flex-col items-center gap-5 rounded-2xl p-6 text-center"
    >
      <h2 className={`text-2xl font-extrabold ${won ? 'gradient-text' : 'text-chorusify-danger'}`}>
        {won ? '🎉 You got it!' : '😔 So close, next time!'}
      </h2>

      {/* Song card */}
      <div className="flex items-center gap-4">
        {song.albumArtUrl && (
          <img
            src={song.albumArtUrl}
            alt=""
            className={
              'h-20 w-20 flex-shrink-0 rounded-xl object-cover shadow-xl ' +
              (won
                ? 'shadow-chorusify-accent/30 ring-2 ring-chorusify-accent/40'
                : 'shadow-chorusify-danger/20')
            }
          />
        )}
        <div className="text-left">
          <p className="text-lg font-bold text-slate-100 leading-snug">{song.title}</p>
          <p className="text-sm text-slate-400">{song.artist}</p>
        </div>
      </div>

      {!won && previewUrl && <SongPreviewButton previewUrl={previewUrl} />}

      <button type="button" onClick={handleShare} className="btn-primary w-full !rounded-xl">
        {copied ? '✓ Copied!' : 'Share result'}
      </button>
    </motion.div>
  );
}
