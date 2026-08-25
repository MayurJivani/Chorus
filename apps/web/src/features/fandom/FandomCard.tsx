import { useRef } from 'react';
import type { FandomInfo } from '../../types/api';

const CARD_STYLES: Record<string, { bg: string; border: string; foil: string; badge: string }> = {
  holographic: {
    bg: 'bg-gradient-to-br from-purple-900/80 via-indigo-900/80 to-cyan-900/80',
    border: 'border-purple-400/60',
    foil: 'holographic-foil',
    badge: 'bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 text-white',
  },
  gold: {
    bg: 'bg-gradient-to-br from-yellow-900/80 via-amber-800/80 to-yellow-700/80',
    border: 'border-yellow-500/60',
    foil: 'gold-foil',
    badge: 'bg-gradient-to-r from-yellow-500 to-amber-400 text-black',
  },
  silver: {
    bg: 'bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-500/80',
    border: 'border-slate-300/50',
    foil: 'silver-foil',
    badge: 'bg-gradient-to-r from-slate-300 to-slate-400 text-black',
  },
  gradient: {
    bg: 'bg-gradient-to-br from-violet-900/80 via-purple-800/80 to-fuchsia-900/80',
    border: 'border-violet-400/40',
    foil: 'gradient-foil',
    badge: 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white',
  },
  warm: {
    bg: 'bg-gradient-to-br from-orange-900/80 via-amber-800/80 to-red-900/80',
    border: 'border-orange-400/40',
    foil: 'warm-foil',
    badge: 'bg-gradient-to-r from-orange-500 to-amber-600 text-white',
  },
  shine: {
    bg: 'bg-gradient-to-br from-indigo-900/60 via-purple-900/60 to-violet-900/60',
    border: 'border-chorus-accent/30',
    foil: '',
    badge: 'bg-chorus-accent/25 text-chorus-accent',
  },
  flat: {
    bg: 'bg-gradient-to-br from-slate-800/80 to-slate-900/80',
    border: 'border-white/10',
    foil: '',
    badge: 'bg-white/10 text-slate-300',
  },
  basic: {
    bg: 'bg-slate-900/80',
    border: 'border-white/5',
    foil: '',
    badge: 'bg-white/5 text-slate-400',
  },
};

interface FandomCardProps {
  membership: FandomInfo;
  displayName: string;
}

export function FandomCard({ membership, displayName }: FandomCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const style = CARD_STYLES[membership.cardStyle] ?? CARD_STYLES.basic!;

  const handleDownload = async () => {
    const card = cardRef.current;
    if (!card) return;

    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(card, {
        backgroundColor: '#0a0a1a',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `${membership.fandomName}-${membership.tier}-card.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // html2canvas not available — fall back to clipboard
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={cardRef}
        className={
          'relative w-72 overflow-hidden rounded-2xl border-2 p-5 ' + style.bg + ' ' + style.border
        }
        style={{ aspectRatio: '3/4' }}
      >
        {/* Foil overlay */}
        {style.foil && <div className={'absolute inset-0 pointer-events-none ' + style.foil} />}

        {/* Vinyl grooves decoration */}
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border-[12px] border-white/[0.04] opacity-60" />
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full border-[6px] border-white/[0.03]" />
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full border-[3px] border-white/[0.02]" />

        {/* Content */}
        <div className="relative z-10 flex h-full flex-col items-center justify-between text-center">
          {/* Top badge */}
          <div className="flex items-center gap-1.5 self-start">
            <span className={'rounded-full px-2.5 py-1 text-[10px] font-bold ' + style.badge}>
              {membership.rarity}
            </span>
            <span className="text-[10px] font-medium text-white/40">{membership.tier}</span>
          </div>

          {/* Artist image */}
          <div className="my-3 flex flex-col items-center gap-2">
            {membership.artistPictureUrl ? (
              <img
                src={membership.artistPictureUrl}
                alt=""
                className="h-24 w-24 rounded-full object-cover ring-2 ring-white/20"
                crossOrigin="anonymous"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-bold text-white/60 ring-2 ring-white/20">
                {membership.artistName.charAt(0)}
              </span>
            )}
            <h3 className="text-lg font-extrabold text-white drop-shadow-lg">
              {membership.fandomName}
            </h3>
            <span className="text-xs text-white/50">{membership.artistName}</span>
          </div>

          {/* Stats */}
          <div className="w-full space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Player</span>
              <span className="font-semibold text-white">{displayName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Rank</span>
              <span className="font-semibold text-white">
                #{membership.rank} / {membership.memberCount}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Fan Score</span>
              <span className="font-semibold text-white">{membership.fanScore}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium uppercase tracking-widest text-white/30">
                Chorusify
              </span>
              <span className="font-mono text-[8px] text-white/25">{membership.fanCode}</span>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleDownload}
        className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
      >
        Download card
      </button>

      <style>{`
        .holographic-foil {
          background: linear-gradient(
            125deg,
            rgba(255,0,255,0.08) 0%,
            rgba(0,255,255,0.08) 20%,
            rgba(255,255,0,0.06) 40%,
            rgba(255,0,255,0.08) 60%,
            rgba(0,255,255,0.08) 80%,
            rgba(255,0,255,0.06) 100%
          );
          animation: foil-shift 4s ease-in-out infinite;
        }
        .gold-foil {
          background: linear-gradient(
            125deg,
            rgba(255,215,0,0.12) 0%,
            rgba(255,165,0,0.06) 30%,
            rgba(255,215,0,0.12) 50%,
            rgba(255,165,0,0.06) 70%,
            rgba(255,215,0,0.12) 100%
          );
          animation: foil-shift 5s ease-in-out infinite;
        }
        .silver-foil {
          background: linear-gradient(
            125deg,
            rgba(192,192,192,0.12) 0%,
            rgba(220,220,220,0.06) 30%,
            rgba(192,192,192,0.12) 50%,
            rgba(220,220,220,0.06) 70%,
            rgba(192,192,192,0.12) 100%
          );
          animation: foil-shift 5s ease-in-out infinite;
        }
        .gradient-foil {
          background: linear-gradient(
            125deg,
            rgba(139,92,246,0.1) 0%,
            rgba(217,70,239,0.06) 50%,
            rgba(139,92,246,0.1) 100%
          );
          animation: foil-shift 6s ease-in-out infinite;
        }
        .warm-foil {
          background: linear-gradient(
            125deg,
            rgba(249,115,22,0.1) 0%,
            rgba(245,158,11,0.06) 50%,
            rgba(249,115,22,0.1) 100%
          );
          animation: foil-shift 6s ease-in-out infinite;
        }
        @keyframes foil-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}
