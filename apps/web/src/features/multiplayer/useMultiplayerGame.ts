import { useCallback, useEffect, useRef, useState } from 'react';
import { multiplayerSocketUrl } from '../../api/multiplayer';
import type {
  ArtistRoundOption,
  MultiplayerGameMode,
  MultiplayerGuessMode,
  MultiplayerRoomSnapshot,
  MultiplayerScoreEntry,
} from '../../types/api';

export type MultiplayerConnectionStatus = 'connecting' | 'open' | 'closed';

export interface MultiplayerRound {
  roundIndex: number;
  totalRounds: number;
  startedAt: number;
  /** Cap on the whole round; it can end earlier when everyone has answered. */
  roundDurationMs: number;
  snippetSchedule: readonly number[];
  previewUrl: string;
  albumArtUrl: string | null;
  pictureUrl: string | null;
  revealDurationMs: number;
  guessMode?: MultiplayerGuessMode;
  gameMode?: MultiplayerGameMode;
  /** Present in choice mode: the same three answers for every player in the room. */
  options?: ArtistRoundOption[];
}

export interface MultiplayerGuessResult {
  correct: boolean;
  points: number;
  stageIndex: number;
  /** The track this player committed to. Absent on a skip. */
  guessedTrackId?: string;
}

export interface MultiplayerRoundEnd {
  correct: { title: string; artist: string; albumArtUrl: string | null } | null;
  scores: MultiplayerScoreEntry[];
}

export interface MultiplayerGameOver {
  scores: MultiplayerScoreEntry[];
  winner: { playerId: string; displayName: string; score: number } | null;
}

interface ServerMessage {
  selfId: string;
  type: string;
  [key: string]: unknown;
}

interface UseMultiplayerGameResult {
  connectionStatus: MultiplayerConnectionStatus;
  room: MultiplayerRoomSnapshot | null;
  selfId: string | null;
  round: MultiplayerRound | null;
  stageIndex: number;
  roundEnd: MultiplayerRoundEnd | null;
  gameOver: MultiplayerGameOver | null;
  scores: MultiplayerScoreEntry[];
  lastGuess: MultiplayerGuessResult | null;
  error: string | null;
  startGame: () => void;
  reveal: () => void;
  submitGuess: (trackId: string) => void;
  nextRound: () => void;
  /** Host-only: repoints the room at a different artist or category and returns it to the lobby. */
  changeSource: (source: { artistId: number } | { categoryId: string }) => void;
  leave: () => void;
}

function snapshotScores(room: MultiplayerRoomSnapshot): MultiplayerScoreEntry[] {
  return room.players.map((p) => ({
    playerId: p.playerId,
    displayName: p.displayName,
    score: p.score,
    answered: p.roundAnswered,
    correctThisRound: p.roundCorrect,
    stageIndex: p.stageIndex,
  }));
}

/** Connects to the real-time multiplayer socket for a room and keeps client state in sync
 *  with the server-driven game timeline (rounds, per-player reveals, scores). Pass a nickname
 *  to join with a chosen name; pass `null` to hold off connecting until the player joins. */
export function useMultiplayerGame(
  code: string,
  nickname?: string | null,
): UseMultiplayerGameResult {
  const [connectionStatus, setConnectionStatus] =
    useState<MultiplayerConnectionStatus>('connecting');
  const [room, setRoom] = useState<MultiplayerRoomSnapshot | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [round, setRound] = useState<MultiplayerRound | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [roundEnd, setRoundEnd] = useState<MultiplayerRoundEnd | null>(null);
  const [gameOver, setGameOver] = useState<MultiplayerGameOver | null>(null);
  const [scores, setScores] = useState<MultiplayerScoreEntry[]>([]);
  const [lastGuess, setLastGuess] = useState<MultiplayerGuessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  const nicknameRef = useRef(nickname);
  nicknameRef.current = nickname;

  const handleServerMessage = useCallback((raw: ServerMessage) => {
    if (raw.selfId) setSelfId(raw.selfId);

    switch (raw.type) {
      case 'room_state': {
        const snapshot = raw.room as MultiplayerRoomSnapshot;
        setRoom(snapshot);
        setScores(snapshotScores(snapshot));
        setGameOver(null);
        setRoundEnd(null);
        // A room back in the lobby has no round by definition. Without this the last round of
        // the previous game survives, and the host switching to a new artist drops everyone
        // back into the finished game's screen instead of the lobby — `round` is checked
        // before `room.phase` when deciding what to render.
        if (snapshot.phase === 'lobby') {
          setRound(null);
          setStageIndex(0);
          setLastGuess(null);
        }
        break;
      }
      case 'round_start': {
        setRound({
          roundIndex: raw.roundIndex as number,
          totalRounds: raw.totalRounds as number,
          startedAt: raw.startedAt as number,
          roundDurationMs: raw.roundDurationMs as number,
          snippetSchedule: raw.snippetSchedule as readonly number[],
          previewUrl: raw.previewUrl as string,
          albumArtUrl: raw.albumArtUrl as string | null,
          pictureUrl: raw.pictureUrl as string | null,
          revealDurationMs: raw.revealDurationMs as number,
          guessMode: raw.guessMode as MultiplayerGuessMode | undefined,
          gameMode: raw.gameMode as MultiplayerGameMode | undefined,
          options: raw.options as ArtistRoundOption[] | undefined,
        });
        setStageIndex(0);
        setRoundEnd(null);
        setLastGuess(null);
        setGameOver(null);
        break;
      }
      case 'stage':
        setStageIndex(raw.stageIndex as number);
        break;
      case 'guess_result':
        setLastGuess({
          correct: raw.correct as boolean,
          points: raw.points as number,
          stageIndex: raw.stageIndex as number,
          guessedTrackId: raw.guessedTrackId as string | undefined,
        });
        break;
      case 'scores':
        setScores(raw.scores as MultiplayerScoreEntry[]);
        break;
      case 'round_end':
        setRoundEnd({
          correct: raw.correct as MultiplayerRoundEnd['correct'],
          scores: raw.scores as MultiplayerScoreEntry[],
        });
        setScores(raw.scores as MultiplayerScoreEntry[]);
        break;
      case 'game_over':
        setGameOver({
          scores: raw.scores as MultiplayerScoreEntry[],
          winner: raw.winner as MultiplayerGameOver['winner'],
        });
        setScores(raw.scores as MultiplayerScoreEntry[]);
        break;
      case 'error':
        setError(raw.message as string);
        break;
      default:
        break;
    }
  }, []);

  const connect = useCallback(() => {
    setConnectionStatus('connecting');
    wsRef.current?.close();

    const ws = new WebSocket(multiplayerSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('open');
      setError(null);
      const join: Record<string, unknown> = { type: 'join_room', code: codeRef.current };
      if (nicknameRef.current) join.nickname = nicknameRef.current;
      ws.send(JSON.stringify(join));
    };
    ws.onmessage = (event) => {
      try {
        handleServerMessage(JSON.parse(event.data as string) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => setConnectionStatus('closed');
    ws.onerror = () => ws.close();
  }, [handleServerMessage]);

  useEffect(() => {
    if (nickname === null) return;
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect, nickname]);

  // Reconnect once while still in (or before) the lobby — a dropped socket mid-game is a
  // hard exit, matching the server's "can't join a game in progress" rule.
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (nickname === null) return;
    if (connectionStatus !== 'closed') return;
    if (room && room.phase !== 'lobby') return;
    reconnectTimerRef.current = setTimeout(() => connect(), 800);
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connectionStatus, room, connect, nickname]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const startGame = useCallback(() => send({ type: 'start_game' }), [send]);
  const reveal = useCallback(() => send({ type: 'reveal' }), [send]);
  const submitGuess = useCallback((trackId: string) => send({ type: 'guess', trackId }), [send]);
  const nextRound = useCallback(() => send({ type: 'next_round' }), [send]);
  const changeSource = useCallback(
    (source: { artistId: number } | { categoryId: string }) =>
      send({ type: 'change_source', ...source }),
    [send],
  );
  const leave = useCallback(() => {
    send({ type: 'leave_room' });
    wsRef.current?.close();
  }, [send]);

  return {
    connectionStatus,
    room,
    selfId,
    round,
    stageIndex,
    roundEnd,
    gameOver,
    scores,
    lastGuess,
    error,
    startGame,
    reveal,
    submitGuess,
    nextRound,
    changeSource,
    leave,
  };
}
