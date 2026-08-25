import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

const SONGS = [
  { title: 'Never Gonna Give You Up', artist: 'Rick Astley', color: '#e74c3c' },
  { title: 'Bohemian Rhapsody', artist: 'Queen', color: '#9b59b6' },
  { title: 'Take On Me', artist: 'a-ha', color: '#3498db' },
  { title: 'Thriller', artist: 'Michael Jackson', color: '#f39c12' },
  { title: 'Sweet Child O Mine', artist: "Guns N' Roses", color: '#e67e22' },
];

export function KonamiVinylPlayer() {
  const [active, setActive] = useState(false);
  const [song] = useState(() => SONGS[Math.floor(Math.random() * SONGS.length)]!);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const seqRef = useRef<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (active) return;
      seqRef.current.push(e.key);
      if (seqRef.current.length > KONAMI.length) {
        seqRef.current = seqRef.current.slice(-KONAMI.length);
      }
      if (
        seqRef.current.length === KONAMI.length &&
        seqRef.current.every((k, i) => k === KONAMI[i])
      ) {
        setActive(true);
        seqRef.current = [];
      }
    },
    [active],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 100) {
            clearInterval(intervalRef.current);
            setPlaying(false);
            return 0;
          }
          return p + 0.5;
        });
      }, 100);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing]);

  const handleClose = () => {
    setActive(false);
    setPlaying(false);
    setProgress(0);
    clearInterval(intervalRef.current);
  };

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.3, y: 100, rotateZ: -15 }}
            animate={{ scale: 1, y: 0, rotateZ: 0 }}
            exit={{ scale: 0.3, y: 200, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="relative flex flex-col items-center gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <p className="text-xs font-mono text-slate-500 tracking-widest uppercase mb-1">
                ↑↑↓↓←→←→BA
              </p>
              <p className="text-lg font-bold text-white">You found a secret!</p>
            </motion.div>

            {/* Album sleeve */}
            <motion.div
              className="relative"
              initial={{ rotateY: 0 }}
              animate={playing ? { rotateY: 0 } : { rotateY: 0 }}
            >
              {/* Album cover */}
              <div
                className="relative h-64 w-64 rounded-2xl shadow-2xl overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${song.color}44 0%, ${song.color} 50%, ${song.color}88 100%)`,
                }}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <span className="text-5xl mb-3">🎵</span>
                  <p className="text-lg font-bold text-white drop-shadow-lg">{song.title}</p>
                  <p className="text-sm text-white/70 mt-1">{song.artist}</p>
                </div>

                {/* Vinyl peeking out */}
                <AnimatePresence>
                  {playing && (
                    <motion.div
                      initial={{ x: 0 }}
                      animate={{ x: 140 }}
                      exit={{ x: 0 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 120 }}
                      className="absolute top-1/2 left-1/2 -translate-y-1/2"
                      style={{ zIndex: -1 }}
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="h-56 w-56 rounded-full"
                        style={{
                          background: `radial-gradient(circle at center,
                            #222 0%, #222 15%,
                            #111 16%, #1a1a1a 20%,
                            #111 21%, #1a1a1a 30%,
                            #111 31%, #1a1a1a 40%,
                            #111 41%, #1a1a1a 50%,
                            #111 51%, #1a1a1a 60%,
                            #111 61%, #222 100%)`,
                          boxShadow: `0 0 40px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.3)`,
                        }}
                      >
                        {/* Center label */}
                        <div
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-20 w-20 rounded-full flex items-center justify-center"
                          style={{
                            background: `linear-gradient(135deg, ${song.color}, ${song.color}aa)`,
                          }}
                        >
                          <div className="h-3 w-3 rounded-full bg-black/60" />
                        </div>
                        {/* Grooves shimmer */}
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background:
                              'conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.03) 25%, transparent 50%, rgba(255,255,255,0.02) 75%, transparent 100%)',
                          }}
                        />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Controls */}
            <div className="flex flex-col items-center gap-3 w-64">
              {/* Progress bar */}
              {playing && (
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ width: `${progress}%`, backgroundColor: song.color }}
                  />
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setPlaying(!playing)}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95"
                >
                  {playing ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <rect x="4" y="3" width="4" height="14" rx="1" />
                      <rect x="12" y="3" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6 4l10 6-10 6V4z" />
                    </svg>
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-500 text-center">(visual only — no audio plays)</p>
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-colors"
            >
              ✕
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
