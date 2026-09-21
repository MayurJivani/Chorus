export function VinylSpinner({ size = 40, text = 'Loading...' }: { size?: number; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 cursor-vinyl">
      {/*
       * Spun by CSS rather than framer-motion: a constant rotation is exactly what `animate-spin`
       * is for, so the library bought nothing here and a major bump can no longer change how the
       * loader behaves. Duration is overridden because Tailwind's default 1s reads as a spinner
       * rather than a turntable.
       */}
      <svg
        className="animate-spin motion-reduce:animate-none"
        style={{ animationDuration: '1.5s' }}
        width={size}
        height={size}
        viewBox="0 0 40 40"
      >
        {/* Outer disc */}
        <circle cx="20" cy="20" r="19" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
        {/* Grooves */}
        <circle cx="20" cy="20" r="16" fill="none" stroke="#252525" strokeWidth="0.4" />
        <circle cx="20" cy="20" r="13" fill="none" stroke="#222" strokeWidth="0.4" />
        <circle cx="20" cy="20" r="10" fill="none" stroke="#252525" strokeWidth="0.4" />
        {/* Highlight */}
        <path
          d="M20 1 A19 19 0 0 1 39 20"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
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
      </svg>
      {text && <span className="text-sm text-slate-400 animate-pulse">{text}</span>}
    </div>
  );
}
