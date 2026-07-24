interface StreakFlameProps {
  streak: number;
}

export function StreakFlame({ streak }: StreakFlameProps) {
  const isActive = streak > 0;

  return (
    <div className="flex items-center gap-2">
      <span className={`text-2xl ${isActive ? '' : 'opacity-30 grayscale'}`}>🔥</span>
      <span className="text-xl font-semibold text-slate-100">{streak}</span>
      <span className="text-sm text-slate-400">day streak</span>
    </div>
  );
}
