import { motion } from 'framer-motion';

export function VinylSpinner({ size = 40, text = 'Loading...' }: { size?: number; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 cursor-vinyl">
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      >
        {/* Outer disc */}
        <circle cx="20" cy="20" r="19" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
        {/* Grooves */}
        <circle cx="20" cy="20" r="16" fill="none" stroke="#252525" strokeWidth="0.4" />
        <circle cx="20" cy="20" r="13" fill="none" stroke="#222" strokeWidth="0.4" />
        <circle cx="20" cy="20" r="10" fill="none" stroke="#252525" strokeWidth="0.4" />
        {/* Shimmer */}
        <path
          d="M20 1 A19 19 0 0 1 39 20"
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="19"
        />
        {/* Center label */}
        <circle cx="20" cy="20" r="6" fill="#7c3aed" />
        <circle cx="20" cy="20" r="6" fill="url(#vinyl-label-grad)" />
        {/* Spindle hole */}
        <circle cx="20" cy="20" r="2" fill="#111" />
        <defs>
          <radialGradient id="vinyl-label-grad" cx="40%" cy="40%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
      </motion.svg>
      {text && <span className="text-sm text-slate-400 animate-pulse">{text}</span>}
    </div>
  );
}
