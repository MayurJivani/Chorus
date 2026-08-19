import { useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useArtistGameState } from '../features/artist/useArtistGameState';
import { ChallengeRunner } from '../features/challenge/ChallengeRunner';
import { ChallengeSummary } from '../features/challenge/ChallengeSummary';
import {
  searchArtistTracks,
  getArtistLeaderboard,
  getChallengeLeaderboard,
  getArtistGuessDistribution,
} from '../api/artists';

export function ArtistPlayPage() {
  const { artistId: artistIdParam } = useParams<{ artistId: string }>();
  const artistId = Number(artistIdParam);
  const [searchParams] = useSearchParams();
  const guessMode = searchParams.get('guessMode') === 'choice' ? 'choice' : 'search';
  const includeFeatures = searchParams.get('includeFeatures') === 'true';
  const urlChallengeId = searchParams.get('challengeId')
    ? Number(searchParams.get('challengeId'))
    : undefined;

  const game = useArtistGameState(artistId, includeFeatures, guessMode, urlChallengeId);
  const { challenge, finalScore } = game;
  const challengeId = challenge?.challengeId;

  const searchThisArtist = useCallback(
    (query: string) => searchArtistTracks(artistId, query, includeFeatures),
    [artistId, includeFeatures],
  );

  const loadLeaderboard = useCallback(() => getArtistLeaderboard(artistId), [artistId]);
  const loadDistribution = useCallback(() => getArtistGuessDistribution(artistId), [artistId]);
  const loadChallengeLeaderboard = useMemo(
    () => (challengeId != null ? () => getChallengeLeaderboard(artistId, challengeId) : null),
    [artistId, challengeId],
  );

  return (
    <ChallengeRunner
      game={game}
      guessMode={guessMode}
      searchFn={searchThisArtist}
      slowLoadHint="Digging through this artist’s discography. This only takes a moment the first time."
      fallback={{ to: '/artist', label: 'Pick another artist' }}
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
                ? `${window.location.origin}/artist/${artistId}/play?challengeId=${challengeId}&guessMode=${guessMode}`
                : undefined
            }
            loadLeaderboard={loadLeaderboard}
            loadChallengeLeaderboard={loadChallengeLeaderboard}
            loadDistribution={loadDistribution}
            onPlayAgain={() => void game.playAgain()}
            browse={{ to: '/artist', label: 'Play Another Artist' }}
          />
        ) : null
      }
    />
  );
}
