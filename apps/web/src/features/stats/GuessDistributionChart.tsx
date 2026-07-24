interface GuessDistributionChartProps {
  distribution: number[];
}

export function GuessDistributionChart({ distribution }: GuessDistributionChartProps) {
  const max = Math.max(1, ...distribution);

  return (
    <div className="flex w-full flex-col gap-2">
      {distribution.map((count, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-4 text-right text-xs font-mono text-slate-500">{i + 1}</span>
          <div className="h-6 flex-1 overflow-hidden rounded-full bg-chorus-bg/60">
            <div
              className="h-full rounded-full bg-chorus-gradient shadow-[0_0_6px_#22d3ee55] transition-all duration-500"
              style={{ width: `${(count / max) * 100}%`, minWidth: count > 0 ? '1.5rem' : 0 }}
            />
          </div>
          <span className="w-6 text-right text-xs font-mono font-semibold text-slate-300">
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}
