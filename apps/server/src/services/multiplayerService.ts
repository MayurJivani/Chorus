import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import type { Identity } from '../auth/identity';
import { getFreshPreviewUrl, type ArtistTrack } from './deezerService';
import { buildRoundOptions, type RoundOption } from './artistChallengeService';
import type { ChallengeSource, ChallengeSourceType } from './challengeSource';
import { seededShuffle } from '../utils/deterministic';
import { getSettings } from './settingsService';
import { logger } from '../logger';

/** Seconds of audio revealed at each reveal stage, Heardle-style. Players advance their own
 *  snippet one stage at a time with a "reveal more" action instead of a shared auto-timer. */
export const MP_REVEAL_SCHEDULE = [1, 2, 4, 7, 11, 16] as const;
/** Points for guessing at each reveal stage — fewer reveals means more points. */
export const MP_REVEAL_POINTS = [6, 5, 4, 3, 2, 1] as const;
/**
 * Defaults for the tunables below. Each room copies the live settings into itself when it is
 * created, so a change made mid-game never rewrites the rules a room is already playing by —
 * shortening a game from 10 rounds to 5 must not strand a room on round 8.
 */
export const MP_ROUND_DURATION_MS = 30 * 1000;
export const MP_ROUNDS = 10;
export const MP_REVEAL_DURATION_MS = 5000;
export const MP_MAX_PLAYERS = 8;
export const MP_EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** An opaque outbound channel — the real WebSocket wrapper lives in ws.ts, a fake in tests. */
export interface MpSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type MpRoomPhase = 'lobby' | 'playing' | 'round-reveal' | 'finished';

export interface MpPlayerState {
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

interface MpPlayer extends MpPlayerState {
  socket: MpSocket;
  identity: Identity;
}

/** How players answer: type-to-search over the artist's catalog, or pick one of three. */
export type MpGuessMode = 'search' | 'choice';

/** Classic: progressive reveal, points by stage. Speed: full snippet, first correct wins. */
export type MpGameMode = 'classic' | 'speed';

interface MpRoom {
  code: string;
  /**
   * What the room's songs come from.
   *
   * Was an artist id, which is why Multiplayer could only ever race over one artist. Holding a
   * `ChallengeSource` instead means a category room needs no new game logic — the rounds, the
   * scoring and the socket protocol are identical, only the pool differs.
   */
  source: ChallengeSource;
  guessMode: MpGuessMode;
  gameMode: MpGameMode;
  phase: MpRoomPhase;
  hostId: string;
  players: Map<string, MpPlayer>;
  tracks: ArtistTrack[];
  previewUrls: string[];
  /** Per-round multiple-choice options, empty in search mode. Built once when the game starts
   *  so every player is offered exactly the same three answers. */
  roundOptions: RoundOption[][];
  currentRound: number;
  roundStartedAt: number;
  timers: ReturnType<typeof setTimeout>[];
  createdAt: number;
  /** Settings snapshotted at creation — see the constants above for why. */
  rounds: number;
  roundDurationMs: number;
  revealDurationMs: number;
  maxPlayers: number;
  revealSchedule: readonly number[];
  speedRoundDurationMs: number;
  speedSnippetSeconds: number;
  speedPoints: readonly number[];
  /** Number of correct guesses so far this round in speed mode (for order-based scoring). */
  speedCorrectCount: number;
  hostOnlyAudio: boolean;
  hostPlayable: boolean;
}

export interface MpScoreEntry {
  playerId: string;
  displayName: string;
  score: number;
  answered: boolean;
  correctThisRound: boolean | null;
  /** This player's reveal stage for the current round (0 = heard only the first slice). */
  stageIndex: number;
}

export interface MpRoomSnapshot {
  code: string;
  sourceType: ChallengeSourceType;
  sourceId: string;
  /** The artist's name or the category's label, whichever the room races over. */
  label: string;
  pictureUrl: string | null;
  guessMode: MpGuessMode;
  gameMode: MpGameMode;
  phase: MpRoomPhase;
  hostId: string;
  currentRound: number;
  totalRounds: number;
  players: MpPlayerState[];
  hostOnlyAudio: boolean;
  hostPlayable: boolean;
}

const rooms = new Map<string, MpRoom>();
const sockets = new Map<string, MpSocket>();
const identities = new Map<string, Identity>();
const playerRooms = new Map<string, string>();

function generateRoomCode(): string {
  const bytes = randomBytes(6);
  let code = '';
  for (const b of bytes) {
    code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return code;
}

export async function createRoom(
  source: ChallengeSource,
  guessMode: MpGuessMode = 'search',
  gameMode: MpGameMode = 'classic',
  hostOnlyAudio: boolean = false,
  hostPlayable: boolean = true,
): Promise<{ code: string }> {
  let code = '';
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const settings = await getSettings();

  rooms.set(code, {
    code,
    source,
    guessMode: gameMode === 'speed' ? 'choice' : guessMode,
    gameMode,
    phase: 'lobby',
    hostId: '',
    players: new Map(),
    tracks: [],
    previewUrls: [],
    roundOptions: [],
    currentRound: 0,
    roundStartedAt: 0,
    timers: [],
    createdAt: Date.now(),
    rounds: settings.multiplayerRounds,
    roundDurationMs: settings.multiplayerRoundSeconds * 1000,
    revealDurationMs: settings.multiplayerRevealSeconds * 1000,
    maxPlayers: settings.multiplayerMaxPlayers,
    revealSchedule: settings.snippetScheduleSeconds,
    speedRoundDurationMs: settings.speedRoundDurationSeconds * 1000,
    speedSnippetSeconds: settings.speedSnippetSeconds,
    speedPoints: settings.speedPoints,
    speedCorrectCount: 0,
    hostOnlyAudio,
    hostPlayable,
  });

  logger.info(
    { code, sourceType: source.sourceType, sourceId: source.sourceId, guessMode },
    'Multiplayer room created',
  );
  return { code };
}

/** Registers a new WebSocket connection (no room membership yet — join_room binds it). */
export function registerConnection(input: {
  playerId: string;
  socket: MpSocket;
  identity: Identity;
}): void {
  sockets.set(input.playerId, input.socket);
  identities.set(input.playerId, input.identity);
}

export function unregisterConnection(playerId: string): void {
  leaveRoom(playerId);
  sockets.delete(playerId);
  identities.delete(playerId);
}

async function resolveDisplayName(identity: Identity, nickname?: string): Promise<string> {
  if (nickname) return nickname;
  if (identity.userId) {
    const rows = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1);
    const user = rows[0];
    if (user) return user.displayName;
  }
  if (identity.guestId) {
    return `Guest-${identity.guestId.slice(0, 4).toUpperCase()}`;
  }
  return 'Guest';
}

export async function handleClientMessage(playerId: string, message: unknown): Promise<void> {
  if (typeof message !== 'object' || message === null) return;
  const { type, ...payload } = message as Record<string, unknown>;

  switch (type) {
    case 'join_room': {
      const code =
        typeof payload.code === 'string' ? payload.code.trim().toUpperCase().slice(0, 12) : '';
      const nickname =
        typeof payload.nickname === 'string' ? payload.nickname.trim().slice(0, 24) : undefined;
      await joinRoom(playerId, code, nickname);
      break;
    }
    case 'leave_room':
      leaveRoom(playerId);
      break;
    case 'start_game':
      void startGame(playerId);
      break;
    case 'reveal':
      revealMore(playerId);
      break;
    case 'guess': {
      const trackId = typeof payload.trackId === 'string' ? payload.trackId : undefined;
      if (trackId) submitGuess(playerId, trackId);
      break;
    }
    case 'next_round':
      skipReveal(playerId);
      break;
    case 'ping':
      sendTo(playerId, { type: 'pong' });
      break;
    default:
      break;
  }
}

async function joinRoom(playerId: string, code: string, nickname?: string): Promise<void> {
  const current = playerRooms.get(playerId);
  if (current === code) return;
  if (current) leaveRoom(playerId);

  const room = rooms.get(code);
  if (!room) return sendError(playerId, 'Room not found, check the code and try again.');
  if (room.phase !== 'lobby') return sendError(playerId, 'That game is already in progress.');
  if (room.players.size >= room.maxPlayers) return sendError(playerId, 'Room is full.');

  const identity = identities.get(playerId) ?? { userId: null, guestId: null };
  const isHost = room.players.size === 0;
  const player: MpPlayer = {
    playerId,
    displayName: await resolveDisplayName(identity, nickname),
    identity,
    socket: sockets.get(playerId)!,
    isHost,
    score: 0,
    roundAnswered: false,
    roundCorrect: null,
    roundPoints: 0,
    stageIndex: 0,
    joinedAt: Date.now(),
  };

  room.players.set(playerId, player);
  playerRooms.set(playerId, room.code);
  if (isHost) room.hostId = playerId;

  broadcastRoomState(room);
}

export function leaveRoom(playerId: string): void {
  const code = playerRooms.get(playerId);
  if (!code) return;
  playerRooms.delete(playerId);

  const room = rooms.get(code);
  if (!room) return;

  room.players.delete(playerId);

  if (room.players.size === 0) {
    destroyRoom(room);
    return;
  }

  if (room.hostId === playerId) {
    const next = room.players.values().next().value as MpPlayer | undefined;
    if (next) {
      next.isHost = true;
      room.hostId = next.playerId;
    }
  }

  // A player leaving mid-round might have been the only one still guessing — check whether
  // the round can now be resolved early.
  if (room.phase === 'playing') {
    const remaining = [...room.players.values()].filter((p) => !p.roundAnswered);
    if (remaining.length === 0) {
      endRound(room);
      return;
    }
  }

  broadcastRoomState(room);
}

export async function startGame(playerId: string): Promise<void> {
  const room = roomFor(playerId);
  if (!room) return;
  if (room.hostId !== playerId) return sendError(playerId, 'Only the host can start the game.');
  if (room.phase !== 'lobby' && room.phase !== 'finished') {
    return sendError(playerId, 'Game already in progress.');
  }

  try {
    const pool = await room.source.loadCatalog();
    if (pool.length < room.rounds) {
      return sendError(
        playerId,
        `Not enough playable tracks for ${room.source.label} to build a game.`,
      );
    }

    const seed = `${room.code}:${Date.now()}:${randomUUID()}`;
    const shuffled = seededShuffle(pool, seed);

    // Check candidate tracks in parallel to obtain at least `room.rounds` with playable audio
    const candidateTracks = shuffled.slice(0, room.rounds * 2);
    const candidatePreviews = await Promise.all(
      candidateTracks.map((t) => getFreshPreviewUrl(t.deezerTrackId)),
    );

    const chosen: typeof pool = [];
    const previews: string[] = [];

    for (let i = 0; i < candidateTracks.length; i++) {
      if (chosen.length >= room.rounds) break;
      const p = candidatePreviews[i];
      const track = candidateTracks[i];
      if (p != null && track != null) {
        chosen.push(p.artist ? { ...track, artist: p.artist } : track);
        previews.push(p.previewUrl);
      }
    }

    if (chosen.length < room.rounds) {
      const remainingTracks = shuffled.slice(room.rounds * 2);
      for (const track of remainingTracks) {
        if (chosen.length >= room.rounds) break;
        const p = await getFreshPreviewUrl(track.deezerTrackId);
        if (p != null) {
          chosen.push(p.artist ? { ...track, artist: p.artist } : track);
          previews.push(p.previewUrl);
        }
      }
    }

    if (chosen.length < room.rounds) {
      return sendError(
        playerId,
        `Not enough tracks with playable audio available for ${room.source.label}.`,
      );
    }

    room.tracks = chosen;
    room.previewUrls = previews;
    // Decoys are drawn once, here, rather than per player: everyone must be shown the same
    // three answers or the round is not a fair race.
    room.roundOptions =
      room.guessMode === 'choice' ? chosen.map((track) => buildRoundOptions(track, pool)) : [];

    for (const p of room.players.values()) {
      p.score = 0;
      p.roundAnswered = false;
      p.roundCorrect = null;
      p.roundPoints = 0;
      p.stageIndex = 0;
    }

    broadcastRoomState(room);
    startRound(room, 0);
  } catch (err) {
    logger.error({ err }, 'Failed to start multiplayer game');
    sendError(playerId, 'Could not start the game, please try again.');
  }
}

function startRound(room: MpRoom, roundIndex: number): void {
  clearRoomTimers(room);

  for (const p of room.players.values()) {
    p.roundAnswered = p.playerId === room.hostId && !room.hostPlayable;
    p.roundCorrect = null;
    p.roundPoints = 0;
    p.stageIndex = 0;
  }

  room.currentRound = roundIndex;
  room.phase = 'playing';
  room.roundStartedAt = Date.now();
  room.speedCorrectCount = 0;

  const track = room.tracks[roundIndex];
  const isSpeed = room.gameMode === 'speed';
  const roundDuration = isSpeed ? room.speedRoundDurationMs : room.roundDurationMs;

  broadcast(room, {
    type: 'round_start',
    roundIndex,
    totalRounds: room.rounds,
    startedAt: room.roundStartedAt,
    roundDurationMs: roundDuration,
    snippetSchedule: isSpeed ? [room.speedSnippetSeconds] : room.revealSchedule,
    previewUrl: room.previewUrls[roundIndex] ?? null,
    albumArtUrl: track?.albumArtUrl ?? null,
    pictureUrl: room.source.pictureUrl,
    revealDurationMs: room.revealDurationMs,
    guessMode: room.guessMode,
    gameMode: room.gameMode,
    ...(room.guessMode === 'choice' ? { options: room.roundOptions[roundIndex] ?? [] } : {}),
  });

  room.timers.push(
    setTimeout(() => {
      endRound(room);
    }, roundDuration),
  );
}

/** Extends this player's own snippet one stage further along the reveal schedule. */
function revealMore(playerId: string): void {
  const room = roomFor(playerId);
  if (!room) return;
  if (room.gameMode === 'speed') return;
  if (room.phase !== 'playing') return sendError(playerId, 'No round is in progress.');
  const player = room.players.get(playerId);
  if (!player) return;
  if (player.roundAnswered) return sendError(playerId, 'Already answered this round.');

  const maxStage = room.revealSchedule.length - 1;
  if (player.stageIndex >= maxStage) return;

  player.stageIndex += 1;
  sendTo(playerId, { type: 'stage', stageIndex: player.stageIndex });
  broadcast(room, { type: 'scores', scores: buildScores(room) });
}

function submitGuess(playerId: string, trackId: string): void {
  const room = roomFor(playerId);
  if (!room) return;
  if (room.phase !== 'playing') return sendError(playerId, 'No round is in progress.');
  const player = room.players.get(playerId);
  if (!player) return;
  if (player.roundAnswered) return sendError(playerId, 'Already answered this round.');

  const track = room.tracks[room.currentRound];
  const correct = track?.deezerTrackId === trackId;
  const isSpeed = room.gameMode === 'speed';

  let points = 0;
  if (correct) {
    if (isSpeed) {
      points = room.speedPoints[Math.min(room.speedCorrectCount, room.speedPoints.length - 1)] ?? 1;
      room.speedCorrectCount += 1;
    } else {
      points = MP_REVEAL_POINTS[player.stageIndex] ?? 1;
    }
  }

  player.score += points;
  player.roundAnswered = true;
  player.roundCorrect = correct;
  player.roundPoints = points;

  sendTo(playerId, {
    type: 'guess_result',
    correct,
    points,
    stageIndex: player.stageIndex,
  });
  broadcast(room, { type: 'scores', scores: buildScores(room) });

  const remaining = [...room.players.values()].filter(
    (p) => !p.roundAnswered && !(p.playerId === room.hostId && !room.hostPlayable),
  );
  if (remaining.length === 0) endRound(room);
}

function endRound(room: MpRoom): void {
  if (room.phase !== 'playing') return;
  clearRoomTimers(room);
  room.phase = 'round-reveal';

  const track = room.tracks[room.currentRound];
  broadcast(room, {
    type: 'round_end',
    correct: track
      ? { title: track.title, artist: track.artist, albumArtUrl: track.albumArtUrl }
      : null,
    scores: buildScores(room),
  });

  const isLastRound = room.currentRound >= room.rounds - 1;
  room.timers.push(
    setTimeout(() => {
      if (room.phase !== 'round-reveal') return;
      if (isLastRound) {
        finishGame(room);
      } else {
        startRound(room, room.currentRound + 1);
      }
    }, room.revealDurationMs),
  );
}

function skipReveal(playerId: string): void {
  const room = roomFor(playerId);
  if (!room) return;
  if (room.phase !== 'round-reveal') return;
  if (room.hostId !== playerId) return sendError(playerId, 'Only the host can skip the reveal.');

  clearRoomTimers(room);
  if (room.currentRound >= room.rounds - 1) {
    finishGame(room);
  } else {
    startRound(room, room.currentRound + 1);
  }
}

function finishGame(room: MpRoom): void {
  room.phase = 'finished';
  const scores = buildScores(room);
  broadcast(room, {
    type: 'game_over',
    scores,
    winner: computeWinner(scores),
  });
}

function computeWinner(
  scores: MpScoreEntry[],
): { playerId: string; displayName: string; score: number } | null {
  if (scores.length === 0) return null;
  const top = scores.reduce((a, b) => (b.score > a.score ? b : a));
  return { playerId: top.playerId, displayName: top.displayName, score: top.score };
}

function buildScores(room: MpRoom): MpScoreEntry[] {
  return [...room.players.values()]
    .map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      score: p.score,
      answered: p.roundAnswered,
      correctThisRound: p.roundCorrect,
      stageIndex: p.stageIndex,
    }))
    .sort((a, b) => b.score - a.score);
}

function buildRoomSnapshot(room: MpRoom): MpRoomSnapshot {
  return {
    code: room.code,
    sourceType: room.source.sourceType,
    sourceId: room.source.sourceId,
    label: room.source.label,
    pictureUrl: room.source.pictureUrl,
    guessMode: room.guessMode,
    gameMode: room.gameMode,
    phase: room.phase,
    hostId: room.hostId,
    currentRound: room.currentRound,
    totalRounds: room.rounds,
    players: [...room.players.values()].map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      isHost: p.isHost,
      score: p.score,
      roundAnswered: p.roundAnswered,
      roundCorrect: p.roundCorrect,
      roundPoints: p.roundPoints,
      stageIndex: p.stageIndex,
      joinedAt: p.joinedAt,
    })),
    hostOnlyAudio: room.hostOnlyAudio,
    hostPlayable: room.hostPlayable,
  };
}

function broadcastRoomState(room: MpRoom): void {
  const snapshot = buildRoomSnapshot(room);
  for (const p of room.players.values()) {
    sendTo(p.playerId, { type: 'room_state', room: snapshot });
  }
}

function broadcast(room: MpRoom, payload: Record<string, unknown>): void {
  for (const p of room.players.values()) {
    sendTo(p.playerId, payload);
  }
}

function sendTo(playerId: string, payload: Record<string, unknown>): void {
  const socket = sockets.get(playerId);
  if (!socket) return;
  try {
    socket.send(JSON.stringify({ selfId: playerId, ...payload }));
  } catch (err) {
    logger.warn({ err }, 'Failed to send multiplayer message');
  }
}

function sendError(playerId: string, message: string): void {
  sendTo(playerId, { type: 'error', message });
}

function roomFor(playerId: string): MpRoom | null {
  const code = playerRooms.get(playerId);
  return code ? (rooms.get(code) ?? null) : null;
}

function clearRoomTimers(room: MpRoom): void {
  for (const t of room.timers) clearTimeout(t);
  room.timers = [];
}

function destroyRoom(room: MpRoom): void {
  clearRoomTimers(room);
  rooms.delete(room.code);
  logger.info({ code: room.code }, 'Multiplayer room destroyed');
}

// --- Cleanup + test hooks -----------------------------------------------------------------

let gcInterval: ReturnType<typeof setInterval> | null = null;

/** Periodically drops rooms that were created but never joined. */
function ensureGc(): void {
  if (gcInterval) return;
  gcInterval = setInterval(() => sweepEmptyRooms(), 60_000);
  if (typeof gcInterval.unref === 'function') gcInterval.unref();
}

export function sweepEmptyRooms(): void {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.players.size === 0 && now - room.createdAt > MP_EMPTY_ROOM_TTL_MS) {
      destroyRoom(room);
    }
  }
}

/** Test hook: clears all in-memory state so tests start from a clean slate. */
export function __resetForTests(): void {
  for (const room of rooms.values()) {
    clearRoomTimers(room);
  }
  rooms.clear();
  sockets.clear();
  identities.clear();
  playerRooms.clear();
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
  }
}

/** How many rooms exist right now, for the admin dashboard. Rooms are in memory only, so this
 *  is the only way to see them. */
export function activeRoomCount(): { total: number; playing: number } {
  let playing = 0;
  for (const room of rooms.values()) {
    if (room.phase === 'playing' || room.phase === 'round-reveal') playing += 1;
  }
  return { total: rooms.size, playing };
}

/** All live rooms, for the admin panel. */
export function listRooms(): MpRoomSnapshot[] {
  return [...rooms.values()].map(buildRoomSnapshot);
}

/** Force-close a room from the admin panel. Notifies all players. */
export function forceCloseRoom(code: string): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  broadcast(room, { type: 'room_closed', reason: 'Closed by an admin.' });
  for (const p of room.players.values()) {
    playerRooms.delete(p.playerId);
    try {
      p.socket.close(1000, 'Room closed by admin');
    } catch {
      /* already gone */
    }
  }
  destroyRoom(room);
  return true;
}

export function __getRoom(code: string): MpRoomSnapshot | null {
  const room = rooms.get(code);
  return room ? buildRoomSnapshot(room) : null;
}

export function __getRoomPhase(code: string): MpRoomPhase | null {
  return rooms.get(code)?.phase ?? null;
}

export function __getCurrentTrack(
  code: string,
): { deezerTrackId: string; title: string; artist: string } | null {
  const room = rooms.get(code);
  if (!room) return null;
  const track = room.tracks[room.currentRound];
  return track
    ? { deezerTrackId: track.deezerTrackId, title: track.title, artist: track.artist }
    : null;
}

void ensureGc();
