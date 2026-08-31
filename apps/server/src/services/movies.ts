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
 * What kind of music a collection is built from, which decides how hard the track filter is.
 *
 * `songs` collections are pop soundtracks where score cues and dialogue are filler to be thrown
 * away. `score` collections are the opposite: the orchestral cues *are* the content, and the
 * filter that serves the first kind would delete the best of the second — Star Wars' "Main
 * Title" and Jurassic Park's "Opening Titles" are the most recognisable tracks on their albums.
 */
export type MovieCollectionKind = 'songs' | 'score';

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

/**
 * Film scores: the answer is still the film, but the music is orchestral rather than sung.
 *
 * This works for a different reason to the song collections. You are not recognising a melody
 * you know the words to — you are recognising a *sound*, and a composer's palette for a film is
 * consistent across its whole album. Zimmer's Interstellar organ, Powell's Celtic strings on
 * How to Train Your Dragon and Hisaishi's Ghibli piano are identifiable from almost any cue on
 * the record, which is why whole albums work here rather than needing a per-track allow-list.
 *
 * Franchises are labelled at franchise level on purpose. Williams' Star Wars main title, Shore's
 * Fellowship theme and Badelt's Pirates march recur across every film in their series, so
 * pinning the answer to one instalment would mark a correct recognition wrong. Where that could
 * not be done honestly the film was dropped instead: Back to the Future's only clean album is
 * Part III, whose Western cues sound nothing like the theme everyone knows.
 */
const SCORE_MOVIES: MovieAlbum[] = [
  { movie: 'Interstellar', albumId: '185320622' },
  { movie: 'How to Train Your Dragon', albumId: '12442548' },
  { movie: 'Inception', albumId: '601778' },
  { movie: 'The Dark Knight', albumId: '381702' },
  { movie: 'Pirates of the Caribbean', albumId: '2313131' },
  { movie: 'Jurassic Park', albumId: '228943' },
  { movie: 'Gladiator', albumId: '906355442' },
  { movie: "Schindler's List", albumId: '241510' },
  { movie: 'E.T. the Extra-Terrestrial', albumId: '226139' },
  { movie: 'The Matrix', albumId: '243158702' },
  { movie: 'Blade Runner 2049', albumId: '49296292' },
  { movie: 'Mad Max: Fury Road', albumId: '90111962' },
  { movie: 'The Social Network', albumId: '5604281' },
  { movie: 'TRON: Legacy', albumId: '192529232' },
  { movie: 'Up', albumId: '394031' },
  { movie: 'Ratatouille', albumId: '473893' },
  { movie: 'The Incredibles', albumId: '2310491' },
  { movie: 'WALL-E', albumId: '81455242' },
  { movie: 'Spirited Away', albumId: '181915142' },
  { movie: "Howl's Moving Castle", albumId: '181915712' },
  { movie: 'Princess Mononoke', albumId: '181915022' },
  { movie: 'Requiem for a Dream', albumId: '496099' },
  { movie: 'Oppenheimer', albumId: '463516585' },
  { movie: 'Arrival', albumId: '14520468' },
  { movie: 'Sicario', albumId: '11149304' },
  { movie: 'The Grand Budapest Hotel', albumId: '7406940' },
  { movie: 'The Good, the Bad and the Ugly', albumId: '299178' },
  { movie: 'Jaws', albumId: '765228371' },
  { movie: 'Braveheart', albumId: '6415042' },
  { movie: 'Avatar', albumId: '528314' },
  { movie: 'Star Wars', albumId: '20044821' },
  { movie: 'Harry Potter', albumId: '80310' },
  { movie: 'The Lord of the Rings', albumId: '338939' },
  { movie: 'Psycho', albumId: '12980720' },
  { movie: 'Rocky', albumId: '10145688' },
  { movie: 'Titanic', albumId: '113048' },
  { movie: 'Everything Everywhere All at Once', albumId: '1024990721' },
  { movie: 'The Theory of Everything', albumId: '133720242' },
  { movie: 'Casino Royale', albumId: '1441812' },
  { movie: 'Skyfall', albumId: '6025412' },
  { movie: 'The Revenant', albumId: '152169872' },
  { movie: 'Black Panther', albumId: '57078512' },
  { movie: 'Life of Pi', albumId: '6030684' },
  { movie: 'Dune', albumId: '550485632' },
  { movie: 'The Godfather', albumId: '386450867' },
  { movie: 'Joker', albumId: '636227501' },
];

export interface MovieCollection {
  id: string;
  label: string;
  blurb: string;
  kind: MovieCollectionKind;
  movies: MovieAlbum[];
}

export const MOVIE_COLLECTIONS: MovieCollection[] = [
  {
    id: 'movies-bollywood',
    label: 'Guess the Movie: Bollywood',
    blurb: 'Name the Hindi film from its song',
    kind: 'songs',
    movies: BOLLYWOOD_MOVIES,
  },
  {
    id: 'movies-hollywood',
    label: 'Guess the Movie: Hollywood',
    blurb: 'Name the film from its soundtrack',
    kind: 'songs',
    movies: HOLLYWOOD_MOVIES,
  },
  {
    id: 'movies-all',
    label: 'Guess the Movie: Mixed',
    blurb: 'Bollywood and Hollywood soundtracks together',
    kind: 'songs',
    movies: [...BOLLYWOOD_MOVIES, ...HOLLYWOOD_MOVIES],
  },
  /*
   * Kept out of the mixed collection deliberately. Naming a film from its orchestral score is a
   * different skill to naming it from a pop song on its soundtrack, and shuffling the two
   * together would make a round's difficulty depend on which kind it happened to draw.
   */
  {
    id: 'movies-scores',
    label: 'Guess the Movie: Film Scores',
    blurb: 'Interstellar, Jurassic Park, Ghibli — name the film from its score',
    kind: 'score',
    movies: SCORE_MOVIES,
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
