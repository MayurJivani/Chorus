export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}

export interface MeResponse {
  user: PublicUser | null;
  guestId?: string;
}

export interface AuthResponse {
  user: PublicUser;
  csrfToken: string;
}

export const SNIPPET_SCHEDULE_SECONDS = [1, 2, 4, 7, 11, 16] as const;
export const MAX_GUESSES = SNIPPET_SCHEDULE_SECONDS.length;

export interface RevealedSong {
  title: string;
  artist: string;
  albumArtUrl: string | null;
}

export interface PuzzleInProgress {
  puzzleId: number;
  puzzleDate: string;
  completed: false;
  previewUrl: string;
  snippetSchedule: readonly number[];
  maxGuesses: number;
}

export interface PuzzleCompleted {
  puzzleId: number;
  puzzleDate: string;
  completed: true;
  won: boolean;
  guessesUsed: number;
  song: RevealedSong;
  snippetSchedule: readonly number[];
}

export type PuzzleResponse = PuzzleInProgress | PuzzleCompleted;

export interface GuessResult {
  correct: boolean;
  isFinal: boolean;
  song?: RevealedSong;
}

export interface SongSearchResult {
  // Daily puzzle results carry a numeric `songs.id`; Artist Mode results carry a Deezer
  // track id (string) so search/multiple-choice aren't limited to the current 10-song
  // challenge — either way it's just an opaque identifier echoed back on guess submission.
  id: string | number;
  title: string;
  artist: string;
  albumArtUrl: string | null;
}

export interface StatsResponse {
  currentStreak: number;
  maxStreak: number;
  gamesPlayed: number;
  gamesWon: number;
  guessDistribution: number[];
}

// --- Artist Mode ---------------------------------------------------------------------------

export const ARTIST_CHALLENGE_SIZE = 10;

export interface ArtistSearchResult {
  id: number;
  name: string;
  pictureUrl: string | null;
}

export interface ArtistRoundOption {
  deezerTrackId: string;
  title: string;
  artist: string;
}

interface ArtistChallengeBase {
  challengeId: number;
  artistName: string;
  artistPictureUrl: string | null;
  totalRounds: number;
  currentRound: number;
  songsCorrect: number;
  totalGuessesUsed: number;
}

export interface ArtistChallengeInProgress extends ArtistChallengeBase {
  completed: false;
  previewUrl: string;
  snippetSchedule: readonly number[];
  maxGuesses: number;
  options: ArtistRoundOption[];
}

export interface ArtistChallengeCompleted extends ArtistChallengeBase {
  completed: true;
}

export type ArtistChallengeResponse = ArtistChallengeInProgress | ArtistChallengeCompleted;

export interface ArtistGuessResult {
  correct: boolean;
  isFinal: boolean;
  song?: RevealedSong;
  songsCorrect?: number;
  currentRound?: number;
  sessionComplete?: boolean;
  timeTakenSeconds?: number | null;
  finalScore?: {
    songsCorrect: number;
    totalGuessesUsed: number;
    timeTakenSeconds: number | null;
    totalRounds: number;
  };
}

export interface ArtistLeaderboardEntry {
  rank: number;
  displayName: string;
  songsCorrect: number;
  totalGuessesUsed: number;
  timeTakenSeconds: number | null;
  isYou: boolean;
}

export interface ArtistLeaderboardResponse {
  entries: ArtistLeaderboardEntry[];
  myBest: {
    songsCorrect: number;
    totalGuessesUsed: number;
    timeTakenSeconds: number | null;
  } | null;
}

export interface ChallengeLeaderboardResponse {
  entries: ArtistLeaderboardEntry[];
}

export interface GuessDistributionBucket {
  snippetSeconds: number;
  label: string;
  allPlayers: number;
  myGuesses: number;
}

export type GuessDistributionResponse = GuessDistributionBucket[];
