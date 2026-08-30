import type { MultiplayerScoreEntry } from '../../types/api';
import { useGameConfig } from '../../hooks/useGameConfig';

interface MultiplayerScoreboardProps {
  scores: MultiplayerScoreEntry[];
  selfId: string | null;
  hostId?: string | null;
  /** Shows whether each player has answered (and correctly) for the current round. */
  showRoundState?: boolean;
  /**
   * Medals for the top three instead of plain rank numbers.
   *
   * Off everywhere except the final standings on purpose: in the lobby nobody has played yet,
   * and mid-game the order is still moving, so a gold medal beside a name reads as a result
   * when it is only a snapshot.
   */
  showMedals?: boolean;
  title?: string;
}

const MEDALS = ['🥇', '🥈', '🥉'] as const;

export function MultiplayerScoreboard({
  scores,
  selfId,
  hostId,
  showRoundState = false,
  showMedals = false,
  title = 'Scoreboard',
}: MultiplayerScoreboardProps) {
  const { maxGuesses } = useGameConfig();

  return (
    <div className="glass w-full rounded-2xl p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {scores.length === 0 && (
          <li className="text-sm text-slate-500">
            No players yet. Share the room code to invite friends!
          </li>
        )}
        {scores.map((player, i) => {
          const isYou = player.playerId === selfId;
          return (
            <li
              key={player.playerId}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                isYou ? 'bg-white/10 ring-1 ring-white/20' : 'bg-white/[0.03]'
              }`}
            >
              <span className="w-6 text-center text-sm">
                {showMedals && MEDALS[i] ? (
                  MEDALS[i]
                ) : (
                  <span className="font-mono text-xs text-slate-600">{i + 1}</span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
                {player.displayName}
                {isYou && (
                  <span className="ml-2 text-[10px] font-semibold uppercase text-chorusify-accent2">
                    you
                  </span>
                )}
                {player.playerId === hostId && (
                  <span className="ml-1.5" title="Host">
                    👑
                  </span>
                )}
              </span>
              {showRoundState && (
                <span className="w-8 text-right font-mono text-xs">
                  {/*
                    Three states, not two. While a round is running the server withholds the
                    outcome, so `correctThisRound` is null for everyone who has answered —
                    treating that as falsy printed ✗ against them, telling the whole room they
                    got it wrong before anybody knew.
                  */}
                  {!player.answered ? (
                    <span className="text-slate-500" title="Reveal stage">
                      {player.stageIndex + 1}/{maxGuesses}
                    </span>
                  ) : player.correctThisRound == null ? (
                    <span className="text-chorusify-accent2" title="Locked in">
                      🔒
                    </span>
                  ) : player.correctThisRound ? (
                    <span className="text-emerald-400">✓</span>
                  ) : (
                    <span className="text-red-400">✗</span>
                  )}
                </span>
              )}
              <span className="font-mono text-sm font-semibold tabular-nums text-white">
                {player.score}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
