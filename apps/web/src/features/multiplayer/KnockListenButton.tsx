/**
 * Joiner side of join-by-sound (Beta): listens for a host announcing a room nearby.
 *
 * Sits beside Scan and typing as a third way into a room, and is deliberately not automatic —
 * it opens the microphone, which is not something to do to somebody who only came to type six
 * characters.
 */
import { useEffect, useRef, useState } from 'react';
import { knockProfile, listenForRoom, type KnockListener } from './knockJoin';
import { useGameConfig } from '../../hooks/useGameConfig';

type State = 'idle' | 'starting' | 'listening' | 'unusable' | 'denied';

interface KnockListenButtonProps {
  onCode: (code: string) => void;
}

export function KnockListenButton({ onCode }: KnockListenButtonProps) {
  const { knockJoinEnabled, knockJoinJingle } = useGameConfig();
  const [state, setState] = useState<State>('idle');
  const rxRef = useRef<KnockListener | null>(null);

  useEffect(() => {
    return () => {
      rxRef.current?.stop();
      rxRef.current = null;
    };
  }, []);

  if (!knockJoinEnabled) return null;

  const stop = () => {
    rxRef.current?.stop();
    rxRef.current = null;
  };

  const start = async () => {
    if (rxRef.current) {
      stop();
      setState('idle');
      return;
    }
    setState('starting');
    try {
      const rx = await listenForRoom(knockProfile(knockJoinJingle), (code) => {
        // The transmitter repeats, so this can fire more than once. Stop on the first hit,
        // otherwise the microphone stays open behind the navigation.
        stop();
        setState('idle');
        onCode(code);
      });
      rxRef.current = rx;
      /*
       * `usable: false` means the browser resampled the microphone below what the profile's
       * band needs — Firefox on the silent profile. Nothing will ever arrive, so say so
       * instead of leaving a listening spinner running forever.
       */
      setState(rx.usable ? 'listening' : 'unusable');
      if (!rx.usable) stop();
    } catch {
      // Permission refused, or no microphone at all.
      setState('denied');
    }
  };

  const label: Record<State, string> = {
    idle: 'Listen for a room nearby',
    starting: 'Starting…',
    listening: 'Listening — hold near the host screen',
    unusable: 'This browser cannot hear it',
    denied: 'Microphone unavailable',
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <button
        type="button"
        onClick={() => void start()}
        disabled={state === 'starting'}
        className={
          'flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200 active:scale-95 disabled:opacity-60 ' +
          (state === 'listening'
            ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]')
        }
      >
        <span aria-hidden="true">{state === 'listening' ? '👂' : '🔊'}</span>
        {label[state]}
        <span className="rounded-full border border-chorusify-accent2/40 px-1.5 text-[9px] font-bold uppercase tracking-wider text-chorusify-accent2">
          Beta
        </span>
      </button>
      {(state === 'unusable' || state === 'denied') && (
        <p className="text-center text-[11px] text-slate-500">
          {state === 'unusable'
            ? 'Firefox resamples the microphone too low for the silent signal. Scan or type the code.'
            : 'Allow microphone access, or scan or type the code instead.'}
        </p>
      )}
    </div>
  );
}
