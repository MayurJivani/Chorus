/**
 * Host side of join-by-sound (Beta): announces the room code out of the speaker.
 *
 * A button rather than something that starts on its own. Starting an AudioContext needs a user
 * gesture, so a press is required anyway — and a page that begins emitting sound the moment it
 * loads is a bad neighbour even when the sound is inaudible.
 */
import { useEffect, useRef, useState } from 'react';
import { announceRoom, type KnockBroadcast } from './knockJoin';
import { useGameConfig } from '../../hooks/useGameConfig';

interface KnockAnnounceButtonProps {
  code: string;
}

export function KnockAnnounceButton({ code }: KnockAnnounceButtonProps) {
  const { knockJoinEnabled } = useGameConfig();
  const [announcing, setAnnouncing] = useState(false);
  const [failed, setFailed] = useState(false);
  const txRef = useRef<KnockBroadcast | null>(null);

  // Leaving the lobby with a transmitter still running would keep the tab making noise.
  useEffect(() => {
    return () => {
      txRef.current?.stop();
      txRef.current = null;
    };
  }, []);

  if (!knockJoinEnabled) return null;

  const toggle = async () => {
    if (txRef.current) {
      txRef.current.stop();
      txRef.current = null;
      setAnnouncing(false);
      return;
    }
    setFailed(false);
    try {
      txRef.current = await announceRoom(code);
      setAnnouncing(true);
    } catch {
      // Autoplay policy, a missing AudioContext, or an output device that refuses the rate.
      // The room code is on screen regardless, so this is a lost convenience, not a dead end.
      setFailed(true);
    }
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        className={
          'flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-95 ' +
          (announcing
            ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
            : 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]')
        }
      >
        <span aria-hidden="true">{announcing ? '📡' : '🔉'}</span>
        {announcing ? 'Announcing — phones nearby can join' : 'Announce this room by sound'}
        <span className="rounded-full border border-chorusify-accent2/40 px-1.5 text-[9px] font-bold uppercase tracking-wider text-chorusify-accent2">
          Beta
        </span>
      </button>
      <p className="text-center text-[11px] text-slate-500">
        {failed
          ? 'This device would not play the signal. Share the code instead.'
          : 'Silent — above hearing. Everyone still needs the join page open.'}
      </p>
    </div>
  );
}
