import { useEffect, useRef, useState } from 'react';

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
let mediaUnlocked = false;

function deterministicRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 10000) / 10000;
}

function unlockMedia() {
  if (mediaUnlocked) return;
  const a = new Audio(SILENT_WAV);
  a.volume = 0;
  a.play()
    .then(() => {
      a.pause();
      mediaUnlocked = true;
    })
    .catch(() => {});
  document.removeEventListener('click', unlockMedia, true);
  document.removeEventListener('touchstart', unlockMedia, true);
  document.removeEventListener('keydown', unlockMedia, true);
}

document.addEventListener('click', unlockMedia, true);
document.addEventListener('touchstart', unlockMedia, true);
document.addEventListener('keydown', unlockMedia, true);

interface SnippetPlayerProps {
  previewUrl: string;
  stageSeconds: number;
  disabled?: boolean;
  artistPictureUrl?: string | null;
  onSnippetEnd?: () => void;
  /** When true the snippet auto-plays (e.g. after a skip in choice mode). */
  autoPlay?: boolean;
  /** A changing value that triggers a (re)play — used by multiplayer rounds, where each
   *  player reveals more of their own snippet on demand and the new length replays. */
  playSignal?: number;
  /** When set, the snippet always starts at this offset instead of a random one, so all
   *  players hear the same slice of the clip (used for fair multiplayer rounds). */
  fixedOffsetSeconds?: number;
}

/** Plays a snippet of the Deezer preview clip (from a fixed offset when provided,
 *  otherwise a random offset with enough headroom for the full 16s snippet), for exactly
 *  `stageSeconds`, with a rotating vinyl record visual. The offset is picked once per play
 *  and stays consistent across stages within the same round so the player always hears the
 *  same slice. */
export function SnippetPlayer({
  previewUrl,
  stageSeconds,
  disabled,
  artistPictureUrl,
  autoPlay,
  playSignal,
  fixedOffsetSeconds,
}: SnippetPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekOffsetRef = useRef<number>(0);
  /** Audio position at which the current play must stop; null when not playing. */
  const playUntilRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  /** The browser refused to start playback without a gesture. */
  const [blocked, setBlocked] = useState(false);
  const [volume, setVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('snippet-volume');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed)) return parsed;
      }
    } catch {
      /* localStorage unavailable */
    }
    return 0.5;
  });

  // Sync volume to audio element and persist to localStorage
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    try {
      localStorage.setItem('snippet-volume', String(volume));
    } catch {
      /* localStorage unavailable */
    }
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      // Pause on the way out as well as clearing the timer. Clearing alone left a playing
      // element with nothing scheduled to stop it, so it ran to the end of the clip — which
      // in multiplayer meant a player heard the whole song instead of their one-second slice.
      audio?.pause();
    };
  }, []);

  // Pick the offset once per previewUrl change (i.e. per round). With fixedOffsetSeconds
  // set, everyone hears the same slice; otherwise a random offset is picked.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const pickOffset = () => {
      const duration = audio.duration;
      if (fixedOffsetSeconds != null) {
        seekOffsetRef.current =
          isFinite(duration) && duration > 0
            ? Math.min(fixedOffsetSeconds, Math.max(0, duration - 1))
            : fixedOffsetSeconds;
      } else if (isFinite(duration) && duration > 16) {
        seekOffsetRef.current = deterministicRandom(previewUrl) * (duration - 16);
      } else {
        seekOffsetRef.current = 0;
      }
    };

    // If metadata is already loaded, pick now; otherwise wait.
    if (audio.readyState >= 1) {
      pickOffset();
    } else {
      audio.addEventListener('loadedmetadata', pickOffset, { once: true });
      return () => audio.removeEventListener('loadedmetadata', pickOffset);
    }
  }, [previewUrl, fixedOffsetSeconds]);

  // Auto-play when the autoPlay prop becomes true (e.g. after a skip in choice mode).
  const prevAutoPlayRef = useRef(autoPlay);
  useEffect(() => {
    if (autoPlay && !prevAutoPlayRef.current && !disabled) {
      handlePlay();
    }
    prevAutoPlayRef.current = autoPlay;
  }, [autoPlay, disabled]);

  // Auto-play whenever a player reveals a new snippet stage (multiplayer). Each change
  // in playSignal triggers exactly one play; disabled blocks it (e.g. during the reveal).
  const lastPlaySignalRef = useRef<number | null>(null);
  useEffect(() => {
    if (playSignal == null) return;
    if (playSignal !== lastPlaySignalRef.current) {
      lastPlaySignalRef.current = playSignal;
      if (!disabled) handlePlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSignal, disabled]);

  const handlePlay = () => {
    const audio = audioRef.current;
    if (!audio || disabled) return;

    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);

    const startAt = seekOffsetRef.current;
    audio.currentTime = startAt;
    // The hard limit is a position in the clip, not a wall-clock delay. A timer alone is only
    // as reliable as its scheduling — anything that cleared it (an unmount, a re-render) left
    // playback running to the end of the preview, handing the player the entire song.
    playUntilRef.current = startAt + stageSeconds;

    setBlocked(false);
    void audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        setIsPlaying(false);
        setBlocked(true);
      });

    stopTimeoutRef.current = setTimeout(() => stopPlayback(), stageSeconds * 1000);
  };

  const stopPlayback = () => {
    const audio = audioRef.current;
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    playUntilRef.current = null;
    audio?.pause();
    setIsPlaying(false);
  };

  /** Backstop for the timer: whatever happens to the scheduled stop, playback can never run
   *  past the stage's slice of the clip. */
  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    const limit = playUntilRef.current;
    if (!audio || limit == null) return;
    if (audio.currentTime >= limit) stopPlayback();
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <audio
        ref={audioRef}
        src={previewUrl}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Vinyl Record Player Container */}
      <div className="relative">
        {isPlaying && (
          <span
            className="absolute inset-0 rounded-full pointer-events-none scale-110 animate-pulse"
            style={{
              boxShadow: '0 0 30px rgba(139, 92, 246, 0.5), 0 0 60px rgba(139, 92, 246, 0.25)',
            }}
          />
        )}
        <div
          onClick={handlePlay}
          className={
            'relative cursor-pointer select-none ' +
            // Stepped down on small screens: at 192px the record plus the transport, pips,
            // input and guess list overflowed a 375x812 viewport and cut off the Skip button.
            'w-32 h-32 sm:w-48 sm:h-48 lg:w-56 lg:h-56 rounded-full ' +
            'shadow-[0_20px_50px_rgba(0,0,0,0.6)] border-4 border-neutral-900 ' +
            'transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] ' +
            (isPlaying ? 'animate-[spin_12s_linear_infinite]' : '') +
            (disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : '')
          }
          style={{
            background: `
              radial-gradient(circle,
                #151515 0%,
                #1d1d1d 20%,
                #0a0a0a 30%,
                #1c1c1c 40%,
                #050505 50%,
                #181818 60%,
                #000 65%,
                #222 72%,
                #0a0a0a 82%,
                #181818 100%
              )
            `,
          }}
          aria-label={isPlaying ? 'Playing snippet' : 'Play snippet'}
        >
          {/* Inner label with artist picture */}
          <div className="absolute inset-[30%] rounded-full border-[3px] border-neutral-950 bg-neutral-900 shadow-[inset_0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden">
            {artistPictureUrl ? (
              <img
                src={artistPictureUrl}
                alt=""
                className="absolute inset-0 h-full w-full rounded-full object-cover"
              />
            ) : (
              <span className="text-2xl sm:text-3xl select-none" aria-hidden>
                🎵
              </span>
            )}
            {/* Center spindle hole */}
            <div className="absolute w-2 h-2 rounded-full bg-neutral-950 border border-neutral-800 z-20 shadow-md" />
            <div className="absolute inset-0 bg-black/10 mix-blend-overlay pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Play capsule with play button and soundwave visualizer */}
      <div className="flex items-center gap-4 bg-white/[0.04] border border-white/[0.08] rounded-full pl-3 pr-5 py-2 backdrop-blur-md shadow-lg">
        <button
          type="button"
          onClick={handlePlay}
          disabled={disabled}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-950 shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Soundwave bars */}
        <div className="flex items-end gap-1 h-7 w-28 border-l border-white/10 pl-3">
          {Array.from({ length: 14 }).map((_, i) => {
            const heights = [40, 70, 50, 90, 60, 80, 45, 75, 55, 95, 65, 85, 50, 70];
            const height = heights[i] ?? 40;
            return (
              <div
                key={i}
                className={`w-0.5 rounded-full transition-all duration-300 ${
                  isPlaying ? 'bg-chorusify-accent2 animate-pulse' : 'bg-slate-700'
                }`}
                style={{
                  height: isPlaying ? `${height}%` : '20%',
                  animationDelay: `${i * 60}ms`,
                  animationDuration: `${450 + (i % 3) * 150}ms`,
                }}
              />
            );
          })}
        </div>

        <span className="text-xs font-mono font-semibold text-slate-400">{stageSeconds}s</span>
      </div>

      {/* Autoplay refusals used to be invisible: the record span and the state said "playing"
          while nothing came out of the speakers. Most likely on a multiplayer round, which
          starts from a socket message rather than a tap. */}
      {blocked && (
        <p className="text-center text-xs text-amber-400" role="status">
          Tap the record to play. Your browser blocked audio from starting on its own.
        </p>
      )}

      {/* Volume slider */}
      <div className="flex items-center gap-2 w-full max-w-[220px]">
        {/* Speaker icon */}
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-3.5 w-3.5 shrink-0 text-slate-500"
        >
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
        </svg>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-full h-1 appearance-none rounded-full bg-white/10 cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-125"
          style={{ accentColor: '#fff' }}
          aria-label="Volume"
        />
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-3.5 w-3.5 shrink-0 text-slate-500"
        >
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
          <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
        </svg>
      </div>
    </div>
  );
}
