import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { fandomMemberships, users } from '../db/schema';

// --- Percentile tiers --------------------------------------------------------------------

export function tierLabel(rank: number, memberCount: number): string {
  if (memberCount <= 1) return 'Member';
  const percentile = (rank / memberCount) * 100;
  if (percentile <= 0.01) return 'Top 0.01%';
  if (percentile <= 0.1) return 'Top 0.1%';
  if (percentile <= 1) return 'Top 1%';
  if (percentile <= 5) return 'Top 5%';
  if (percentile <= 10) return 'Top 10%';
  if (percentile <= 25) return 'Top 25%';
  if (percentile <= 50) return 'Top 50%';
  return 'Member';
}

// --- Membership --------------------------------------------------------------------------

export interface FandomInfo {
  id: number;
  deezerArtistId: string;
  artistName: string;
  artistPictureUrl: string | null;
  fanScore: number;
  tier: string;
  rank: number;
  memberCount: number;
  joinedAt: string;
}

export async function joinFandom(
  userId: string,
  deezerArtistId: string,
  artistName: string,
  artistPictureUrl: string | null,
): Promise<FandomInfo> {
  const existing = await db
    .select()
    .from(fandomMemberships)
    .where(
      and(
        eq(fandomMemberships.userId, userId),
        eq(fandomMemberships.deezerArtistId, deezerArtistId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return buildFandomInfo(existing[0]);
  }

  const [row] = await db
    .insert(fandomMemberships)
    .values({ userId, deezerArtistId, artistName, artistPictureUrl })
    .returning();

  return buildFandomInfo(row!);
}

export async function leaveFandom(userId: string, deezerArtistId: string): Promise<boolean> {
  const result = await db
    .delete(fandomMemberships)
    .where(
      and(
        eq(fandomMemberships.userId, userId),
        eq(fandomMemberships.deezerArtistId, deezerArtistId),
      ),
    )
    .returning({ id: fandomMemberships.id });

  return result.length > 0;
}

export async function getUserFandoms(userId: string): Promise<FandomInfo[]> {
  const rows = await db
    .select()
    .from(fandomMemberships)
    .where(eq(fandomMemberships.userId, userId))
    .orderBy(desc(fandomMemberships.fanScore));

  return Promise.all(rows.map(buildFandomInfo));
}

export async function getMembership(
  userId: string,
  deezerArtistId: string,
): Promise<FandomInfo | null> {
  const rows = await db
    .select()
    .from(fandomMemberships)
    .where(
      and(
        eq(fandomMemberships.userId, userId),
        eq(fandomMemberships.deezerArtistId, deezerArtistId),
      ),
    )
    .limit(1);

  return rows[0] ? buildFandomInfo(rows[0]) : null;
}

// --- Leaderboard -------------------------------------------------------------------------

export interface FandomLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  fanScore: number;
  tier: string;
  joinedAt: string;
}

export interface FandomDetail {
  deezerArtistId: string;
  artistName: string;
  artistPictureUrl: string | null;
  memberCount: number;
  leaderboard: FandomLeaderboardEntry[];
}

export async function getFandomDetail(
  deezerArtistId: string,
  limit = 50,
): Promise<FandomDetail | null> {
  const rows = await db
    .select({
      userId: fandomMemberships.userId,
      displayName: users.displayName,
      fanScore: fandomMemberships.fanScore,
      artistName: fandomMemberships.artistName,
      artistPictureUrl: fandomMemberships.artistPictureUrl,
      joinedAt: fandomMemberships.joinedAt,
    })
    .from(fandomMemberships)
    .innerJoin(users, eq(users.id, fandomMemberships.userId))
    .where(eq(fandomMemberships.deezerArtistId, deezerArtistId))
    .orderBy(desc(fandomMemberships.fanScore))
    .limit(limit);

  if (rows.length === 0) return null;

  const countRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(fandomMemberships)
    .where(eq(fandomMemberships.deezerArtistId, deezerArtistId));

  const first = rows[0]!;
  const total = countRows[0]?.count ?? 0;

  return {
    deezerArtistId,
    artistName: first.artistName,
    artistPictureUrl: first.artistPictureUrl,
    memberCount: total,
    leaderboard: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      displayName: r.displayName,
      fanScore: r.fanScore,
      tier: tierLabel(i + 1, total),
      joinedAt: r.joinedAt.toISOString(),
    })),
  };
}

// --- Fan score ----------------------------------------------------------------------------

export async function awardFanScore(
  userId: string,
  deezerArtistId: string,
  points: number,
): Promise<void> {
  if (points <= 0) return;

  await db
    .update(fandomMemberships)
    .set({
      fanScore: sql`${fandomMemberships.fanScore} + ${points}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fandomMemberships.userId, userId),
        eq(fandomMemberships.deezerArtistId, deezerArtistId),
      ),
    );
}

// --- Top fandoms (for discovery) ---------------------------------------------------------

export interface TopFandom {
  deezerArtistId: string;
  artistName: string;
  artistPictureUrl: string | null;
  memberCount: number;
}

export async function getTopFandoms(limit = 20): Promise<TopFandom[]> {
  const rows = await db
    .select({
      deezerArtistId: fandomMemberships.deezerArtistId,
      artistName: sql<string>`MIN(${fandomMemberships.artistName})`,
      artistPictureUrl: sql<string | null>`MIN(${fandomMemberships.artistPictureUrl})`,
      memberCount: sql<number>`COUNT(*)::int`,
    })
    .from(fandomMemberships)
    .groupBy(fandomMemberships.deezerArtistId)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows;
}

// --- Helpers -----------------------------------------------------------------------------

async function buildFandomInfo(row: typeof fandomMemberships.$inferSelect): Promise<FandomInfo> {
  const [rankRow] = await db
    .select({ rank: sql<number>`COUNT(*)::int + 1` })
    .from(fandomMemberships)
    .where(
      and(
        eq(fandomMemberships.deezerArtistId, row.deezerArtistId),
        sql`${fandomMemberships.fanScore} > ${row.fanScore}`,
      ),
    );

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(fandomMemberships)
    .where(eq(fandomMemberships.deezerArtistId, row.deezerArtistId));

  const rank = rankRow?.rank ?? 1;
  const members = countRow?.count ?? 1;

  return {
    id: row.id,
    deezerArtistId: row.deezerArtistId,
    artistName: row.artistName,
    artistPictureUrl: row.artistPictureUrl,
    fanScore: row.fanScore,
    tier: tierLabel(rank, members),
    rank,
    memberCount: members,
    joinedAt: row.joinedAt.toISOString(),
  };
}
