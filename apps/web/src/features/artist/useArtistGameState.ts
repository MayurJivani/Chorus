import { useMemo } from 'react';
import { getArtistChallenge, submitArtistGuess } from '../../api/artists';
import {
  useChallengeGameState,
  type ChallengeGameState,
  type ChallengeGameStatus,
} from '../challenge/useChallengeGameState';

export type ArtistGameStatus = ChallengeGameStatus;

/** Artist Mode's binding of the shared challenge state machine. */
export function useArtistGameState(
  artistId: number,
  includeFeatures: boolean,
  guessMode: 'search' | 'choice',
  sharedChallengeId?: number,
): ChallengeGameState {
  const endpoints = useMemo(
    () => ({
      key: `artist:${artistId}:${includeFeatures}`,
      load: (playAgain: boolean | undefined, mode: 'search' | 'choice', cid: number | undefined) =>
        getArtistChallenge(artistId, includeFeatures, playAgain, mode, cid),
      guess: (input: {
        deezerTrackId?: string;
        guessNumber: number;
        guessMode?: 'search' | 'choice';
      }) => submitArtistGuess(artistId, input, includeFeatures),
      loadErrorMessage: "Couldn't load this artist's challenge. Please try again.",
    }),
    [artistId, includeFeatures],
  );

  return useChallengeGameState(endpoints, guessMode, sharedChallengeId);
}
