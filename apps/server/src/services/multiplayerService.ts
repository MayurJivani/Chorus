import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import type { Identity } from '../auth/identity';
import { getFreshPreviewUrl, type ArtistTrack } from './deezerService';
import { getArtistCatalog } from './artistCatalogService';
import { buildRoundOptions, type RoundOption } from './artistChallengeService';
import { seededShuffle } from '../utils/deterministic';
import { logger } from '../logger';

/** Seconds of audio revealed at each reveal stage, Heardle-style. Players advance their own
 *  snippet one stage at a time with a "reveal more" action instead of a shared auto-timer. */
export const MP_REVEAL_SCHEDULE = [1, 2, 4, 7, 11, 16] as const;
/** Points for guessing at each reveal stage — fewer reveals means more points. */
export const MP_REVEAL_POINTS = [6, 5, 4, 3, 2, 1] as const;
/** Cap on how long a round can run; it ends earlier once everyone has answered. */
export const MP_ROUND_DURATION_MS = 60 * 1000;
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

interface MpRoom {
  code: string;
  artistId: number;
  artistName: string;
  artistPictureUrl: string | null;
  guessMode: MpGuessMode;
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
  artistId: number;
  artistName: string;
  artistPictureUrl: string | null;
  guessMode: MpGuessMode;
  phase: MpRoomPhase;
  hostId: string;
  currentRound: number;
  totalRounds: number;
  players: MpPlayerState[];
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

export function createRoom(
  artistId: number,
  artistName: string,
  artistPictureUrl: string | null = null,
  guessMode: MpGuessMode = 'search',
): { code: string } {
  let code = '';
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  rooms.set(code, {
    code,
    artistId,
    artistName,
    artistPictureUrl,
    guessMode,
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
  });

  logger.info({ code, artistId, artistName, guessMode }, 'Multiplayer room created');
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
  if (!room) return sendError(playerId, 'Room not found — check the code and try again.');
  if (room.phase !== 'lobby') return sendError(playerId, 'That game is already in progress.');
  if (room.players.size >= MP_MAX_PLAYERS) return sendError(playerId, 'Room is full.');

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
    const pool = await getArtistCatalog(room.artistId, false);
    if (pool.length < MP_ROUNDS) {
      return sendError(
        playerId,
        `Not enough playable tracks for ${room.artistName} to build a game.`,
      );
    }

    const seed = `${room.code}:${Date.now()}:${randomUUID()}`;
    const shuffled = seededShuffle(pool, seed);

    // Check candidate tracks in parallel to obtain at least MP_ROUNDS with playable audio
    const candidateTracks = shuffled.slice(0, MP_ROUNDS * 2);
    const candidatePreviews = await Promise.all(
      candidateTracks.map((t) => getFreshPreviewUrl(t.deezerTrackId)),
    );

    const chosen: typeof pool = [];
    const previews: string[] = [];

    for (let i = 0; i < candidateTracks.length; i++) {
      if (chosen.length >= MP_ROUNDS) break;
      const p = candidatePreviews[i];
      const track = candidateTracks[i];
      if (p != null && track != null) {
        chosen.push(track);
        previews.push(p.previewUrl);
      }
    }

    if (chosen.length < MP_ROUNDS) {
      const remainingTracks = shuffled.slice(MP_ROUNDS * 2);
      for (const track of remainingTracks) {
        if (chosen.length >= MP_ROUNDS) break;
        const p = await getFreshPreviewUrl(track.deezerTrackId);
        if (p != null) {
          chosen.push(track);
          previews.push(p.previewUrl);
        }
      }
    }

    if (chosen.length < MP_ROUNDS) {
      return sendError(
        playerId,
        `Not enough tracks with playable audio available for ${room.artistName}.`,
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
    sendError(playerId, 'Could not start the game — please try again.');
  }
}

function startRound(room: MpRoom, roundIndex: number): void {
  clearRoomTimers(room);

  for (const p of room.players.values()) {
    p.roundAnswered = false;
    p.roundCorrect = null;
    p.roundPoints = 0;
    p.stageIndex = 0;
  }

  room.currentRound = roundIndex;
  room.phase = 'playing';
  room.roundStartedAt = Date.now();

  const track = room.tracks[roundIndex];
  broadcast(room, {
    type: 'round_start',
    roundIndex,
    totalRounds: MP_ROUNDS,
    startedAt: room.roundStartedAt,
    roundDurationMs: MP_ROUND_DURATION_MS,
    snippetSchedule: MP_REVEAL_SCHEDULE,
    previewUrl: room.previewUrls[roundIndex] ?? null,
    albumArtUrl: track?.albumArtUrl ?? null,
    artistPictureUrl: room.artistPictureUrl,
    revealDurationMs: MP_REVEAL_DURATION_MS,
    guessMode: room.guessMode,
    ...(room.guessMode === 'choice' ? { options: room.roundOptions[roundIndex] ?? [] } : {}),
  });

  // A single timer caps the whole round. Each player reveals more audio at their own pace
  // and the round resolves early once everyone has answered.
  room.timers.push(
    setTimeout(() => {
      endRound(room);
    }, MP_ROUND_DURATION_MS),
  );
}

/** Extends this player's own snippet one stage further along the reveal schedule. */
function revealMore(playerId: string): void {
  const room = roomFor(playerId);
  if (!room) return;
  if (room.phase !== 'playing') return sendError(playerId, 'No round is in progress.');
  const player = room.players.get(playerId);
  if (!player) return;
  if (player.roundAnswered) return sendError(playerId, 'Already answered this round.');

  const maxStage = MP_REVEAL_SCHEDULE.length - 1;
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
  const points = correct ? (MP_REVEAL_POINTS[player.stageIndex] ?? 1) : 0;

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

  const remaining = [...room.players.values()].filter((p) => !p.roundAnswered);
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

  const isLastRound = room.currentRound >= MP_ROUNDS - 1;
  room.timers.push(
    setTimeout(() => {
      if (room.phase !== 'round-reveal') return;
      if (isLastRound) {
        finishGame(room);
      } else {
        startRound(room, room.currentRound + 1);
      }
    }, MP_REVEAL_DURATION_MS),
  );
}

function skipReveal(playerId: string): void {
  const room = roomFor(playerId);
  if (!room) return;
  if (room.phase !== 'round-reveal') return;
  if (room.hostId !== playerId) return sendError(playerId, 'Only the host can skip the reveal.');

  clearRoomTimers(room);
  if (room.currentRound >= MP_ROUNDS - 1) {
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
    artistId: room.artistId,
    artistName: room.artistName,
    artistPictureUrl: room.artistPictureUrl,
    guessMode: room.guessMode,
    phase: room.phase,
    hostId: room.hostId,
    currentRound: room.currentRound,
    totalRounds: MP_ROUNDS,
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
