import { useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChallengeRunner } from '../features/challenge/ChallengeRunner';
import { ChallengeSummary } from '../features/challenge/ChallengeSummary';
import { useChallengeGameState } from '../features/challenge/useChallengeGameState';
import {
  getCategoryChallenge,
  getCategoryChallengeLeaderboard,
  getCategoryGuessDistribution,
  getCategoryLeaderboard,
  searchCategoryTracks,
  submitCategoryGuess,
} from '../api/categories';

export function CategoryPlayPage() {
  const { categoryId = '' } = useParams<{ categoryId: string }>();
  const [searchParams] = useSearchParams();
  const guessMode = searchParams.get('guessMode') === 'choice' ? 'choice' : 'search';
  const urlChallengeId = searchParams.get('challengeId')
    ? Number(searchParams.get('challengeId'))
    : undefined;

  const endpoints = useMemo(
    () => ({
      key: `category:${categoryId}`,
      load: (playAgain: boolean | undefined, mode: 'search' | 'choice', cid: number | undefined) =>
        getCategoryChallenge(categoryId, playAgain, mode, cid),
      guess: (input: {
        deezerTrackId?: string;
        guessNumber: number;
        guessMode?: 'search' | 'choice';
      }) => submitCategoryGuess(categoryId, input),
      loadErrorMessage: "Couldn't load this category. Please try again.",
    }),
    [categoryId],
  );

  const game = useChallengeGameState(endpoints, guessMode, urlChallengeId);
  const { challenge, finalScore } = game;
  const challengeId = challenge?.challengeId;

  const searchThisCategory = useCallback(
    (query: string) => searchCategoryTracks(categoryId, query),
    [categoryId],
  );

  const loadLeaderboard = useCallback(() => getCategoryLeaderboard(categoryId), [categoryId]);
  const loadDistribution = useCallback(
    () => getCategoryGuessDistribution(categoryId),
    [categoryId],
  );
  const loadChallengeLeaderboard = useMemo(
    () =>
      challengeId != null ? () => getCategoryChallengeLeaderboard(categoryId, challengeId) : null,
    [categoryId, challengeId],
  );

  return (
    <ChallengeRunner
      game={game}
      guessMode={guessMode}
      searchFn={searchThisCategory}
      slowLoadHint="Pulling together this playlist. This only takes a moment the first time."
      fallback={{ to: '/categories', label: 'Pick another category' }}
      summary={
        challenge ? (
          <ChallengeSummary
            subjectName={challenge.artistName}
            songsCorrect={finalScore?.songsCorrect ?? challenge.songsCorrect}
            totalGuessesUsed={finalScore?.totalGuessesUsed ?? challenge.totalGuessesUsed}
            totalRounds={finalScore?.totalRounds ?? challenge.totalRounds}
            timeTakenSeconds={finalScore?.timeTakenSeconds}
            runHistory={game.runHistory}
            shareUrl={
              challengeId != null
                ? `${window.location.origin}/category/${encodeURIComponent(categoryId)}/play?challengeId=${challengeId}&guessMode=${guessMode}`
                : undefined
            }
            loadLeaderboard={loadLeaderboard}
            loadChallengeLeaderboard={loadChallengeLeaderboard}
            loadDistribution={loadDistribution}
            onPlayAgain={() => void game.playAgain()}
            browse={{ to: '/categories', label: 'Play Another Category' }}
          />
        ) : null
      }
    />
  );
}
