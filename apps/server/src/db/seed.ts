import { count, eq } from 'drizzle-orm';
import { db } from './client';
import { songs } from './schema';
import { isUnwantedVersion } from '../utils/trackFilters';
import { logger } from '../logger';

interface DeezerTrack {
  id: number;
  title: string;
  preview: string;
  duration: number;
  artist: { name: string };
  album?: { cover_medium?: string };
}

interface DeezerSearchResponse {
  data: DeezerTrack[];
}

const SONG_CANDIDATES = [
  { title: 'Bohemian Rhapsody', artist: 'Queen' },
  { title: 'Billie Jean', artist: 'Michael Jackson' },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana' },
  { title: 'Hotel California', artist: 'Eagles' },
  { title: 'Like a Rolling Stone', artist: 'Bob Dylan' },
  { title: 'Imagine', artist: 'John Lennon' },
  { title: "Sweet Child O' Mine", artist: "Guns N' Roses" },
  { title: 'Stairway to Heaven', artist: 'Led Zeppelin' },
  { title: "What's Going On", artist: 'Marvin Gaye' },
  { title: 'Good Vibrations', artist: 'The Beach Boys' },
  { title: 'Respect', artist: 'Aretha Franklin' },
  { title: 'Superstition', artist: 'Stevie Wonder' },
  { title: 'I Want to Hold Your Hand', artist: 'The Beatles' },
  { title: 'Purple Haze', artist: 'Jimi Hendrix' },
  { title: 'Waterloo', artist: 'ABBA' },
  { title: 'Le Freak', artist: 'Chic' },
  { title: 'Another Brick in the Wall', artist: 'Pink Floyd' },
  { title: "Livin' on a Prayer", artist: 'Bon Jovi' },
  { title: 'Africa', artist: 'Toto' },
  { title: 'Every Breath You Take', artist: 'The Police' },
  { title: 'Beat It', artist: 'Michael Jackson' },
  { title: 'Take On Me', artist: 'a-ha' },
  { title: 'Girls Just Want to Have Fun', artist: 'Cyndi Lauper' },
  { title: 'Sweet Dreams', artist: 'Eurythmics' },
  { title: 'Under Pressure', artist: 'Queen' },
  { title: "Don't Stop Believin'", artist: 'Journey' },
  { title: 'Every Rose Has Its Thorn', artist: 'Poison' },
  { title: 'Nothing Compares 2 U', artist: "Sinead O'Connor" },
  { title: 'Losing My Religion', artist: 'R.E.M.' },
  { title: 'Wonderwall', artist: 'Oasis' },
  { title: 'Creep', artist: 'Radiohead' },
  { title: 'No Scrubs', artist: 'TLC' },
  { title: 'Waterfalls', artist: 'TLC' },
  { title: 'I Want It That Way', artist: 'Backstreet Boys' },
  { title: '...Baby One More Time', artist: 'Britney Spears' },
  { title: 'Torn', artist: 'Natalie Imbruglia' },
  { title: 'MMMBop', artist: 'Hanson' },
  { title: 'Longview', artist: 'Green Day' },
  { title: 'Basket Case', artist: 'Green Day' },
  { title: '1979', artist: 'The Smashing Pumpkins' },
  { title: 'Bittersweet Symphony', artist: 'The Verve' },
  { title: 'Killing in the Name', artist: 'Rage Against the Machine' },
  { title: 'In Bloom', artist: 'Nirvana' },
  { title: 'Return of the Mack', artist: 'Mark Morrison' },
  { title: 'Nice for What', artist: 'Drake' },
  { title: 'One Dance', artist: 'Drake' },
  { title: 'Hotline Bling', artist: 'Drake' },
  { title: 'Rolling in the Deep', artist: 'Adele' },
  { title: 'Someone Like You', artist: 'Adele' },
  { title: 'Hello', artist: 'Adele' },
  { title: 'Uptown Funk', artist: 'Mark Ronson' },
  { title: 'Blinding Lights', artist: 'The Weeknd' },
  { title: 'Save Your Tears', artist: 'The Weeknd' },
  { title: "Can't Feel My Face", artist: 'The Weeknd' },
  { title: 'Shape of You', artist: 'Ed Sheeran' },
  { title: 'Perfect', artist: 'Ed Sheeran' },
  { title: 'Thinking Out Loud', artist: 'Ed Sheeran' },
  { title: 'Levitating', artist: 'Dua Lipa' },
  { title: "Don't Start Now", artist: 'Dua Lipa' },
  { title: 'New Rules', artist: 'Dua Lipa' },
  { title: 'Watermelon Sugar', artist: 'Harry Styles' },
  { title: 'As It Was', artist: 'Harry Styles' },
  { title: 'Bad Guy', artist: 'Billie Eilish' },
  { title: 'Happier Than Ever', artist: 'Billie Eilish' },
  { title: 'Someone You Loved', artist: 'Lewis Capaldi' },
  { title: 'Old Town Road', artist: 'Lil Nas X' },
  { title: 'Industry Baby', artist: 'Lil Nas X' },
  { title: "God's Plan", artist: 'Drake' },
  { title: 'Sicko Mode', artist: 'Travis Scott' },
  { title: 'Sunflower', artist: 'Post Malone' },
  { title: 'Circles', artist: 'Post Malone' },
  { title: 'Rockstar', artist: 'Post Malone' },
  { title: 'HUMBLE.', artist: 'Kendrick Lamar' },
  { title: 'Alright', artist: 'Kendrick Lamar' },
  { title: 'Money Trees', artist: 'Kendrick Lamar' },
  { title: 'Stronger', artist: 'Kanye West' },
  { title: 'Gold Digger', artist: 'Kanye West' },
  { title: 'Empire State of Mind', artist: 'JAY-Z' },
  { title: '99 Problems', artist: 'JAY-Z' },
  { title: 'In Da Club', artist: '50 Cent' },
  { title: 'Lose Yourself', artist: 'Eminem' },
  { title: 'Without Me', artist: 'Eminem' },
  { title: 'The Real Slim Shady', artist: 'Eminem' },
  { title: 'Crazy in Love', artist: 'Beyonce' },
  { title: 'Single Ladies (Put a Ring on It)', artist: 'Beyonce' },
  { title: 'Halo', artist: 'Beyonce' },
  { title: 'Umbrella', artist: 'Rihanna' },
  { title: 'Diamonds', artist: 'Rihanna' },
  { title: 'Work', artist: 'Rihanna' },
  { title: 'Firework', artist: 'Katy Perry' },
  { title: 'Roar', artist: 'Katy Perry' },
  { title: 'Teenage Dream', artist: 'Katy Perry' },
  { title: 'Poker Face', artist: 'Lady Gaga' },
  { title: 'Bad Romance', artist: 'Lady Gaga' },
  { title: 'Shallow', artist: 'Lady Gaga' },
  { title: 'Since U Been Gone', artist: 'Kelly Clarkson' },
  { title: 'Toxic', artist: 'Britney Spears' },
  { title: "Hips Don't Lie", artist: 'Shakira' },
  { title: 'Waka Waka (This Time for Africa)', artist: 'Shakira' },
  { title: 'Despacito', artist: 'Luis Fonsi' },
  { title: 'Dance Monkey', artist: 'Tones and I' },
  { title: 'Counting Stars', artist: 'OneRepublic' },
  { title: 'Radioactive', artist: 'Imagine Dragons' },
  { title: 'Believer', artist: 'Imagine Dragons' },
  { title: 'Thunder', artist: 'Imagine Dragons' },
  { title: 'Demons', artist: 'Imagine Dragons' },
  { title: 'Pumped Up Kicks', artist: 'Foster the People' },
  { title: 'Somebody That I Used to Know', artist: 'Gotye' },
  { title: 'Viva la Vida', artist: 'Coldplay' },
  { title: 'Yellow', artist: 'Coldplay' },
  { title: 'Fix You', artist: 'Coldplay' },
  { title: 'The Scientist', artist: 'Coldplay' },
  { title: 'Clocks', artist: 'Coldplay' },
  { title: 'Mr. Brightside', artist: 'The Killers' },
  { title: 'Seven Nation Army', artist: 'The White Stripes' },
  { title: 'Feel Good Inc.', artist: 'Gorillaz' },
  { title: 'Clint Eastwood', artist: 'Gorillaz' },
  { title: 'Chop Suey!', artist: 'System of a Down' },
  { title: 'In the End', artist: 'Linkin Park' },
  { title: 'Numb', artist: 'Linkin Park' },
  { title: 'Bring Me to Life', artist: 'Evanescence' },
  { title: 'Bodies', artist: 'Drowning Pool' },
  { title: 'Boulevard of Broken Dreams', artist: 'Green Day' },
  { title: 'American Idiot', artist: 'Green Day' },
  { title: 'Use Somebody', artist: 'Kings of Leon' },
  { title: 'Sex on Fire', artist: 'Kings of Leon' },
  { title: 'Somebody Told Me', artist: 'The Killers' },
  { title: 'Take Me Out', artist: 'Franz Ferdinand' },
  { title: 'Dani California', artist: 'Red Hot Chili Peppers' },
  { title: "Can't Stop", artist: 'Red Hot Chili Peppers' },
  { title: 'Under the Bridge', artist: 'Red Hot Chili Peppers' },
  { title: 'Californication', artist: 'Red Hot Chili Peppers' },
  { title: 'Smooth', artist: 'Santana' },
  { title: 'I Gotta Feeling', artist: 'The Black Eyed Peas' },
  { title: 'Boom Boom Pow', artist: 'The Black Eyed Peas' },
  { title: 'Party Rock Anthem', artist: 'LMFAO' },
  { title: 'Get Lucky', artist: 'Daft Punk' },
  { title: 'One More Time', artist: 'Daft Punk' },
  { title: 'Around the World', artist: 'Daft Punk' },
  { title: 'Harder Better Faster Stronger', artist: 'Daft Punk' },
  { title: 'Lose Control', artist: 'Missy Elliott' },
  { title: 'Get Ur Freak On', artist: 'Missy Elliott' },
  { title: 'Crazy', artist: 'Gnarls Barkley' },
  { title: 'Hey Ya!', artist: 'OutKast' },
  { title: 'Ms. Jackson', artist: 'OutKast' },
  { title: 'September', artist: 'Earth, Wind & Fire' },
  { title: 'I Will Survive', artist: 'Gloria Gaynor' },
  { title: 'Dancing Queen', artist: 'ABBA' },
  { title: 'Uptown Girl', artist: 'Billy Joel' },
  { title: 'Piano Man', artist: 'Billy Joel' },
  { title: 'Just the Way You Are', artist: 'Billy Joel' },
  { title: 'Thriller', artist: 'Michael Jackson' },
  { title: 'Man in the Mirror', artist: 'Michael Jackson' },
  { title: 'Rock with You', artist: 'Michael Jackson' },
  { title: 'Uptown Funk', artist: 'Bruno Mars' },
  { title: '24K Magic', artist: 'Bruno Mars' },
  { title: 'Just the Way You Are', artist: 'Bruno Mars' },
  { title: 'Locked Out of Heaven', artist: 'Bruno Mars' },
  { title: 'Grenade', artist: 'Bruno Mars' },
  { title: 'Sugar', artist: 'Maroon 5' },
  { title: 'Moves Like Jagger', artist: 'Maroon 5' },
  { title: 'Payphone', artist: 'Maroon 5' },
  { title: 'Chandelier', artist: 'Sia' },
  { title: 'Elastic Heart', artist: 'Sia' },
  { title: 'Cheap Thrills', artist: 'Sia' },
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function searchDeezer(query: string): Promise<DeezerTrack[]> {
  const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`, {
    headers: { Referer: 'https://chorus.app/' },
  });
  if (!res.ok) {
    throw new Error(`Deezer search failed with status ${res.status}`);
  }
  const body = (await res.json()) as DeezerSearchResponse;
  return body.data ?? [];
}

function pickBestMatch(results: DeezerTrack[]): DeezerTrack | null {
  const withPreview = results.filter((track) => Boolean(track.preview));
  if (withPreview.length === 0) return null;

  const clean = withPreview.filter((track) => !isUnwantedVersion(track.title));
  const pool = clean.length > 0 ? clean : withPreview;
  return pool[0] ?? null;
}

/**
 * Seeds the songs table if it's empty. Called at server startup so the
 * puzzle endpoint works immediately after a fresh deploy without requiring
 * a separate manual curation step.
 */
export async function seedIfEmpty(): Promise<void> {
  const countRows = await db.select({ value: count() }).from(songs).limit(1);
  const row = countRows[0];
  if (row && row.value > 0) {
    return;
  }

  logger.info('Songs table is empty — seeding from Deezer...');

  let inserted = 0;
  let errors = 0;

  for (const candidate of SONG_CANDIDATES) {
    const query = `${candidate.artist} ${candidate.title}`;
    try {
      const results = await searchDeezer(query);
      const match = pickBestMatch(results);
      if (!match) continue;

      const deezerTrackId = String(match.id);
      const dupRows = await db
        .select()
        .from(songs)
        .where(eq(songs.deezerTrackId, deezerTrackId))
        .limit(1);
      const dup = dupRows[0];
      if (dup) continue;

      await db.insert(songs).values({
        title: match.title,
        artist: match.artist.name,
        deezerTrackId,
        previewUrl: match.preview,
        albumArtUrl: match.album?.cover_medium ?? null,
        durationSeconds: match.duration,
      });
      inserted++;
    } catch {
      errors++;
    }
    await sleep(150);
  }

  logger.info(`Seeding complete: ${inserted} songs inserted, ${errors} errors`);
}
