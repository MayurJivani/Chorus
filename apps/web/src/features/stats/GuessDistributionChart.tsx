interface GuessDistributionChartProps {
  distribution: number[];
}

export function GuessDistributionChart({ distribution }: GuessDistributionChartProps) {
  const max = Math.max(1, ...distribution);
  const total = distribution.reduce((sum, count) => sum + count, 0);
  // The row a player wins on most often — worth pointing out, since it is the single number
  // that says the most about how they play.
  const bestRow = total > 0 ? distribution.indexOf(max) : -1;

  return (
    <div className="flex w-full flex-col gap-2">
      {distribution.map((count, i) => {
        const share = total > 0 ? Math.round((count / total) * 100) : 0;
        const isBest = i === bestRow && count > 0;

        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-4 text-right font-mono text-xs text-slate-500">{i + 1}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-full bg-chorus-bg/60">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isBest ? 'bg-chorus-gradient shadow-[0_0_6px_#22d3ee55]' : 'bg-white/20'
                }`}
                style={{ width: `${(count / max) * 100}%`, minWidth: count > 0 ? '1.5rem' : 0 }}
              />
            </div>
            <span className="w-6 text-right font-mono text-xs font-semibold text-slate-300 tabular-nums">
              {count}
            </span>
            <span className="w-9 text-right font-mono text-[11px] text-slate-500 tabular-nums">
              {total > 0 ? `${share}%` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
