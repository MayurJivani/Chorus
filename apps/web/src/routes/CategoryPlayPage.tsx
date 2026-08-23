import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChallengeRunner } from '../features/challenge/ChallengeRunner';
import { getChallengeSummary } from '../api/challenges';
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

/**
 * The sender's score on a shared challenge, so the run can show what it is chasing.
 *
 * Only fetched for a shared link: a self-started run has no opponent, and asking would be a
 * request per run for an answer that is always null.
 */
function useDuel(challengeId: number | undefined) {
  const [duel, setDuel] = useState<{
    displayName: string;
    songsCorrect: number;
    totalRounds: number;
  } | null>(null);

  useEffect(() => {
    if (challengeId == null) {
      setDuel(null);
      return;
    }
    let cancelled = false;
    getChallengeSummary(challengeId)
      .then((summary) => {
        if (cancelled || !summary.challenger) return;
        setDuel({
          displayName: summary.challenger.displayName,
          songsCorrect: summary.challenger.songsCorrect,
          totalRounds: summary.totalRounds,
        });
      })
      .catch(() => {
        // The banner is a nicety; a failed lookup just means the run plays without it.
      });
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  return duel;
}

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

  const duel = useDuel(urlChallengeId);
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
      duel={duel}
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
            revealedSongs={game.revealedSongs}
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
