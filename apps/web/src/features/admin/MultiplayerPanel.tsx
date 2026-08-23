import { useCallback, useEffect, useState } from 'react';
import { getAdminRooms, closeAdminRoom } from '../../api/admin';
import type { AdminRoom } from '../../types/api';

const PHASE_LABELS: Record<string, string> = {
  lobby: 'Lobby',
  playing: 'Playing',
  'round-reveal': 'Revealing',
  finished: 'Finished',
};

export function MultiplayerPanel() {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminRooms();
      setRooms(res.rooms);
    } catch {
      setError('Could not load rooms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const close = async (code: string) => {
    setError(null);
    setNotice(null);
    try {
      await closeAdminRoom(code);
      setRooms((prev) => prev.filter((r) => r.code !== code));
      setNotice(`Room ${code} closed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close room.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {rooms.length} live {rooms.length === 1 ? 'room' : 'rooms'}
        </p>
        <button type="button" onClick={() => void refresh()} className="btn-ghost !py-1 text-xs">
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-slate-400">No active rooms right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rooms.map((room) => (
            <li
              key={room.code}
              className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    <span className="font-mono text-chorusify-accent2">{room.code}</span>
                    <span className="mx-2 text-slate-600">·</span>
                    {room.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    {room.gameMode === 'speed' ? 'Speed' : 'Classic'} ·{' '}
                    {room.guessMode === 'choice' ? 'Multiple choice' : 'Type to search'} ·{' '}
                    {PHASE_LABELS[room.phase] ?? room.phase} · Round {room.currentRound + 1}/
                    {room.totalRounds}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void close(room.code)}
                  className="btn-ghost !py-1 text-xs text-red-300 hover:text-red-200"
                >
                  Force close
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {room.players.map((p) => (
                  <div
                    key={p.playerId}
                    className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5"
                  >
                    <span className="text-xs font-medium text-slate-200">{p.displayName}</span>
                    <span className="font-mono text-[10px] text-slate-500">{p.score}pts</span>
                    {p.isHost && (
                      <span className="rounded bg-white/10 px-1 text-[9px] font-semibold uppercase text-slate-400">
                        host
                      </span>
                    )}
                    {p.roundAnswered && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          p.roundCorrect ? 'bg-emerald-400' : 'bg-red-400'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
