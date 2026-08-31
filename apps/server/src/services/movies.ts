/**
 * Guess the Movie: soundtrack albums whose *film* is the answer.
 *
 * A round plays a few seconds of a song and asks which film it is from, so the unit of curation
 * here is one album per movie. The film name is written out by hand rather than parsed from the
 * album title — Deezer's titles carry suffixes ("(Original Motion Picture Soundtrack)",
 * "(Deluxe Edition)", "Sing-a-Long Edition"), sometimes in German, and a stripping rule that
 * handled all of them would still be guessing at the one thing players are scored on.
 *
 * Every id below was approved by reading its actual track listing, because searching Deezer for
 * a film name is not close to good enough. The near-misses are not obviously wrong from the
 * album title alone, and each one produces a round that is unanswerable rather than hard:
 *
 *   - Piano/score/instrumental re-recordings. "La La Land Soundtrack for Piano" and the Hans
 *     Zimmer cues on the 2019 Lion King album have no vocal to recognise.
 *   - Cover-band re-recordings sold under the film's name — "Dirty Dancing" by "Film Musical
 *     Orchestra", "Mamma Mia!" by "The Background Orchestra", Guardians of the Galaxy by
 *     "Cameron's Bedtime Classics".
 *   - German audio dramas ("Hörspiel zum Kinofilm") and dubbed soundtracks, which rank highly
 *     because this deployment's Deezer calls resolve from a German IP.
 *   - Wrong film, same prefix: searching "Jawan" returns "Jawani On The Rocks"; "Frozen"
 *     returns "Frozen Planet II"; "Moana" returns "Moana 2".
 *   - Dialogue albums. Dilwale Dulhania Le Jayenge's most popular album (57508672) is
 *     twenty-four tracks of Shah Rukh Khan speaking, and nothing in its metadata says so.
 *
 * If a film ever stops playing, check https://api.deezer.com/album/<id> first — the failure
 * mode of a dead album id is "not enough playable tracks", which reads like a bug in the game.
 */

export interface MovieAlbum {
  /** The answer players pick. Written by hand; never derived from the album title. */
  movie: string;
  /** Deezer album id, verified by track listing. */
  albumId: string;
}

/**
 * Hindi film albums are the cleanest source of this mode by a distance: the album *is* the film,
 * the songs are the country's pop music rather than underscore, and the performing artists are
 * recognisable in their own right.
 */
const BOLLYWOOD_MOVIES: MovieAlbum[] = [
  { movie: 'Kal Ho Naa Ho', albumId: '6651452' },
  { movie: 'Kabhi Khushi Kabhie Gham', albumId: '6794841' },
  { movie: 'Dil To Pagal Hai', albumId: '198978042' },
  { movie: 'Kuch Kuch Hota Hai', albumId: '6651447' },
  { movie: 'Devdas', albumId: '250548' },
  { movie: 'Veer-Zaara', albumId: '198977792' },
  { movie: 'Rang De Basanti', albumId: '7099069' },
  { movie: 'Jab We Met', albumId: '697791601' },
  { movie: 'Delhi Belly', albumId: '162167322' },
  { movie: 'Zindagi Na Milegi Dobara', albumId: '697209561' },
  { movie: 'Rockstar', albumId: '697203661' },
  { movie: 'Barfi!', albumId: '5558371' },
  { movie: 'Yeh Jawaani Hai Deewani', albumId: '697188001' },
  { movie: 'Aashiqui 2', albumId: '699630961' },
  { movie: 'Tamasha', albumId: '696024911' },
  { movie: 'Ae Dil Hai Mushkil', albumId: '14530330' },
  { movie: 'Dangal', albumId: '912451051' },
  { movie: 'Padmaavat', albumId: '696046701' },
  { movie: 'Gully Boy', albumId: '921136881' },
  { movie: 'Sanju', albumId: '695920141' },
  { movie: 'Andhadhun', albumId: '1036993482' },
  { movie: 'Dil Bechara', albumId: '159458892' },
  { movie: 'Brahmastra', albumId: '363789407' },
  { movie: 'Rocky Aur Rani Kii Prem Kahaani', albumId: '587070402' },
  { movie: 'Jawan', albumId: '685348751' },
  { movie: 'Om Shanti Om', albumId: '697718071' },
  { movie: 'Jodhaa Akbar', albumId: '182800072' },
  { movie: 'Taare Zameen Par', albumId: '697700801' },
  { movie: 'Ghajini', albumId: '697643381' },
  { movie: '3 Idiots', albumId: '919952951' },
  { movie: 'Wake Up Sid', albumId: '613934412' },
  { movie: 'Bajirao Mastani', albumId: '827252331' },
  { movie: 'Goliyon Ki Raasleela Ram-Leela', albumId: '827242561' },
  { movie: 'Student of the Year', albumId: '5668611' },
  { movie: 'Kapoor & Sons', albumId: '612890282' },
  { movie: 'Befikre', albumId: '197823452' },
  { movie: 'Highway', albumId: '697163771' },
  { movie: 'Raanjhanaa', albumId: '6642695' },
  { movie: 'Cocktail', albumId: '827254451' },
  { movie: 'Airlift', albumId: '691666851' },
  { movie: 'Udta Punjab', albumId: '912887781' },
  { movie: 'Bhaag Milkha Bhaag', albumId: '6670306' },
  // The 2020 film, not the 2009 one of the same name — album 131829662 is Shayad / Mehrama.
  { movie: 'Love Aaj Kal', albumId: '131829662' },
];

/**
 * Hollywood needed far heavier curation than Bollywood and the list is deliberately shorter.
 * Two structural problems: many famous American films are scored rather than sung (a Hans
 * Zimmer or James Horner cue is not a guessable round), and the ones that *are* song-led attract
 * a swarm of cover-band and karaoke re-releases that outrank the real album in search.
 *
 * Sequels are labelled as the film they actually are — the album Deezer returns for "Mamma Mia!"
 * is Here We Go Again, and calling that "Mamma Mia!" would mark a correct answer wrong.
 */
const HOLLYWOOD_MOVIES: MovieAlbum[] = [
  { movie: 'Pulp Fiction', albumId: '89920242' },
  { movie: 'Grease', albumId: '115882092' },
  { movie: 'Saturday Night Fever', albumId: '51429672' },
  { movie: 'Dirty Dancing', albumId: '5867341' },
  { movie: 'The Bodyguard', albumId: '708692' },
  { movie: 'Flashdance', albumId: '70486742' },
  { movie: 'Purple Rain', albumId: '43280511' },
  { movie: 'Chicago', albumId: '97893' },
  { movie: 'Hairspray', albumId: '90112962' },
  { movie: 'Empire Records', albumId: '87173002' },
  { movie: 'Once', albumId: '1426240' },
  { movie: 'Toy Story', albumId: '629211' },
  { movie: 'The Muppets', albumId: '8590084' },
  { movie: 'Coco', albumId: '51005402' },
  { movie: 'Soul', albumId: '192534282' },
  { movie: 'Aladdin', albumId: '97532162' },
  { movie: 'The Greatest Showman', albumId: '75835462' },
  { movie: 'A Star Is Born', albumId: '74434962' },
  { movie: 'Bohemian Rhapsody', albumId: '1007321401' },
  { movie: 'Rocketman', albumId: '97394832' },
  { movie: 'Baby Driver', albumId: '43274571' },
  { movie: 'Top Gun: Maverick', albumId: '321440247' },
  { movie: 'Barbie', albumId: '466457405' },
  { movie: 'Pitch Perfect', albumId: '6234656' },
  { movie: 'Descendants', albumId: '654438951' },
  { movie: 'Mamma Mia! Here We Go Again', albumId: '79084232' },
];

export interface MovieCollection {
  id: string;
  label: string;
  blurb: string;
  movies: MovieAlbum[];
}

export const MOVIE_COLLECTIONS: MovieCollection[] = [
  {
    id: 'movies-bollywood',
    label: 'Guess the Movie: Bollywood',
    blurb: 'Name the Hindi film from its song',
    movies: BOLLYWOOD_MOVIES,
  },
  {
    id: 'movies-hollywood',
    label: 'Guess the Movie: Hollywood',
    blurb: 'Name the film from its soundtrack',
    movies: HOLLYWOOD_MOVIES,
  },
  {
    id: 'movies-all',
    label: 'Guess the Movie: Mixed',
    blurb: 'Bollywood and Hollywood soundtracks together',
    movies: [...BOLLYWOOD_MOVIES, ...HOLLYWOOD_MOVIES],
  },
];

/*
 * Two films sharing an album id means one of them is wrong, and the symptom would be a round
 * that accepts the other film's name — a scoring bug rather than a visible crash. Same reasoning
 * as the duplicate-slug guard in categories.ts: cheap at import, silent and confusing otherwise.
 */
for (const collection of MOVIE_COLLECTIONS) {
  const seenAlbums = new Map<string, string>();
  const seenMovies = new Set<string>();
  for (const { movie, albumId } of collection.movies) {
    const owner = seenAlbums.get(albumId);
    if (owner) {
      throw new Error(`Album ${albumId} is used by both "${owner}" and "${movie}"`);
    }
    seenAlbums.set(albumId, movie);
    if (seenMovies.has(movie)) {
      throw new Error(`Duplicate movie "${movie}" in ${collection.id}`);
    }
    seenMovies.add(movie);
  }
}
