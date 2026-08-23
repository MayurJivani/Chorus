import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { SnippetPlayer } from '../features/game/SnippetPlayer';
import { SnippetProgressBar } from '../features/game/SnippetProgressBar';
import { GuessInput } from '../features/game/GuessInput';
import { MultipleChoiceGuess } from '../features/artist/MultipleChoiceGuess';
import { SurvivalLeaderboardPanel } from '../features/survival/SurvivalLeaderboardPanel';
import { useGameConfig } from '../hooks/useGameConfig';
import { useSession } from '../hooks/useSession';
import { renderResultCard, shareResultCard } from '../features/stats/resultCard';
import {
  getSurvivalRound,
  giveUpSurvivalRun,
  searchSurvivalTracks,
  submitSurvivalGuess,
} from '../api/survival';
import type { RevealedSong, SongSearchResult, SurvivalRound } from '../types/api';

type Status = 'loading' | 'playing' | 'over' | 'error';

/**
 * Survival: endless rounds, one miss ends the run.
 *
 * No picker in front of it and no per-round attempt ladder — you may extend the snippet as far
 * as you like for free, but the guess you commit to is the only one you get. That is the whole
 * rule, so the screen says it once and then stays out of the way.
 */
export function SurvivalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const guessMode = searchParams.get('guessMode') === 'choice' ? 'choice' : 'search';
  const { snippetSchedule } = useGameConfig();
  const { user } = useSession();

  const [status, setStatus] = useState<Status>('loading');
  const [round, setRound] = useState<SurvivalRound | null>(null);
  const [revealed, setRevealed] = useState<RevealedSong | null>(null);
  const [finalStreak, setFinalStreak] = useState(0);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rendering, setRendering] = useState(false);

  // How far the player has extended the snippet this round. Free, unlike the other modes where
  // each stage costs an attempt — in Survival the cost is that you only ever get one guess.
  const [revealCount, setRevealCount] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  const loadRound = useCallback(async () => {
    setStatus('loading');
    setRevealed(null);
    setRevealCount(0);
    try {
      setRound(await getSurvivalRound(guessMode));
      setStatus('playing');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not start a run.');
      setStatus('error');
    }
  }, [guessMode]);

  // A ref, not state: StrictMode runs this effect twice in development and without the guard
  // the second pass would draw a second song before the first was answered.
  const startedRef = useRef<string | null>(null);
  useEffect(() => {
    if (startedRef.current === guessMode) return;
    startedRef.current = guessMode;
    void loadRound();
  }, [guessMode, loadRound]);

  useEffect(() => {
    if (autoPlay) {
      const timer = setTimeout(() => setAutoPlay(false), 100);
      return () => clearTimeout(timer);
    }
  }, [autoPlay]);

  const submit = useCallback(
    async (song: SongSearchResult | null) => {
      if (status !== 'playing' || submitting) return;
      setSubmitting(true);
      setErrorMessage(null);

      try {
        const result = await submitSurvivalGuess(song?.id as string | undefined);
        setRevealed(result.song);

        if (result.runOver) {
          setFinalStreak(result.streak);
          setPersonalBest(result.personalBest ?? null);
          setStatus('over');
          if (result.streak > 0 && result.streak >= (result.personalBest ?? 0)) {
            void confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
          }
        } else {
          setRound((prev) => (prev ? { ...prev, streak: result.streak } : prev));
          // Straight into the next song: stopping to celebrate every hit would break the pace
          // that makes an endless mode feel endless.
          await loadRound();
        }
      } catch {
        setErrorMessage('Something went wrong submitting that. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [status, submitting, loadRound],
  );

  const startNewRun = useCallback(async () => {
    await giveUpSurvivalRun().catch(() => {});
    setFinalStreak(0);
    setPersonalBest(null);
    await loadRound();
  }, [loadRound]);

  const revealMore = useCallback(() => {
    setRevealCount((n) => n + 1);
    setAutoPlay(true);
  }, []);

  if (status === 'loading' && !round) {
    return <Centered>Starting your run…</Centered>;
  }

  if (status === 'error') {
    return (
      <Centered>
        <p className="text-slate-300">{errorMessage}</p>
        <button type="button" onClick={() => void loadRound()} className="btn-primary mt-4">
          Try again
        </button>
      </Centered>
    );
  }

  if (status === 'over') {
    const isRecord = finalStreak > 0 && finalStreak >= (personalBest ?? 0);
    return (
      <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-5 px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass flex w-full flex-col items-center gap-5 rounded-2xl border border-white/10 p-6 text-center"
        >
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-slate-500">Run over</p>
            <p className="mt-2 text-5xl font-black text-white">{finalStreak}</p>
            <p className="mt-1 text-sm text-slate-400">
              {finalStreak === 1 ? 'song' : 'songs'} in a row
            </p>
            {isRecord && finalStreak > 0 && (
              <p className="mt-2 text-sm font-semibold text-purple-400">New personal best</p>
            )}
            {!isRecord && personalBest != null && personalBest > 0 && (
              <p className="mt-2 text-xs text-slate-500">Your best is {personalBest}</p>
            )}
          </div>

          {revealed && (
            <div className="flex w-full max-w-md items-center gap-4 rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-3">
              {revealed.albumArtUrl ? (
                <img
                  src={revealed.albumArtUrl}
                  alt=""
                  className="h-14 w-14 flex-shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                />
              ) : (
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl">
                  🎵
                </div>
              )}
              <div className="overflow-hidden text-left">
                <p className="truncate text-xs text-slate-400">It was</p>
                <p className="truncate text-base font-bold text-white">{revealed.title}</p>
                <p className="truncate text-xs text-slate-400">{revealed.artist}</p>
              </div>
            </div>
          )}

          {!user && (
            <div className="w-full rounded-2xl border border-chorusify-accent/30 bg-chorusify-accent/10 p-4">
              <p className="text-sm font-semibold text-white">
                Want {finalStreak} on the leaderboard?
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Guest streaks aren&apos;t ranked. Create an account to keep them.
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Link to="/register" className="btn-primary flex-1 !py-2 text-sm">
                  Claim your spot
                </Link>
                <Link to="/login" className="btn-secondary flex-1 !py-2 text-sm">
                  Log in
                </Link>
              </div>
            </div>
          )}

          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              disabled={rendering}
              onClick={() => {
                setRendering(true);
                void renderResultCard({
                  subject: 'Survival',
                  headline: `${finalStreak}`,
                  caption: finalStreak === 1 ? 'song in a row' : 'songs in a row',
                })
                  .then((blob) =>
                    blob
                      ? shareResultCard(
                          blob,
                          `chorusify-survival-${finalStreak}.png`,
                          `${finalStreak} in a row on Chorusify Survival`,
                        )
                      : undefined,
                  )
                  .finally(() => setRendering(false));
              }}
              className="btn-primary w-full disabled:opacity-50"
            >
              {rendering ? 'Making image…' : 'Share result'}
            </button>
            <button type="button" onClick={() => void startNewRun()} className="btn-ghost w-full">
              Play again
            </button>
          </div>
        </motion.div>

        <SurvivalLeaderboardPanel />
      </div>
    );
  }

  if (!round) return <Centered>Starting your run…</Centered>;

  const stageIndex = Math.min(revealCount, snippetSchedule.length - 1);
  const stageSeconds = snippetSchedule[stageIndex] ?? 1;
  const canRevealMore = revealCount < snippetSchedule.length - 1;

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-3 px-4 py-3 sm:gap-5 sm:py-6">
      <div className="glass flex w-full flex-col items-center gap-4 rounded-2xl p-4 sm:gap-5 sm:p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-xl font-bold text-white">Survival</h1>
          <p className="font-mono text-xs text-slate-500">
            {round.streak === 0 ? 'One wrong answer ends the run' : `${round.streak} in a row`}
          </p>
        </div>

        {/* The streak, made the loudest thing on screen once it is worth protecting. */}
        {round.streak > 0 && (
          <motion.p
            key={round.streak}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-4xl font-black text-purple-400"
          >
            {round.streak}
          </motion.p>
        )}

        <SnippetProgressBar stageIndex={stageIndex} />

        <SnippetPlayer
          previewUrl={round.previewUrl}
          stageSeconds={stageSeconds}
          disabled={submitting}
          artistPictureUrl={null}
          autoPlay={autoPlay}
        />

        {guessMode === 'choice' && round.options ? (
          <MultipleChoiceGuess
            options={round.options}
            onGuess={(song) => void submit(song)}
            onSkip={() => void submit(null)}
            onRevealMore={revealMore}
            canRevealMore={canRevealMore}
            disabled={submitting}
            revealedSong={null}
            roundEnded={false}
          />
        ) : (
          <GuessInput
            onGuess={(song) => void submit(song)}
            onSkip={() => void submit(null)}
            onRevealMore={revealMore}
            canRevealMore={canRevealMore}
            disabled={submitting}
            searchFn={searchSurvivalTracks}
          />
        )}

        {errorMessage && <p className="text-sm text-chorusify-danger">{errorMessage}</p>}
      </div>

      <button
        type="button"
        onClick={() => setSearchParams({ guessMode: guessMode === 'choice' ? 'search' : 'choice' })}
        className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-300"
      >
        Switch to {guessMode === 'choice' ? 'type to search' : 'multiple choice'}
      </button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-4 py-10 text-center text-slate-400">
      {children}
    </div>
  );
}
