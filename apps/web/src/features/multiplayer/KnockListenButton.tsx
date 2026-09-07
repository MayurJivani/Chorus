/**
 * Joiner side of join-by-sound (Beta): listens for a host announcing a room nearby.
 *
 * Sits beside Scan and typing as a third way into a room, and is deliberately not automatic —
 * it opens the microphone, which is not something to do to somebody who only came to type six
 * characters.
 */
import { useEffect, useRef, useState } from 'react';
import { listenForRoom, type KnockListener } from './knockJoin';
import { useGameConfig } from '../../hooks/useGameConfig';

type State = 'idle' | 'starting' | 'listening' | 'unusable' | 'denied' | 'blocked';

interface KnockListenButtonProps {
  onCode: (code: string) => void;
}

export function KnockListenButton({ onCode }: KnockListenButtonProps) {
  const { knockJoinEnabled } = useGameConfig();
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
      const rx = await listenForRoom((code) => {
        // The transmitter repeats, so this can fire more than once. Stop on the first hit,
        // otherwise the microphone stays open behind the navigation.
        stop();
        setState('idle');
        onCode(code);
      });
      rxRef.current = rx;
      /*
       * `usable: false` means the browser resampled the microphone below what the band needs
       * — Firefox, mostly. Nothing will ever arrive, so say so instead of leaving a listening
       * spinner running forever.
       */
      setState(rx.usable ? 'listening' : 'unusable');
      if (!rx.usable) stop();
    } catch (err) {
      /*
       * Only a permission failure is a permission failure.
       *
       * This used to report every error as "microphone unavailable", which was actively
       * misleading: the microphone is opened first and the AudioWorklet second, so the common
       * failure is the *worklet* being refused while permission was granted fine. Someone who
       * had just tapped Allow was told the microphone was unavailable, with nothing to act on.
       */
      const name = err instanceof Error ? err.name : '';
      setState(name === 'NotAllowedError' || name === 'NotFoundError' ? 'denied' : 'blocked');
    }
  };

  const label: Record<State, string> = {
    idle: 'Listen for a room nearby',
    starting: 'Starting…',
    listening: 'Listening — hold near the host screen',
    unusable: 'This browser cannot hear it',
    denied: 'Microphone permission needed',
    blocked: 'Audio setup failed on this device',
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
      {(state === 'unusable' || state === 'denied' || state === 'blocked') && (
        <p className="text-center text-[11px] text-slate-500">
          {state === 'unusable'
            ? 'Firefox resamples the microphone too low to hear the signal. Scan or type the code.'
            : state === 'denied'
              ? 'Allow microphone access, or scan or type the code instead.'
              : 'The browser refused the audio processor. Reload the page, or scan or type the code.'}
        </p>
      )}
    </div>
  );
}
