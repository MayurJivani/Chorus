import { FandomCard } from '../fandom/FandomCard';
import type { FandomInfo } from '../../types/api';

function zaynCard(overrides: Partial<FandomInfo> & { id: number }): FandomInfo {
  return {
    deezerArtistId: '9761322',
    artistName: 'Zayn',
    artistPictureUrl: null,
    fandomName: 'Zquad',
    fanCode: `CHR-322-${overrides.id.toString(16).toUpperCase().padStart(8, '0')}`,
    fanScore: 0,
    tier: '',
    rarity: '',
    cardStyle: '',
    rank: 1,
    memberCount: 50000,
    joinedAt: '2025-01-15T00:00:00Z',
    ...overrides,
  };
}

const PREVIEW_CARDS: { membership: FandomInfo; label: string }[] = [
  {
    label: 'Diamond — Top 0.01%',
    membership: zaynCard({
      id: 1,
      fanScore: 9500,
      tier: 'Diamond',
      rarity: 'Holographic Vinyl',
      cardStyle: 'holographic',
      rank: 1,
    }),
  },
  {
    label: 'Platinum — Top 0.1%',
    membership: zaynCard({
      id: 2,
      fanScore: 7200,
      tier: 'Platinum',
      rarity: 'Chrome Cassette',
      cardStyle: 'silver',
      rank: 5,
    }),
  },
  {
    label: 'Gold — Top 1%',
    membership: zaynCard({
      id: 3,
      fanScore: 4800,
      tier: 'Gold',
      rarity: 'Gold Vinyl',
      cardStyle: 'gold',
      rank: 120,
    }),
  },
  {
    label: 'Silver — Top 5%',
    membership: zaynCard({
      id: 4,
      fanScore: 2400,
      tier: 'Silver',
      rarity: 'Colored Vinyl',
      cardStyle: 'gradient',
      rank: 500,
    }),
  },
  {
    label: 'Bronze — Top 10%',
    membership: zaynCard({
      id: 5,
      fanScore: 1200,
      tier: 'Bronze',
      rarity: 'Cassette Tape',
      cardStyle: 'warm',
      rank: 800,
    }),
  },
  {
    label: 'Fan — Top 25%',
    membership: zaynCard({
      id: 6,
      fanScore: 600,
      tier: 'Fan',
      rarity: 'CD Disc',
      cardStyle: 'shine',
      rank: 2000,
    }),
  },
  {
    label: 'Listener — Top 50%',
    membership: zaynCard({
      id: 7,
      fanScore: 200,
      tier: 'Listener',
      rarity: 'Standard Vinyl',
      cardStyle: 'flat',
      rank: 4000,
    }),
  },
  {
    label: 'Newcomer — Bottom 50%',
    membership: zaynCard({
      id: 8,
      fanScore: 30,
      tier: 'Newcomer',
      rarity: 'Ticket Stub',
      cardStyle: 'basic',
      rank: 45000,
    }),
  },
];

export function CardsPanel() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-slate-400">
        Preview of all 8 card tiers with foil effects. These are what users see and can download
        from their fandom page.
      </p>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-items-center">
        {PREVIEW_CARDS.map((card) => (
          <div key={card.membership.cardStyle} className="flex flex-col items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">{card.label}</span>
            <FandomCard membership={card.membership} displayName="Admin Preview" />
          </div>
        ))}
      </div>
    </div>
  );
}
