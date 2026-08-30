/**
 * The duel matchmaking socket.
 *
 * Shares the multiplayer WebSocket endpoint rather than opening a second one — it is already
 * authenticated, and a matched player moves straight from the queue into a room on the same
 * connection.
 *
 * Two things this hook is responsible for beyond queueing: keeping the per-source waiting counts
 * live (the reason a narrow queue is usable at all), and telling the caller the moment a match
 * lands so it can navigate into the room.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { multiplayerSocketUrl } from '../../api/multiplayer';
import { getQueueSnapshot } from '../../api/duels';
import type { DuelQueueCount } from '../../types/api';

export type DuelQueueRequest =
  | { kind: 'artist'; artistId: number; label: string }
  | { kind: 'category'; categoryId: string; label: string }
  | { kind: 'random'; label: string };

export type DuelQueueStatus = 'idle' | 'connecting' | 'ready' | 'queued' | 'matched';

interface UseDuelQueueResult {
  status: DuelQueueStatus;
  counts: DuelQueueCount[];
  total: number;
  /** Set once a room exists; the caller navigates to it. */
  matchedCode: string | null;
  queuedLabel: string | null;
  error: string | null;
  join: (request: DuelQueueRequest) => void;
  leave: () => void;
}

/** Mirrors the server's queueKey, so a card can show the count for the thing it represents. */
export function queueKeyFor(request: DuelQueueRequest): string {
  switch (request.kind) {
    case 'artist':
      return `artist:${request.artistId}`;
    case 'category':
      return `category:${request.categoryId}`;
    case 'random':
      return 'random';
  }
}

export function useDuelQueue(enabled: boolean): UseDuelQueueResult {
  const [status, setStatus] = useState<DuelQueueStatus>('idle');
  const [counts, setCounts] = useState<DuelQueueCount[]>([]);
  const [total, setTotal] = useState(0);
  const [matchedCode, setMatchedCode] = useState<string | null>(null);
  const [queuedLabel, setQueuedLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  /** Survives a reconnect: if the socket blips while queued, we rejoin the same line. */
  const pendingRef = useRef<DuelQueueRequest | null>(null);

  // Snapshot first so the page never renders an empty queue while the socket opens.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getQueueSnapshot()
      .then((snap) => {
        if (cancelled) return;
        setCounts((current) => (current.length === 0 ? snap.counts : current));
        setTotal((current) => (current === 0 ? snap.total : current));
      })
      .catch(() => {
        /* the socket will supply these a moment later */
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    setStatus('connecting');
    const ws = new WebSocket(multiplayerSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('ready');
      setError(null);
      ws.send(JSON.stringify({ type: 'duel_queue_watch' }));
      const pending = pendingRef.current;
      if (pending) ws.send(JSON.stringify(toJoinMessage(pending)));
    };

    ws.onmessage = (event) => {
      let msg: { type?: string; [k: string]: unknown };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'duel_queue_counts':
          setCounts(msg.counts as DuelQueueCount[]);
          setTotal(msg.total as number);
          break;
        case 'duel_queued':
          setStatus('queued');
          setQueuedLabel(msg.label as string);
          break;
        case 'duel_queue_left':
          setStatus('ready');
          setQueuedLabel(null);
          pendingRef.current = null;
          break;
        case 'duel_matched':
          setStatus('matched');
          setMatchedCode(msg.code as string);
          pendingRef.current = null;
          break;
        case 'error':
          setError(msg.message as string);
          setStatus('ready');
          pendingRef.current = null;
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      // Only reset to idle when we weren't mid-match; a matched player is already navigating.
      setStatus((s) => (s === 'matched' ? s : 'idle'));
    };
    ws.onerror = () => ws.close();

    return () => {
      try {
        ws.send(JSON.stringify({ type: 'duel_queue_unwatch' }));
        ws.send(JSON.stringify({ type: 'duel_queue_leave' }));
      } catch {
        /* socket already gone */
      }
      ws.close();
    };
  }, [enabled]);

  const join = useCallback((request: DuelQueueRequest) => {
    setError(null);
    pendingRef.current = request;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(toJoinMessage(request)));
    }
  }, []);

  const leave = useCallback(() => {
    pendingRef.current = null;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'duel_queue_leave' }));
    }
    setStatus('ready');
    setQueuedLabel(null);
  }, []);

  return { status, counts, total, matchedCode, queuedLabel, error, join, leave };
}

function toJoinMessage(request: DuelQueueRequest): Record<string, unknown> {
  switch (request.kind) {
    case 'artist':
      return { type: 'duel_queue_join', artistId: request.artistId };
    case 'category':
      return { type: 'duel_queue_join', categoryId: request.categoryId };
    case 'random':
      return { type: 'duel_queue_join', random: true };
  }
}
