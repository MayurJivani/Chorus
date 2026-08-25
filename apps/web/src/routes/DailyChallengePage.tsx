import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChallengeRunner } from '../features/challenge/ChallengeRunner';
import { ChallengeSummary } from '../features/challenge/ChallengeSummary';
import { useChallengeGameState } from '../features/challenge/useChallengeGameState';
import {
  getDailyChallenge,
  getDailyLeaderboard,
  searchDailyTracks,
  submitDailyGuess,
} from '../api/daily';
import type { GuessDistributionBucket } from '../types/api';

const EMPTY_LEADERBOARD = async () => ({ entries: [], mine: null });
const EMPTY_DISTRIBUTION = async () => [] as GuessDistributionBucket[];

export function DailyChallengePage() {
  const [searchParams] = useSearchParams();
  const guessMode = searchParams.get('guessMode') === 'choice' ? 'choice' : 'search';

  const endpoints = useMemo(
    () => ({
      key: 'daily',
      load: (_playAgain: boolean | undefined, mode: 'search' | 'choice') => getDailyChallenge(mode),
      guess: (input: {
        deezerTrackId?: string;
        guessNumber: number;
        guessMode?: 'search' | 'choice';
      }) => submitDailyGuess(input),
      loadErrorMessage: "Couldn't load today's daily challenge. Please try again.",
    }),
    [],
  );

  const game = useChallengeGameState(endpoints, guessMode);
  const { challenge, finalScore } = game;
  const challengeId = challenge?.challengeId;

  const searchFn = useCallback((query: string) => searchDailyTracks(query), []);

  const loadChallengeLeaderboard = useMemo(
    () => (challengeId != null ? () => getDailyLeaderboard() : null),
    [challengeId],
  );

  return (
    <ChallengeRunner
      game={game}
      guessMode={guessMode}
      searchFn={searchFn}
      slowLoadHint="Building today's challenge from a mix of eras and genres..."
      fallback={{ to: '/', label: 'Back to home' }}
      summary={
        challenge ? (
          <ChallengeSummary
            subjectName="Daily Challenge"
            songsCorrect={finalScore?.songsCorrect ?? challenge.songsCorrect}
            totalGuessesUsed={finalScore?.totalGuessesUsed ?? challenge.totalGuessesUsed}
            totalRounds={finalScore?.totalRounds ?? challenge.totalRounds}
            timeTakenSeconds={finalScore?.timeTakenSeconds}
            runHistory={game.runHistory}
            revealedSongs={game.revealedSongs}
            shareUrl={`${window.location.origin}/daily?guessMode=${guessMode}`}
            loadLeaderboard={EMPTY_LEADERBOARD}
            loadChallengeLeaderboard={loadChallengeLeaderboard}
            loadDistribution={EMPTY_DISTRIBUTION}
            onPlayAgain={() => {}}
            browse={{ to: '/', label: 'Back to Home' }}
          />
        ) : null
      }
    />
  );
}
