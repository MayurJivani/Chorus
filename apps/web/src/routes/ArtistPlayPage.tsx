import { useCallback, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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

  if (status === 'loading') {
    return <Centered>Loading challenge…</Centered>;
  }

  if (status === 'error' || !challenge) {
    return <Centered>{errorMessage ?? 'Something went wrong.'}</Centered>;
  }

  if (status === 'completed') {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-xl flex-col items-center justify-center gap-8 px-4 py-12">
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
  const stageSeconds =
    SNIPPET_SCHEDULE_SECONDS[Math.min(attemptNumber, SNIPPET_SCHEDULE_SECONDS.length) - 1] ?? 1;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
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
            <div className="flex items-center gap-4 bg-white/5 px-4 py-3 rounded-2xl border border-white/10 w-full max-w-md">
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
              Next song →
            </button>
          </motion.div>
        ) : (
          <>
            <SnippetProgressBar attemptNumber={attemptNumber} />

            {previewUrl && (
              <SnippetPlayer
                previewUrl={previewUrl}
                stageSeconds={stageSeconds}
                disabled={submitting}
                artistPictureUrl={challenge.artistPictureUrl}
              />
            )}

            <AttemptPips history={roundHistory} />

            {guessMode === 'choice' && 'options' in challenge ? (
              <MultipleChoiceGuess
                options={challenge.options}
                onGuess={guess}
                onSkip={skip}
                disabled={submitting}
                revealedSong={revealedSong}
                roundEnded={false}
              />
            ) : (
              <GuessInput
                onGuess={guess}
                onSkip={skip}
                disabled={submitting}
                searchFn={searchThisArtist}
              />
            )}

            {errorMessage && <p className="text-sm text-chorus-danger">{errorMessage}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center text-slate-400">
      {children}
    </div>
  );
}
