import { useRef, useState, useCallback, useEffect } from 'react';
import type { FandomInfo } from '../../types/api';

// --- Music media SVG decorations per rarity ---

function VinylSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="56" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <circle cx="60" cy="60" r="48" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <circle cx="60" cy="60" r="40" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      <circle cx="60" cy="60" r="32" stroke="currentColor" strokeWidth="1" opacity="0.15" />
      <circle cx="60" cy="60" r="24" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <circle cx="60" cy="60" r="12" fill="currentColor" opacity="0.15" />
      <circle cx="60" cy="60" r="4" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function CassetteSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="4"
        y="4"
        width="112"
        height="82"
        rx="6"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.5"
      />
      <rect
        x="14"
        y="14"
        width="92"
        height="40"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.3"
      />
      <circle cx="38" cy="34" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <circle cx="82" cy="34" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <circle cx="38" cy="34" r="4" fill="currentColor" opacity="0.2" />
      <circle cx="82" cy="34" r="4" fill="currentColor" opacity="0.2" />
      <line x1="50" y1="34" x2="70" y2="34" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      <path d="M30 68 L42 58 H78 L90 68" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}

function CDDiscSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="56" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <circle cx="60" cy="60" r="52" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
      <circle cx="60" cy="60" r="44" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
      <circle cx="60" cy="60" r="36" stroke="currentColor" strokeWidth="0.5" opacity="0.1" />
      <circle cx="60" cy="60" r="16" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <circle cx="60" cy="60" r="8" fill="currentColor" opacity="0.12" />
      <path d="M60 4 A56 56 0 0 1 116 60" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
      <path d="M60 4 A56 56 0 0 0 4 60" stroke="currentColor" strokeWidth="0.5" opacity="0.1" />
    </svg>
  );
}

function TicketSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 60" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 4 H96 V20 A8 8 0 0 0 96 36 V56 H4 V36 A8 8 0 0 0 4 20 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.4"
        strokeDasharray="4 2"
      />
      <line
        x1="30"
        y1="4"
        x2="30"
        y2="56"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.15"
        strokeDasharray="3 3"
      />
      <rect x="38" y="16" width="50" height="4" rx="2" fill="currentColor" opacity="0.1" />
      <rect x="38" y="26" width="36" height="3" rx="1.5" fill="currentColor" opacity="0.08" />
      <rect x="38" y="36" width="44" height="3" rx="1.5" fill="currentColor" opacity="0.06" />
    </svg>
  );
}

function mediaDecoration(cardStyle: string) {
  const base = 'absolute text-white/[0.12] pointer-events-none';
  switch (cardStyle) {
    case 'holographic':
    case 'flat':
      return <VinylSVG className={`${base} -right-6 -top-6 w-36 h-36`} />;
    case 'gold':
      return <VinylSVG className={`${base} -right-6 -top-6 w-36 h-36`} />;
    case 'silver':
    case 'warm':
      return <CassetteSVG className={`${base} -right-4 -top-2 w-32 h-24 rotate-12`} />;
    case 'gradient':
      return <VinylSVG className={`${base} -right-6 -top-6 w-36 h-36`} />;
    case 'shine':
      return <CDDiscSVG className={`${base} -right-6 -top-6 w-36 h-36`} />;
    case 'basic':
      return <TicketSVG className={`${base} -right-2 -top-1 w-28 h-20 rotate-6`} />;
    default:
      return null;
  }
}

// --- Sparkle overlay for higher tiers ---

function SparkleOverlay({ intensity }: { intensity: number }) {
  const sparkles = Array.from({ length: intensity }, (_, i) => ({
    id: i,
    left: `${(i * 37 + 13) % 100}%`,
    top: `${(i * 53 + 7) % 100}%`,
    delay: `${(i * 0.4) % 3}s`,
    size: 2 + (i % 3),
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
      {sparkles.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full sparkle-dot"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}

// --- Card style configs with vibrant colors ---

const CARD_STYLES: Record<
  string,
  {
    bg: string;
    border: string;
    badge: string;
    glowColor: string;
    sparkleCount: number;
    useArtistHolo: boolean;
  }
> = {
  holographic: {
    bg: 'linear-gradient(135deg, #2d1b69 0%, #1a0a3e 20%, #0d2847 40%, #1b3a5c 60%, #2d1b69 80%, #3d1f8a 100%)',
    border: 'border-[2px] border-transparent',
    badge: 'bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-yellow-400 text-white',
    glowColor: 'rgba(168, 85, 247, 0.4)',
    sparkleCount: 20,
    useArtistHolo: true,
  },
  gold: {
    bg: 'linear-gradient(135deg, #4a3000 0%, #7a5500 30%, #9a7000 50%, #7a5500 70%, #4a3000 100%)',
    border: 'border-[2px] border-transparent',
    badge: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    sparkleCount: 15,
    useArtistHolo: true,
  },
  silver: {
    bg: 'linear-gradient(135deg, #1a2332 0%, #2a3a4d 30%, #3d4f63 50%, #2a3a4d 70%, #1a2332 100%)',
    border: 'border-[2px] border-transparent',
    badge: 'bg-gradient-to-r from-slate-200 to-slate-400 text-slate-900 font-bold',
    glowColor: 'rgba(148, 163, 184, 0.3)',
    sparkleCount: 12,
    useArtistHolo: true,
  },
  gradient: {
    bg: 'linear-gradient(135deg, #3b0764 0%, #581c87 30%, #7c3aed 50%, #581c87 70%, #3b0764 100%)',
    border: 'border-[2px] border-violet-500/40',
    badge: 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white',
    glowColor: 'rgba(139, 92, 246, 0.3)',
    sparkleCount: 8,
    useArtistHolo: false,
  },
  warm: {
    bg: 'linear-gradient(135deg, #431407 0%, #7c2d12 30%, #c2410c 50%, #7c2d12 70%, #431407 100%)',
    border: 'border-[2px] border-orange-500/40',
    badge: 'bg-gradient-to-r from-orange-500 to-red-500 text-white',
    glowColor: 'rgba(249, 115, 22, 0.3)',
    sparkleCount: 6,
    useArtistHolo: false,
  },
  shine: {
    bg: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
    border: 'border-[2px] border-indigo-500/30',
    badge: 'bg-indigo-500/30 text-indigo-300',
    glowColor: 'rgba(99, 102, 241, 0.2)',
    sparkleCount: 4,
    useArtistHolo: false,
  },
  flat: {
    bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    border: 'border border-white/10',
    badge: 'bg-white/10 text-slate-300',
    glowColor: 'transparent',
    sparkleCount: 0,
    useArtistHolo: false,
  },
  basic: {
    bg: 'linear-gradient(135deg, #0c0a09 0%, #1c1917 50%, #0c0a09 100%)',
    border: 'border border-white/5',
    badge: 'bg-white/5 text-slate-500',
    glowColor: 'transparent',
    sparkleCount: 0,
    useArtistHolo: false,
  },
};

interface FandomCardProps {
  membership: FandomInfo;
  displayName: string;
}

export function FandomCard({ membership, displayName }: FandomCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [isHovered, setIsHovered] = useState(false);
  const rafRef = useRef<number>(0);

  const style = CARD_STYLES[membership.cardStyle] ?? CARD_STYLES.basic!;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      setMousePos({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    });
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleDownload = async () => {
    const card = cardRef.current;
    if (!card) return;

    const savedTransform = card.style.transform;
    const savedTransition = card.style.transition;
    const parent = card.parentElement;
    const savedPerspective = parent?.style.perspective ?? '';
    const savedPreserve = parent?.style.transformStyle ?? '';

    try {
      card.style.transform = 'none';
      card.style.transition = 'none';
      if (parent) {
        parent.style.perspective = 'none';
        parent.style.transformStyle = 'flat';
      }

      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(card, {
        pixelRatio: 2,
        backgroundColor: '#0a0a1a',
      });
      const link = document.createElement('a');
      link.download = `${membership.fandomName}-${membership.tier}-card.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Card download failed:', err);
    } finally {
      card.style.transform = savedTransform;
      card.style.transition = savedTransition;
      if (parent) {
        parent.style.perspective = savedPerspective;
        parent.style.transformStyle = savedPreserve;
      }
    }
  };

  const holoX = mousePos.x * 100;
  const holoY = mousePos.y * 100;
  const rotateX = isHovered ? (mousePos.y - 0.5) * -15 : 0;
  const rotateY = isHovered ? (mousePos.x - 0.5) * 15 : 0;

  const hasHoloEffect = ['holographic', 'gold', 'silver', 'gradient', 'warm'].includes(
    membership.cardStyle,
  );
  const rainbowAngle = Math.atan2(mousePos.y - 0.5, mousePos.x - 0.5) * (180 / Math.PI);

  const borderGradient =
    membership.cardStyle === 'holographic'
      ? `linear-gradient(${rainbowAngle + 90}deg, #f0abfc, #67e8f9, #fde047, #f0abfc)`
      : membership.cardStyle === 'gold'
        ? `linear-gradient(${rainbowAngle + 90}deg, #fbbf24, #f59e0b, #d97706, #fbbf24)`
        : membership.cardStyle === 'silver'
          ? `linear-gradient(${rainbowAngle + 90}deg, #94a3b8, #e2e8f0, #cbd5e1, #94a3b8)`
          : undefined;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        style={{
          perspective: '800px',
          transformStyle: 'preserve-3d',
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setMousePos({ x: 0.5, y: 0.5 });
        }}
      >
        <div
          ref={cardRef}
          className={`relative w-72 overflow-hidden rounded-2xl ${style.border} p-5`}
          style={{
            aspectRatio: '3/4',
            background: style.bg,
            transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
            transition: isHovered ? 'transform 0.1s ease-out' : 'transform 0.4s ease-out',
            boxShadow: isHovered
              ? `0 20px 60px ${style.glowColor}, 0 0 40px ${style.glowColor}`
              : `0 10px 30px rgba(0,0,0,0.5)`,
            ...(borderGradient
              ? {
                  borderImage: borderGradient,
                  borderImageSlice: 1,
                }
              : {}),
          }}
        >
          {/* Holo rainbow overlay — follows mouse */}
          {hasHoloEffect && (
            <div
              className="absolute inset-0 pointer-events-none z-[1] mix-blend-overlay"
              style={{
                background: `radial-gradient(circle at ${holoX}% ${holoY}%,
                  rgba(255,0,255,${isHovered ? 0.25 : 0.08}) 0%,
                  rgba(0,255,255,${isHovered ? 0.2 : 0.06}) 25%,
                  rgba(255,255,0,${isHovered ? 0.15 : 0.04}) 50%,
                  rgba(255,0,255,${isHovered ? 0.1 : 0.02}) 75%,
                  transparent 100%)`,
                opacity: isHovered ? 1 : 0.5,
                transition: 'opacity 0.3s',
              }}
            />
          )}

          {/* Rainbow shimmer band — sweeps across on hover */}
          {hasHoloEffect && isHovered && (
            <div
              className="absolute inset-0 pointer-events-none z-[1]"
              style={{
                background: `linear-gradient(${rainbowAngle}deg,
                  transparent 0%,
                  rgba(255,255,255,0.08) 40%,
                  rgba(255,255,255,0.15) 50%,
                  rgba(255,255,255,0.08) 60%,
                  transparent 100%)`,
                backgroundSize: '200% 200%',
                backgroundPosition: `${holoX}% ${holoY}%`,
              }}
            />
          )}

          {/* Artist image holo background for top 3 tiers */}
          {style.useArtistHolo && membership.artistPictureUrl && (
            <div
              className="absolute inset-0 pointer-events-none z-[0]"
              style={{
                backgroundImage: `url(${membership.artistPictureUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: isHovered ? 0.18 : 0.08,
                filter: `blur(2px) saturate(1.5) hue-rotate(${mousePos.x * 60 - 30}deg)`,
                mixBlendMode: 'luminosity',
                transition: 'opacity 0.3s, filter 0.2s',
              }}
            />
          )}

          {/* Sparkle overlay */}
          {style.sparkleCount > 0 && <SparkleOverlay intensity={style.sparkleCount} />}

          {/* Media decoration (vinyl/cassette/CD/ticket) */}
          {mediaDecoration(membership.cardStyle)}

          {/* Content */}
          <div className="relative z-10 flex h-full flex-col items-center justify-between text-center">
            {/* Top badge */}
            <div className="flex items-center gap-1.5 self-start">
              <span
                className={
                  'rounded-full px-2.5 py-1 text-[10px] font-bold shadow-lg ' + style.badge
                }
              >
                {membership.rarity}
              </span>
              <span className="text-[10px] font-medium text-white/50">{membership.tier}</span>
            </div>

            {/* Artist image */}
            <div className="my-3 flex flex-col items-center gap-2">
              {membership.artistPictureUrl ? (
                <div className="relative">
                  <img
                    src={membership.artistPictureUrl}
                    alt=""
                    className="h-24 w-24 rounded-full object-cover ring-2 ring-white/30 shadow-xl"
                    crossOrigin="anonymous"
                  />
                  {hasHoloEffect && (
                    <div
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{
                        background: `radial-gradient(circle at ${holoX}% ${holoY}%, rgba(255,255,255,0.2) 0%, transparent 60%)`,
                      }}
                    />
                  )}
                </div>
              ) : (
                <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-bold text-white/60 ring-2 ring-white/30 shadow-xl">
                  {membership.artistName.charAt(0)}
                </span>
              )}
              <h3 className="text-lg font-extrabold text-white drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)]">
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
      </div>

      <button
        onClick={handleDownload}
        className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
      >
        Download card
      </button>

      <style>{`
        .sparkle-dot {
          background: white;
          animation: sparkle-pulse 2s ease-in-out infinite;
          box-shadow: 0 0 4px 1px rgba(255,255,255,0.6);
        }
        @keyframes sparkle-pulse {
          0%, 100% { opacity: 0; transform: scale(0); }
          50% { opacity: 0.9; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
