import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { fandomMemberships, users } from '../db/schema';

// --- Tiers -------------------------------------------------------------------------------

export interface TierInfo {
  name: string;
  rarity: string;
  cardStyle: string;
  percentile: number;
}

const TIERS: TierInfo[] = [
  { name: 'Diamond', rarity: 'Holographic Vinyl', cardStyle: 'holographic', percentile: 0.01 },
  { name: 'Platinum', rarity: 'Gold Vinyl', cardStyle: 'gold', percentile: 0.1 },
  { name: 'Gold', rarity: 'Chrome Cassette', cardStyle: 'silver', percentile: 1 },
  { name: 'Silver', rarity: 'Colored Vinyl', cardStyle: 'gradient', percentile: 5 },
  { name: 'Bronze', rarity: 'Cassette Tape', cardStyle: 'warm', percentile: 10 },
  { name: 'Fan', rarity: 'CD Disc', cardStyle: 'shine', percentile: 25 },
  { name: 'Listener', rarity: 'Standard Vinyl', cardStyle: 'flat', percentile: 50 },
  { name: 'Newcomer', rarity: 'Ticket Stub', cardStyle: 'basic', percentile: 100 },
];

export function tierForRank(rank: number, memberCount: number): TierInfo {
  if (memberCount <= 1) return TIERS[TIERS.length - 1]!;
  const percentile = (rank / memberCount) * 100;
  for (const tier of TIERS) {
    if (percentile <= tier.percentile) return tier;
  }
  return TIERS[TIERS.length - 1]!;
}

// --- Fandom names ------------------------------------------------------------------------

const KNOWN_FANDOMS: Record<string, string> = {
  '347': 'Swifties', // Taylor Swift
  '9761322': 'Zsquad', // Zayn
  '1562681': 'Army', // BTS
  '4050205': 'Blinks', // BLACKPINK
  '246791': 'Beliebers', // Justin Bieber
  '268': 'Selenators', // Selena Gomez
  '1188': 'Barbz', // Nicki Minaj
  '288166': 'Directioners', // One Direction
  '144227': 'Arianators', // Ariana Grande
  '13': 'Navy', // Rihanna
  '1': 'Beyhive', // Beyonce
  '75': 'Monsters', // Lady Gaga
  '12246': 'Swifties', // Taylor Swift
  '239': 'Lovatics', // Demi Lovato
  '4495513': 'Once', // TWICE
  '5313805': 'Stays', // Stray Kids
  '384236': 'Harries', // Harry Styles
  '4523895': 'Midzy', // ITZY
  '9635624': 'Engene', // ENHYPEN
  '5080602': 'Atiny', // ATEEZ
  '5552611': 'Carats', // SEVENTEEN
  '14890259': 'Moas', // TXT
  '264': 'KatyCats', // Katy Perry
  '145': 'Mixers', // Little Mix
  '4403939': 'Exols', // EXO
  '110': 'Lambs', // Mariah Carey
  '16879': 'Echelon', // Thirty Seconds to Mars
  '5': 'Deadheads', // Grateful Dead
  '15166': 'Beatlemaniacs', // The Beatles
  '27': 'Stans', // Eminem
  '130': 'The Hive', // Destiny's Child
};

export function fandomName(deezerArtistId: string, artistName: string): string {
  return KNOWN_FANDOMS[deezerArtistId] ?? `${artistName} Fans`;
}

export function fanCode(membershipId: number, deezerArtistId: string): string {
  const base = (membershipId * 2654435761) >>> 0;
  const hex = base.toString(16).toUpperCase().padStart(8, '0');
  const prefix = deezerArtistId.slice(-3).padStart(3, '0');
  return `CHR-${prefix}-${hex}`;
}

// --- Membership --------------------------------------------------------------------------

export interface FandomInfo {
  id: number;
  deezerArtistId: string;
  artistName: string;
  artistPictureUrl: string | null;
  fandomName: string;
  fanCode: string;
  fanScore: number;
  tier: string;
  rarity: string;
  cardStyle: string;
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
  rarity: string;
  cardStyle: string;
  joinedAt: string;
}

export interface FandomDetail {
  deezerArtistId: string;
  artistName: string;
  artistPictureUrl: string | null;
  fandomName: string;
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
    fandomName: fandomName(deezerArtistId, first.artistName),
    memberCount: total,
    leaderboard: rows.map((r, i) => {
      const t = tierForRank(i + 1, total);
      return {
        rank: i + 1,
        userId: r.userId,
        displayName: r.displayName,
        fanScore: r.fanScore,
        tier: t.name,
        rarity: t.rarity,
        cardStyle: t.cardStyle,
        joinedAt: r.joinedAt.toISOString(),
      };
    }),
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
  fandomName: string;
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

  return rows.map((r) => ({
    ...r,
    fandomName: fandomName(r.deezerArtistId, r.artistName),
  }));
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

  const t = tierForRank(rank, members);

  return {
    id: row.id,
    deezerArtistId: row.deezerArtistId,
    artistName: row.artistName,
    artistPictureUrl: row.artistPictureUrl,
    fandomName: fandomName(row.deezerArtistId, row.artistName),
    fanCode: fanCode(row.id, row.deezerArtistId),
    fanScore: row.fanScore,
    tier: t.name,
    rarity: t.rarity,
    cardStyle: t.cardStyle,
    rank,
    memberCount: members,
    joinedAt: row.joinedAt.toISOString(),
  };
}
