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

const RICKROLL_VIDEO =
  'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=0&modestbranding=1&rel=0';

const DODGE_POSITIONS: [string, string][] = [
  ['top-2', 'right-2'],
  ['bottom-2', 'right-2'],
  ['bottom-2', 'left-2'],
  ['top-2', 'left-2'],
];

export function KonamiVinylPlayer() {
  const [active, setActive] = useState(false);
  const [dodgeCount, setDodgeCount] = useState(0);
  const [shaking, setShaking] = useState(false);
  const seqRef = useRef<string[]>([]);

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
        setDodgeCount(0);
        seqRef.current = [];
      }
    },
    [active],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleClose = () => {
    if (dodgeCount < DODGE_POSITIONS.length) {
      setDodgeCount((c) => c + 1);
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      return;
    }
    setActive(false);
    setDodgeCount(0);
  };

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md"
          onClick={dodgeCount >= DODGE_POSITIONS.length ? handleClose : undefined}
        >
          <motion.div
            initial={{ scale: 0.3, rotateZ: -10 }}
            animate={{ scale: 1, rotateZ: 0 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="relative flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.p
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xs font-mono text-slate-500 tracking-widest uppercase"
            >
              You've been rickrolled
            </motion.p>

            <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
              <iframe
                width="560"
                height="315"
                src={RICKROLL_VIDEO}
                title="Never Gonna Give You Up"
                allow="autoplay; encrypted-media"
                referrerPolicy="strict-origin-when-cross-origin"
                className="block"
              />
            </div>

            <button
              onClick={handleClose}
              className={`absolute flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white z-10 ${
                dodgeCount < DODGE_POSITIONS.length
                  ? `${DODGE_POSITIONS[dodgeCount]![0] === 'top-2' ? '-top-2' : '-bottom-2'} ${DODGE_POSITIONS[dodgeCount]![1] === 'right-2' ? '-right-2' : '-left-2'}`
                  : '-top-2 -right-2'
              }`}
              style={{ transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            >
              {shaking ? (
                <motion.span
                  animate={{ rotate: [0, 360, 720] }}
                  transition={{ duration: 0.4 }}
                  className="text-xs"
                >
                  💿
                </motion.span>
              ) : (
                '✕'
              )}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
