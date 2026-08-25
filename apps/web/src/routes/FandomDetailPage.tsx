import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../hooks/useSession';
import { getFandomDetail, getMembership, joinFandom, leaveFandom } from '../api/fandom';
import { FandomCard } from '../features/fandom/FandomCard';
import type { FandomDetail, FandomInfo } from '../types/api';

function tierBadgeClass(cardStyle: string): string {
  switch (cardStyle) {
    case 'holographic':
      return 'bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 text-white';
    case 'gold':
      return 'bg-gradient-to-r from-yellow-500 to-amber-400 text-black';
    case 'silver':
      return 'bg-gradient-to-r from-slate-300 to-slate-400 text-black';
    case 'gradient':
      return 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white';
    case 'warm':
      return 'bg-gradient-to-r from-orange-500 to-amber-600 text-white';
    case 'shine':
      return 'bg-chorus-accent/25 text-chorus-accent';
    case 'flat':
      return 'bg-white/10 text-slate-300';
    default:
      return 'bg-white/5 text-slate-400';
  }
}

export function FandomDetailPage() {
  const { deezerArtistId } = useParams<{ deezerArtistId: string }>();
  const { user } = useSession();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<FandomDetail | null>(null);
  const [membership, setMembership] = useState<FandomInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    if (!deezerArtistId) return;
    setLoading(true);
    Promise.all([
      getFandomDetail(deezerArtistId).catch(() => null),
      user
        ? getMembership(deezerArtistId)
            .then((r) => r.membership)
            .catch(() => null)
        : null,
    ]).then(([d, m]) => {
      setDetail(d);
      setMembership(m);
      setLoading(false);
    });
  }, [deezerArtistId, user]);

  const handleJoin = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!detail || !deezerArtistId) return;
    setActing(true);
    try {
      const { membership: m } = await joinFandom(
        deezerArtistId,
        detail.artistName,
        detail.artistPictureUrl,
      );
      setMembership(m);
      const d = await getFandomDetail(deezerArtistId).catch(() => null);
      if (d) setDetail(d);
    } finally {
      setActing(false);
    }
  };

  const handleLeave = async () => {
    if (!deezerArtistId) return;
    setActing(true);
    try {
      await leaveFandom(deezerArtistId);
      setMembership(null);
      setShowCard(false);
      const d = await getFandomDetail(deezerArtistId).catch(() => null);
      if (d) setDetail(d);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <span className="text-sm text-slate-400">Loading...</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4">
        <p className="text-slate-400">This fandom doesn't exist yet.</p>
        <Link to="/fandoms" className="text-sm text-chorus-accent hover:underline">
          Browse fandoms
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/fandoms"
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
        >
          Back
        </Link>
        {detail.artistPictureUrl ? (
          <img
            src={detail.artistPictureUrl}
            alt=""
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-slate-300">
            {detail.artistName.charAt(0)}
          </span>
        )}
        <div className="flex flex-1 flex-col">
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xl font-extrabold text-white"
          >
            {detail.fandomName}
          </motion.h1>
          <span className="text-sm text-slate-400">
            {detail.artistName} &middot; {detail.memberCount}{' '}
            {detail.memberCount === 1 ? 'member' : 'members'}
          </span>
        </div>
      </div>

      {/* Membership card */}
      {membership ? (
        <div className="rounded-xl border border-chorus-accent/20 bg-chorus-accent/5 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">
                {membership.tier} &middot; #{membership.rank} of {membership.memberCount}
              </span>
              <span className="text-xs text-slate-400">
                {membership.fanScore} fan points &middot;{' '}
                <span
                  className={
                    'inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold ' +
                    tierBadgeClass(membership.cardStyle)
                  }
                >
                  {membership.rarity}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCard((v) => !v)}
                className="rounded-lg border border-chorus-accent/30 px-3 py-1.5 text-xs font-medium text-chorus-accent transition-colors hover:bg-chorus-accent/10"
              >
                {showCard ? 'Hide card' : 'View card'}
              </button>
              <button
                onClick={handleLeave}
                disabled={acting}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-red-400 hover:border-red-400/30"
              >
                {acting ? '...' : 'Leave'}
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={`/artist/${deezerArtistId}/play`}
              className="inline-block rounded-lg bg-chorus-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-chorus-accent/80"
            >
              Play to earn fan points
            </Link>
          </div>
        </div>
      ) : (
        <button
          onClick={handleJoin}
          disabled={acting}
          className="rounded-xl bg-chorus-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-chorus-accent/80 disabled:opacity-50"
        >
          {acting ? 'Joining...' : `Join ${detail.fandomName}`}
        </button>
      )}

      {/* Shareable collectible card */}
      {showCard && membership && user && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex justify-center"
        >
          <FandomCard membership={membership} displayName={user.displayName} />
        </motion.div>
      )}

      {/* Leaderboard */}
      {detail.leaderboard.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Leaderboard
          </h2>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
            {detail.leaderboard.map((entry) => {
              const isYou = user?.id === entry.userId;
              return (
                <div
                  key={entry.userId}
                  className={
                    'flex items-center gap-3 px-4 py-3 ' + (isYou ? 'bg-chorus-accent/5' : '')
                  }
                >
                  <span className="w-8 shrink-0 text-center text-sm font-bold text-slate-400">
                    #{entry.rank}
                  </span>
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="truncate text-sm font-medium text-white">
                      {entry.displayName}
                      {isYou && (
                        <span className="ml-1.5 text-chorus-accent text-[10px]">(you)</span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-500">{entry.tier}</span>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-sm font-semibold text-white">{entry.fanScore}</span>
                    <span
                      className={
                        'rounded-full px-1.5 py-0.5 text-[9px] font-bold ' +
                        tierBadgeClass(entry.cardStyle)
                      }
                    >
                      {entry.rarity}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
