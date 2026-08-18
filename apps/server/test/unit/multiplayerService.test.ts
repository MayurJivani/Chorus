import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRoom,
  registerConnection,
  unregisterConnection,
  handleClientMessage,
  __resetForTests,
  __getRoom,
  __getRoomPhase,
  __getCurrentTrack,
  MP_ROUND_DURATION_MS,
  MP_REVEAL_DURATION_MS,
  MP_REVEAL_POINTS,
  MP_REVEAL_SCHEDULE,
  MP_ROUNDS,
  MP_MAX_PLAYERS,
  type MpSocket,
} from '../../src/services/multiplayerService';

const deezerMocks = vi.hoisted(() => ({
  getArtistTopTracks: vi.fn(),
  getFreshPreviewUrl: vi.fn(),
}));

// The catalog service is mocked rather than exercised: it reads the Postgres-backed pool, and
// a real database round trip cannot resolve inside these fake-timer driven round-flow tests.
// Its own caching behaviour is covered in artistCatalogService.test.ts.
const catalogMocks = vi.hoisted(() => ({
  getArtistCatalog: vi.fn(),
}));

vi.mock('../../src/services/deezerService', () => deezerMocks);
vi.mock('../../src/services/artistCatalogService', () => catalogMocks);

interface SentMessage {
  type: string;
  selfId: string;
  [key: string]: unknown;
}

class FakeSocket implements MpSocket {
  readonly sent: SentMessage[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as SentMessage);
  }

  close(): void {
    this.closed = true;
  }
}

function mockTracks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    deezerTrackId: `dz-${i}`,
    title: `Track ${i}`,
    artist: 'Queen',
    albumArtUrl: null,
    durationSeconds: 200,
  }));
}

function register(playerId: string, guestId: string): FakeSocket {
  const socket = new FakeSocket();
  registerConnection({ playerId, socket, identity: { userId: null, guestId } });
  return socket;
}

function messagesOf(socket: FakeSocket, type: string): SentMessage[] {
  return socket.sent.filter((m) => m.type === type);
}

function lastOf(socket: FakeSocket, type: string): SentMessage | undefined {
  const matches = messagesOf(socket, type);
  return matches[matches.length - 1];
}

async function join(playerId: string, code: string, nickname?: string): Promise<void> {
  await handleClientMessage(playerId, { type: 'join_room', code, nickname });
}

function guess(playerId: string, trackId: string): void {
  handleClientMessage(playerId, { type: 'guess', trackId });
}

function guessCorrect(playerId: string, code: string): void {
  const track = __getCurrentTrack(code);
  if (!track) throw new Error('No current track to guess');
  guess(playerId, track.deezerTrackId);
}

function guessWrong(playerId: string): void {
  guess(playerId, 'dz-wrong');
}

function reveal(playerId: string, times = 1): void {
  for (let i = 0; i < times; i += 1) {
    handleClientMessage(playerId, { type: 'reveal' });
  }
}

beforeEach(() => {
  __resetForTests();
  vi.useFakeTimers();
  vi.clearAllMocks();
  // At least MP_ROUNDS * 2, because startGame draws that many candidates and needs MP_ROUNDS
  // of them to have a playable preview. When the round count went from 5 to 10 this pool was
  // left at 5, so every start failed with "not enough playable tracks" and nine tests broke.
  catalogMocks.getArtistCatalog.mockResolvedValue(mockTracks(MP_ROUNDS * 2));
  deezerMocks.getFreshPreviewUrl.mockImplementation(async (id: string) => ({
    previewUrl: `https://preview.test/${id}.mp3`,
    durationSeconds: 30,
  }));
});

afterEach(() => {
  vi.useRealTimers();
  __resetForTests();
});

describe('multiplayerService lobby', () => {
  it('creates a room with a short, unambiguous code', () => {
    const { code } = createRoom(412, 'Queen');
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(__getRoom(code)).toMatchObject({
      code,
      artistId: 412,
      artistName: 'Queen',
      phase: 'lobby',
    });
  });

  it('joins players into a room and assigns the first joiner as host', async () => {
    const { code } = createRoom(412, 'Queen');
    const host = register('p1', 'aaaabbbb');
    register('p2', 'ccccdddd');
    await join('p1', code, 'Alex');
    await join('p2', code);

    const hostState = lastOf(host, 'room_state')!.room as {
      phase: string;
      players: Array<{ playerId: string; isHost: boolean; displayName: string }>;
    };
    expect(hostState.phase).toBe('lobby');
    expect(hostState.players).toHaveLength(2);
    expect(hostState.players.map((p) => p.playerId).sort()).toEqual(['p1', 'p2']);
    expect(hostState.players.find((p) => p.playerId === 'p1')!.isHost).toBe(true);
    expect(hostState.players.find((p) => p.playerId === 'p2')!.isHost).toBe(false);
    expect(hostState.players.find((p) => p.playerId === 'p1')!.displayName).toBe('Alex');
  });

  it('rejects a join with an unknown room code', async () => {
    const socket = register('p1', 'aaaabbbb');
    await join('p1', 'ZZZZZZ');
    const error = lastOf(socket, 'error');
    expect(error?.message).toContain('Room not found');
  });

  it('rejects a join when the room is full', async () => {
    const { code } = createRoom(412, 'Queen');
    for (let i = 0; i < MP_MAX_PLAYERS; i += 1) {
      register(`p${i}`, `guest${i}`.padEnd(10, '0'));
      await join(`p${i}`, code);
    }
    const extra = register('overflow', 'overflow00');
    await join('overflow', code);
    expect(lastOf(extra, 'error')?.message).toContain('Room is full');
  });

  it('rejects a join once the game is in progress', async () => {
    const { code } = createRoom(412, 'Queen');
    register('host', 'hostaaaa');
    await join('host', code);
    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);

    const late = register('late', 'latebbbb');
    await join('late', code);
    expect(lastOf(late, 'error')?.message).toContain('already in progress');
  });

  it('reassigns host when the host leaves, and destroys the room when it empties', async () => {
    const { code } = createRoom(412, 'Queen');
    register('p1', 'aaaabbbb');
    register('p2', 'ccccdddd');
    await join('p1', code);
    const guest = register('p3', 'eeeeffff');
    await join('p2', code);
    await join('p3', code);

    handleClientMessage('p1', { type: 'leave_room' });
    let state = lastOf(guest, 'room_state')!.room as {
      hostId: string;
      players: Array<{ playerId: string }>;
    };
    expect(state.hostId).toBe('p2');
    expect(state.players).toHaveLength(2);

    handleClientMessage('p2', { type: 'leave_room' });
    handleClientMessage('p3', { type: 'leave_room' });
    expect(__getRoom(code)).toBeNull();
  });
});

describe('multiplayerService start_game', () => {
  it('only lets the host start the game', async () => {
    const { code } = createRoom(412, 'Queen');
    register('host', 'hostaaaa');
    const guest = register('guest', 'guestbbbb');
    await join('host', code);
    await join('guest', code);

    handleClientMessage('guest', { type: 'start_game' });
    expect(lastOf(guest, 'error')?.message).toContain('Only the host');

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);
    expect(messagesOf(guest, 'round_start')).toHaveLength(1);
  });

  it('refuses to start when the artist does not have enough playable tracks', async () => {
    catalogMocks.getArtistCatalog.mockResolvedValue([]);
    const { code } = createRoom(412, 'Queen');
    const host = register('host', 'hostaaaa');
    await join('host', code);

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);
    expect(lastOf(host, 'error')?.message).toContain('Not enough playable tracks');
    expect(__getRoomPhase(code)).toBe('lobby');
  });
});

describe('multiplayerService round flow', () => {
  it('lets each player reveal audio manually and awards points by reveal count', async () => {
    const { code } = createRoom(412, 'Queen', 'https://art.test/queen.jpg');
    const host = register('host', 'hostaaaa');
    const guest = register('guest', 'guestbbbb');
    await join('host', code);
    await join('guest', code);

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);

    const start = lastOf(guest, 'round_start');
    const firstTrack = __getCurrentTrack(code)!;
    expect(start?.roundIndex).toBe(0);
    expect(start?.totalRounds).toBe(MP_ROUNDS);
    expect(start?.roundDurationMs).toBe(MP_ROUND_DURATION_MS);
    expect(start?.previewUrl).toBe(`https://preview.test/${firstTrack.deezerTrackId}.mp3`);
    expect(start?.artistPictureUrl).toBe('https://art.test/queen.jpg');
    expect(__getRoomPhase(code)).toBe('playing');

    // Nothing auto-reveals — the guest reveals once and hears the second slice.
    reveal('guest');
    expect(lastOf(guest, 'stage')?.stageIndex).toBe(1);
    expect(messagesOf(guest, 'stage')).toHaveLength(1);

    // The host stays on the first slice and gets the top points; the guest's one reveal
    // costs them one point tier.
    guessCorrect('host', code);
    guessCorrect('guest', code);
    expect(lastOf(host, 'guess_result')?.points).toBe(MP_REVEAL_POINTS[0]);
    expect(lastOf(guest, 'guess_result')?.points).toBe(MP_REVEAL_POINTS[1]);

    // Both players answered -> round ends early with a reveal.
    expect(__getRoomPhase(code)).toBe('round-reveal');
    const revealMsg = lastOf(guest, 'round_end');
    const revealCorrect = revealMsg?.correct as { title: string; artist: string } | undefined;
    expect(revealCorrect?.title).toBeTruthy();

    // Non-host cannot skip the reveal; the host can.
    handleClientMessage('guest', { type: 'next_round' });
    expect(lastOf(guest, 'error')?.message).toContain('Only the host');
    handleClientMessage('host', { type: 'next_round' });
    expect(lastOf(host, 'round_start')?.roundIndex).toBe(1);
  });

  it('caps reveals at the end of the snippet schedule', async () => {
    const { code } = createRoom(412, 'Queen');
    const host = register('host', 'hostaaaa');
    await join('host', code);

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);

    reveal('host', MP_REVEAL_SCHEDULE.length - 1);
    expect(lastOf(host, 'stage')?.stageIndex).toBe(MP_REVEAL_SCHEDULE.length - 1);

    // One more reveal is ignored, and the player is still free to answer.
    reveal('host');
    expect(messagesOf(host, 'stage')).toHaveLength(MP_REVEAL_SCHEDULE.length - 1);
    guessCorrect('host', code);
    expect(lastOf(host, 'guess_result')?.points).toBe(
      MP_REVEAL_POINTS[MP_REVEAL_SCHEDULE.length - 1],
    );
    expect(__getRoomPhase(code)).toBe('round-reveal');
  });

  it('ends the round when the time limit expires even if nobody answered', async () => {
    const { code } = createRoom(412, 'Queen');
    const host = register('host', 'hostaaaa');
    register('guest', 'guestbbbb');
    await join('host', code);
    await join('guest', code);

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);
    expect(__getRoomPhase(code)).toBe('playing');

    await vi.advanceTimersByTimeAsync(MP_ROUND_DURATION_MS);
    expect(__getRoomPhase(code)).toBe('round-reveal');
    expect(lastOf(host, 'round_end')).toBeDefined();
  });

  it('scores zero for a wrong guess and only lets players answer once', async () => {
    const { code } = createRoom(412, 'Queen');
    const host = register('host', 'hostaaaa');
    register('guest', 'guestbbbb');
    await join('host', code);
    await join('guest', code);

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);

    guessWrong('host');
    expect(lastOf(host, 'guess_result')).toMatchObject({ correct: false, points: 0 });

    // A second guess in the same round is rejected.
    guessCorrect('host', code);
    expect(lastOf(host, 'error')?.message).toContain('Already answered');

    guessCorrect('guest', code);
    expect(__getRoomPhase(code)).toBe('round-reveal');
  });

  it(`runs the full ${MP_ROUNDS}-round game and reports a winner`, async () => {
    const { code } = createRoom(412, 'Queen');
    register('host', 'hostaaaa');
    const guest = register('guest', 'guestbbbb');
    await join('host', code);
    await join('guest', code);

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);

    for (let round = 0; round < MP_ROUNDS; round += 1) {
      expect(__getRoomPhase(code)).toBe('playing');
      guessCorrect('host', code);
      guessCorrect('guest', code);
      expect(__getRoomPhase(code)).toBe('round-reveal');
      await vi.advanceTimersByTimeAsync(MP_REVEAL_DURATION_MS);
    }

    expect(__getRoomPhase(code)).toBe('finished');
    const over = lastOf(guest, 'game_over');
    expect(over?.scores).toHaveLength(2);
    // Every round was solved at stage 0, so each player earns MP_ROUNDS * 6 points and
    // the tie resolves in the first player's favour.
    const scores = over?.scores as Array<{ score: number }>;
    expect(scores.every((s) => s.score === MP_ROUNDS * MP_REVEAL_POINTS[0])).toBe(true);
    const winner = over?.winner as { playerId: string } | undefined;
    expect(winner?.playerId).toBe('host');
  });

  it('cleans up connections on unregister', async () => {
    const { code } = createRoom(412, 'Queen');
    const host = register('host', 'hostaaaa');
    await join('host', code);
    unregisterConnection('host');
    expect(host.closed).toBe(false);
    expect(__getRoom(code)).toBeNull();
  });
});

describe('multiplayerService guess mode', () => {
  it('defaults to search mode and sends no options', async () => {
    const { code } = createRoom(412, 'Queen');
    const host = register('host', 'hostaaaa');
    await join('host', code);

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);

    const start = lastOf(host, 'round_start');
    expect(start?.guessMode).toBe('search');
    expect(start?.options).toBeUndefined();
    expect(__getRoom(code)).toMatchObject({ guessMode: 'search' });
  });

  it('sends three options per round in choice mode', async () => {
    const { code } = createRoom(412, 'Queen', null, 'choice');
    const host = register('host', 'hostaaaa');
    await join('host', code);

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);

    const start = lastOf(host, 'round_start');
    expect(start?.guessMode).toBe('choice');
    const options = start?.options as { deezerTrackId: string; title: string }[];
    expect(options).toHaveLength(3);
    // The correct answer has to be among them, or the round is unwinnable.
    const current = __getCurrentTrack(code);
    expect(options.map((o) => o.deezerTrackId)).toContain(current?.deezerTrackId);
  });

  it('gives every player in the room the same three options', async () => {
    const { code } = createRoom(412, 'Queen', null, 'choice');
    const host = register('host', 'hostaaaa');
    const guest = register('guest', 'guestbbb');
    await join('host', code);
    await join('guest', code);

    handleClientMessage('host', { type: 'start_game' });
    await vi.advanceTimersByTimeAsync(0);

    const hostOptions = lastOf(host, 'round_start')?.options;
    const guestOptions = lastOf(guest, 'round_start')?.options;
    // A race is only fair if both players are choosing between the same answers.
    expect(guestOptions).toEqual(hostOptions);
  });

  it('carries the mode on the room snapshot so joiners see it in the lobby', async () => {
    const { code } = createRoom(412, 'Queen', null, 'choice');
    const guest = register('guest', 'guestbbb');
    await join('guest', code);

    const state = lastOf(guest, 'room_state')?.room as { guessMode: string };
    expect(state.guessMode).toBe('choice');
  });
});
