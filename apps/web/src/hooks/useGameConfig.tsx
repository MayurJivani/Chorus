import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiRequest } from '../api/client';
import { SNIPPET_SCHEDULE_SECONDS } from '../types/api';

/**
 * Game shape that an admin can change at runtime.
 *
 * The snippet schedule and guess count used to be constants compiled into the client, which
 * meant the admin dashboard could change them server-side and the UI would keep drawing six
 * pips regardless. They are fetched once at startup instead. The compiled-in values stay on as
 * the fallback, so a failed fetch degrades to the shipped defaults rather than an empty board.
 */
export interface GameConfig {
  snippetSchedule: number[];
  maxGuesses: number;
  challengeRounds: number;
}

const FALLBACK: GameConfig = {
  snippetSchedule: [...SNIPPET_SCHEDULE_SECONDS],
  maxGuesses: SNIPPET_SCHEDULE_SECONDS.length,
  challengeRounds: 10,
};

const GameConfigContext = createContext<GameConfig>(FALLBACK);

export function GameConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<GameConfig>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    apiRequest<GameConfig>('/config')
      .then((next) => {
        if (!cancelled) setConfig(next);
      })
      .catch(() => {
        // Keep the fallback — the game is still playable, it just isn't reflecting a changed
        // setting yet, and every challenge response carries its own schedule anyway.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <GameConfigContext.Provider value={config}>{children}</GameConfigContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook and its provider are tightly coupled and belong together
export function useGameConfig(): GameConfig {
  return useContext(GameConfigContext);
}
