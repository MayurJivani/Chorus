import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useArtistGameState } from '../features/artist/useArtistGameState';
import { ChallengeRunner } from '../features/challenge/ChallengeRunner';
import { getChallengeSummary } from '../api/challenges';
import { ChallengeSummary } from '../features/challenge/ChallengeSummary';
import {
  searchArtistTracks,
  getArtistLeaderboard,
  getChallengeLeaderboard,
  getArtistGuessDistribution,
} from '../api/artists';
import { usePageTitle } from '../hooks/usePageTitle';

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

export function ArtistPlayPage() {
  usePageTitle('Artist Challenge');
  const { artistId: artistIdParam } = useParams<{ artistId: string }>();
  const artistId = Number(artistIdParam);
  const [searchParams] = useSearchParams();
  const guessMode = searchParams.get('guessMode') === 'choice' ? 'choice' : 'search';
  const includeFeatures = searchParams.get('includeFeatures') === 'true';
  const urlChallengeId = searchParams.get('challengeId')
    ? Number(searchParams.get('challengeId'))
    : undefined;

  const duel = useDuel(urlChallengeId);
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
      duel={duel}
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
            revealedSongs={game.revealedSongs}
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
