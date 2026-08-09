import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import type { MultiplayerRoomSnapshot, MultiplayerScoreEntry } from '../../types/api';
import { MultiplayerScoreboard } from './MultiplayerScoreboard';

interface MultiplayerLobbyProps {
  room: MultiplayerRoomSnapshot;
  selfId: string | null;
  onStart: () => void;
  onLeave: () => void;
}

function toScoreEntries(room: MultiplayerRoomSnapshot): MultiplayerScoreEntry[] {
  return room.players.map((p) => ({
    playerId: p.playerId,
    displayName: p.displayName,
    score: p.score,
    answered: p.roundAnswered,
    correctThisRound: p.roundCorrect,
    stageIndex: p.stageIndex,
  }));
}

export function MultiplayerLobby({ room, selfId, onStart, onLeave }: MultiplayerLobbyProps) {
  const isHost = selfId === room.hostId;
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${window.location.origin}/room/${room.code}`;

  const copyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [inviteUrl]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass flex w-full flex-col items-center gap-5 rounded-2xl p-6 text-center"
      >
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-extrabold text-white">{room.artistName}</h1>
          <p className="text-sm text-slate-400">
            Real-time multiplayer race ·{' '}
            {/* Fixed when the room was created, so joiners know what they are walking into. */}
            <span className="text-slate-300">
              {room.guessMode === 'choice' ? '🎯 Multiple choice' : '🔍 Type to search'}
            </span>
          </p>
        </div>

        {/* Room code */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Room code
          </p>
          <p className="font-mono text-4xl font-black tracking-[0.3em] text-chorus-accent2">
            {room.code}
          </p>
        </div>

        <button type="button" onClick={copyInvite} className="btn-primary w-full !rounded-xl">
          {copied ? '✓ Copied invite link!' : 'Copy invite link'}
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Waiting for players… ({room.players.length})
        </div>

        <div className="w-full">
          <MultiplayerScoreboard
            scores={toScoreEntries(room)}
            selfId={selfId}
            hostId={room.hostId}
          />
        </div>

        {isHost ? (
          <button type="button" onClick={onStart} className="btn-primary w-full !rounded-xl">
            Start game →
          </button>
        ) : (
          <p className="text-sm text-slate-400">Waiting for the host to start…</p>
        )}

        {!isHost && room.players.length === 1 && (
          <p className="text-xs text-slate-500">You&apos;re first in — the host will start.</p>
        )}

        <button
          type="button"
          onClick={onLeave}
          className="btn-ghost w-full !rounded-xl !py-2 text-sm"
        >
          Leave room
        </button>
      </motion.div>
    </div>
  );
}
