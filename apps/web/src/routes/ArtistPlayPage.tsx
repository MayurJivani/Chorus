import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useArtistGameState } from '../features/artist/useArtistGameState';
import { SnippetPlayer } from '../features/game/SnippetPlayer';
import { SnippetProgressBar } from '../features/game/SnippetProgressBar';
import { AttemptPips } from '../features/game/AttemptPips';
import { GuessInput } from '../features/game/GuessInput';
import { MultipleChoiceGuess } from '../features/artist/MultipleChoiceGuess';
import { ArtistSessionSummary } from '../features/artist/ArtistSessionSummary';
import { searchArtistTracks } from '../api/artists';
import { SNIPPET_SCHEDULE_SECONDS } from '../types/api';

export function ArtistPlayPage() {
  const { artistId: artistIdParam } = useParams<{ artistId: string }>();
  const artistId = Number(artistIdParam);
  const [searchParams] = useSearchParams();
  const guessMode = searchParams.get('guessMode') === 'choice' ? 'choice' : 'search';
  const includeFeatures = searchParams.get('includeFeatures') === 'true';
  const urlChallengeId = searchParams.get('challengeId')
    ? Number(searchParams.get('challengeId'))
    : undefined;

  const {
    status,
    challenge,
    attemptNumber,
    roundHistory,
    revealedSong,
    finalScore,
    sessionComplete,
    errorMessage,
    submitting,
    guess,
    skip,
    nextRound,
    playAgain,
  } = useArtistGameState(artistId, includeFeatures, guessMode, urlChallengeId);

  const searchThisArtist = useCallback(
    (query: string) => searchArtistTracks(artistId, query, includeFeatures),
    [artistId, includeFeatures],
  );

  // Guess feedback flash for search mode
  const [guessFeedback, setGuessFeedback] = useState<'correct' | 'wrong' | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHistoryLen = useRef(roundHistory.length);

  useEffect(() => {
    if (roundHistory.length > prevHistoryLen.current) {
      const last = roundHistory[roundHistory.length - 1];
      if (last && !last.correct) {
        setGuessFeedback('wrong');
      } else if (last && last.correct) {
        setGuessFeedback('correct');
      }
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setGuessFeedback(null), 800);
    }
    prevHistoryLen.current = roundHistory.length;
  }, [roundHistory]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // Auto-play snippet after a skip in choice mode
  const [autoPlaySnippet, setAutoPlaySnippet] = useState(false);

  // Reset autoPlay after the snippet player has had a chance to pick it up
  useEffect(() => {
    if (autoPlaySnippet) {
      const t = setTimeout(() => setAutoPlaySnippet(false), 100);
      return () => clearTimeout(t);
    }
  }, [autoPlaySnippet]);

  // In choice mode, skip just increases playback time locally without spending a guess.
  // This tracks how many times the user has skipped within the current round.
  const [localSkipCount, setLocalSkipCount] = useState(0);

  const choiceSkip = useCallback(() => {
    setLocalSkipCount((n) => n + 1);
    setAutoPlaySnippet(true);
  }, []);

  // Reset localSkipCount when the round changes
  const prevRound = useRef(challenge?.currentRound);
  useEffect(() => {
    if (!challenge) return;
    if (challenge.currentRound !== prevRound.current) {
      setLocalSkipCount(0);
    }
    prevRound.current = challenge.currentRound;
  }, [challenge?.currentRound]);

  if (status === 'loading') {
    return <ChallengeLoading />;
  }

  if (status === 'error' || !challenge) {
    return <ChallengeError message={errorMessage ?? 'Something went wrong.'} />;
  }

  if (status === 'completed') {
    return (
      <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-8 px-4 py-12">
        <ArtistSessionSummary
          artistId={artistId}
          artistName={challenge.artistName}
          songsCorrect={finalScore?.songsCorrect ?? challenge.songsCorrect}
          totalGuessesUsed={finalScore?.totalGuessesUsed ?? challenge.totalGuessesUsed}
          totalRounds={finalScore?.totalRounds ?? challenge.totalRounds}
          timeTakenSeconds={finalScore?.timeTakenSeconds}
          challengeId={challenge.challengeId}
          guessMode={guessMode}
          onPlayAgain={() => void playAgain()}
        />
      </div>
    );
  }

  const previewUrl = !challenge.completed ? challenge.previewUrl : null;

  // In choice mode, skip locally increases duration via localSkipCount.
  // In search mode, duration advances via attemptNumber (server tracks guesses).
  const choiceStageIndex = guessMode === 'choice' ? localSkipCount : attemptNumber - 1;
  const stageSeconds =
    SNIPPET_SCHEDULE_SECONDS[Math.min(choiceStageIndex, SNIPPET_SCHEDULE_SECONDS.length - 1)] ?? 1;

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
      {/* Glass game card */}
      <div className="glass w-full rounded-2xl p-6 flex flex-col items-center gap-5">
        {/* Header */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-xl font-bold text-white">{challenge.artistName}</h1>
          <p className="text-xs text-slate-500 font-mono">
            Song {challenge.currentRound + 1} of {challenge.totalRounds} · {challenge.songsCorrect}{' '}
            correct
          </p>
        </div>

        {status === 'round-ended' && revealedSong ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full flex-col items-center gap-5 text-center"
          >
            {(() => {
              const lastCorrect = roundHistory[roundHistory.length - 1]?.correct ?? false;
              return (
                <p
                  className={`text-sm font-semibold ${
                    lastCorrect ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {lastCorrect ? '✓ Correct!' : '✗ Not this time — it was:'}
                </p>
              );
            })()}
            <div
              className={`flex items-center gap-4 px-4 py-3 rounded-2xl border w-full max-w-md ${
                roundHistory[roundHistory.length - 1]?.correct
                  ? 'bg-emerald-500/10 border-emerald-500/50'
                  : 'bg-red-500/10 border-red-500/50'
              }`}
            >
              {revealedSong.albumArtUrl ? (
                <img
                  src={revealedSong.albumArtUrl}
                  alt=""
                  className="h-14 w-14 rounded-xl object-cover shadow-lg ring-1 ring-white/10 flex-shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-white/10 flex items-center justify-center text-xl flex-shrink-0">
                  🎵
                </div>
              )}
              <div className="text-left overflow-hidden">
                <p className="font-bold text-white text-base truncate">{revealedSong.title}</p>
                <p className="text-xs text-slate-400 truncate">{revealedSong.artist}</p>
              </div>
            </div>

            {guessMode === 'choice' && 'options' in challenge && challenge.options ? (
              <MultipleChoiceGuess
                options={challenge.options}
                onGuess={guess}
                onSkip={skip}
                disabled={true}
                revealedSong={revealedSong}
                roundEnded={true}
                selectedGuessId={
                  roundHistory[roundHistory.length - 1]?.song?.id as string | undefined
                }
              />
            ) : null}

            <button
              type="button"
              onClick={() => void nextRound()}
              className="btn-primary w-full max-w-md"
            >
              {sessionComplete ? 'See results →' : 'Next song →'}
            </button>
          </motion.div>
        ) : (
          <>
            <SnippetProgressBar
              stageIndex={guessMode === 'choice' ? localSkipCount : attemptNumber - 1}
            />

            {previewUrl && (
              <SnippetPlayer
                previewUrl={previewUrl}
                stageSeconds={stageSeconds}
                disabled={submitting}
                artistPictureUrl={challenge.artistPictureUrl}
                autoPlay={autoPlaySnippet}
              />
            )}

            <AttemptPips history={roundHistory} />

            {guessMode === 'choice' && 'options' in challenge && challenge.options ? (
              <>
                <MultipleChoiceGuess
                  options={challenge.options}
                  onGuess={guess}
                  onSkip={choiceSkip}
                  disabled={submitting}
                  revealedSong={revealedSong}
                  roundEnded={false}
                />
              </>
            ) : (
              <GuessInput
                onGuess={guess}
                onSkip={skip}
                disabled={submitting}
                searchFn={searchThisArtist}
                guessFeedback={guessFeedback}
              />
            )}

            {errorMessage && <p className="text-sm text-chorus-danger">{errorMessage}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The first person to open an artist waits on a full Deezer catalog crawl, which can run to
 * several seconds for a large discography (later visitors hit the cached pool and load
 * instantly). A bare "Loading…" for that long reads as a hung page, so this shows a pulsing
 * skeleton of the game card and, once the wait stops feeling instant, explains *why*.
 */
function ChallengeLoading() {
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSlowHint(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
      <div
        className="glass w-full rounded-2xl p-6 flex flex-col items-center gap-5"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Loading challenge</span>

        <div className="flex flex-col items-center gap-2 w-full">
          <div className="h-5 w-40 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-3 w-28 rounded-lg bg-white/5 animate-pulse" />
        </div>

        <div className="flex gap-1.5 w-full justify-center" aria-hidden="true">
          {SNIPPET_SCHEDULE_SECONDS.map((seconds) => (
            <div key={seconds} className="h-1.5 flex-1 max-w-12 rounded-full bg-white/5" />
          ))}
        </div>

        <div className="h-28 w-28 rounded-2xl bg-white/10 animate-pulse" />

        <div className="w-full space-y-2">
          <div className="h-11 w-full rounded-xl bg-white/[0.07] animate-pulse" />
          <div className="h-11 w-full rounded-xl bg-white/[0.05] animate-pulse" />
          <div className="h-11 w-full rounded-xl bg-white/[0.03] animate-pulse" />
        </div>

        <p className="text-sm text-slate-400 text-center">
          {showSlowHint
            ? 'Digging through this artist’s discography — this only takes a moment the first time.'
            : 'Building your challenge…'}
        </p>
      </div>
    </div>
  );
}

function ChallengeError({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="glass w-full rounded-2xl p-8 flex flex-col items-center gap-5 text-center">
        <div className="text-3xl" aria-hidden="true">
          🎧
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-bold text-white">Couldn’t start this challenge</h1>
          <p className="text-sm text-slate-400">{message}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="btn-primary">
            Try again
          </button>
          <Link to="/artist" className="btn-secondary">
            Pick another artist
          </Link>
        </div>
      </div>
    </div>
  );
}
