import { useState, useEffect } from 'react';
import type { ArtistRoundOption, RevealedSong, SongSearchResult } from '../../types/api';

interface MultipleChoiceGuessProps {
  options: ArtistRoundOption[];
  onGuess: (song: SongSearchResult) => void;
  onSkip: () => void;
  disabled?: boolean;
  revealedSong?: RevealedSong | null;
  roundEnded?: boolean;
  selectedGuessId?: string | null;
  /** When provided, a separate "Reveal more" button is shown alongside Skip. */
  onRevealMore?: () => void;
  /** Whether there is more snippet left to reveal. Hides the reveal button when false. */
  canRevealMore?: boolean;
}

export function MultipleChoiceGuess({
  options,
  onGuess,
  onSkip,
  disabled,
  revealedSong,
  roundEnded,
  selectedGuessId,
  onRevealMore,
  canRevealMore = true,
}: MultipleChoiceGuessProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [options]);

  const handleSelect = (option: ArtistRoundOption) => {
    if (disabled || roundEnded) return;
    setSelectedId(option.deezerTrackId);
    onGuess({
      id: option.deezerTrackId,
      title: option.title,
      artist: option.artist,
      albumArtUrl: null,
    });
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      {options.map((option) => {
        const isSelected = roundEnded
          ? selectedGuessId === option.deezerTrackId
          : selectedId === option.deezerTrackId;
        const isCorrect =
          roundEnded &&
          revealedSong &&
          option.title.toLowerCase() === revealedSong.title.toLowerCase();
        const isWrong = roundEnded && isSelected && !isCorrect;

        let styleClass =
          'border-white/10 bg-chorusify-surface/80 text-slate-100 hover:border-white/30 hover:bg-white/5';
        let badge = null;

        if (roundEnded) {
          if (isCorrect) {
            styleClass =
              'border-emerald-500 bg-emerald-950/80 text-emerald-200 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-950/50';
            badge = (
              <span className="text-emerald-400 font-bold text-xs px-2 py-0.5 rounded-md bg-emerald-900/60 border border-emerald-500/30">
                ✓ Correct
              </span>
            );
          } else if (isWrong) {
            styleClass =
              'border-red-500 bg-red-950/80 text-red-200 ring-2 ring-red-500/50 shadow-lg shadow-red-950/50';
            badge = (
              <span className="text-red-400 font-bold text-xs px-2 py-0.5 rounded-md bg-red-900/60 border border-red-500/30">
                ✕ Wrong
              </span>
            );
          } else {
            styleClass = 'border-white/5 bg-white/5 text-slate-500 opacity-40';
          }
        } else if (isSelected) {
          styleClass = 'border-white/40 bg-white/10 text-white';
        }

        return (
          <button
            key={option.deezerTrackId}
            type="button"
            disabled={disabled || roundEnded}
            onClick={() => handleSelect(option)}
            className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3.5 text-left backdrop-blur-sm transition-all duration-200 ${styleClass} disabled:cursor-not-allowed`}
          >
            {/* min-w-0 is what lets the truncation actually happen: without it this flex child
                refuses to shrink below its content, and a long title ("Bang My Head (feat. Sia
                & Fetty Wap)") pushes the result badge off a phone screen entirely. */}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base font-semibold">{option.title}</span>
              <span className="truncate text-xs opacity-75">{option.artist}</span>
            </div>
            {badge && <span className="shrink-0">{badge}</span>}
          </button>
        );
      })}

      {!roundEnded &&
        (onRevealMore ? (
          <div className="mt-1 flex gap-2 w-full">
            <button
              type="button"
              onClick={onSkip}
              disabled={disabled}
              className="btn-ghost flex-1 !rounded-xl !py-2.5 !text-sm"
            >
              Skip
            </button>
            {canRevealMore && (
              <button
                type="button"
                onClick={onRevealMore}
                disabled={disabled}
                className="btn-ghost flex-1 !rounded-xl !py-2.5 !text-sm"
              >
                Reveal more
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            disabled={disabled}
            className="btn-ghost mt-1 w-full !rounded-xl !py-2.5 !text-sm"
          >
            Skip
          </button>
        ))}
    </div>
  );
}
