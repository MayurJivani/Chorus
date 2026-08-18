export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  /** Only decides whether the admin link is rendered — every admin route re-checks server-side. */
  isAdmin?: boolean;
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
  /** Set on a non-final wrong guess: the guess named a different song by the right artist. */
  sameArtist?: boolean;
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
  lastPlayedDate: string | null;
  /** Null until at least one puzzle has been finished with timing recorded. */
  averageSolveSeconds: number | null;
  fastestSolveSeconds: number | null;
  slowestSolveSeconds: number | null;
  totalPlaySeconds: number;
  averageGuessesPerWin: number | null;
  averageSnippetSeconds: number | null;
  /** How many wins the time averages are actually based on. */
  timedWins: number;
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

// --- Multiplayer Mode ----------------------------------------------------------------------

export type MultiplayerPhase = 'lobby' | 'playing' | 'round-reveal' | 'finished';

export interface MultiplayerPlayer {
  playerId: string;
  displayName: string;
  isHost: boolean;
  score: number;
  roundAnswered: boolean;
  roundCorrect: boolean | null;
  roundPoints: number;
  /** This player's own reveal stage for the current round (0 = only the first slice heard). */
  stageIndex: number;
  joinedAt: number;
}

export interface MultiplayerScoreEntry {
  playerId: string;
  displayName: string;
  score: number;
  answered: boolean;
  correctThisRound: boolean | null;
  /** This player's reveal stage for the current round (0 = heard only the first slice). */
  stageIndex: number;
}

export type MultiplayerGuessMode = 'search' | 'choice';

export interface MultiplayerRoomSnapshot {
  code: string;
  artistId: number;
  artistName: string;
  artistPictureUrl: string | null;
  guessMode: MultiplayerGuessMode;
  phase: MultiplayerPhase;
  hostId: string;
  currentRound: number;
  totalRounds: number;
  players: MultiplayerPlayer[];
}

export interface MultiplayerCreateRoomResponse {
  code: string;
  artistId: number;
  artistName: string;
  artistPictureUrl: string | null;
  guessMode: MultiplayerGuessMode;
}

export interface GlobalLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  runs: number;
  songsCorrect: number;
  songsPossible: number;
  accuracy: number;
  bestRun: number;
  averageTimeSeconds: number | null;
  fastestRunSeconds: number | null;
  isYou: boolean;
}

export interface MostPlayedArtist {
  deezerArtistId: string;
  artistName: string;
  runs: number;
  players: number;
  averageScore: number;
}

export interface LeaderboardResponse {
  players: GlobalLeaderboardEntry[];
  mostPlayedArtists: MostPlayedArtist[];
  /** Category runs are ranked separately — a different game, so a different board. */
  categoryPlayers: GlobalLeaderboardEntry[];
  mostPlayedCategories: MostPlayedArtist[];
  /** False for guests, who cannot appear on the board until they have an account. */
  isRegistered: boolean;
}

// --- Category Mode -------------------------------------------------------------------------

export type CategoryGroup = 'now' | 'year' | 'genre';

export interface Category {
  id: string;
  label: string;
  group: CategoryGroup;
  blurb: string;
}

// --- Admin ---------------------------------------------------------------------------------

export interface AdminSong {
  id: number;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  active: boolean;
  manualOverride: boolean;
}

export interface AdminDailyPuzzle {
  /** The puzzle row's id; the song it points at is `songId`. */
  id: number;
  puzzleDate: string;
  songId: number;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  active: boolean;
  manualOverride: boolean;
  /** Completed plays. Non-zero means the row is history and the server will refuse edits. */
  plays: number;
}

export interface AdminDailyPuzzleList {
  today: string;
  puzzles: AdminDailyPuzzle[];
}

export interface AdminOverview {
  songs: { total: number; active: number; curated: number };
  scheduledFromToday: number;
  today: string;
}
