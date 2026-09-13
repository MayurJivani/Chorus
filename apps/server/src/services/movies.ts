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
  // Delhi Belly was here on album 162167322 until that id started answering {"error":"no
  // data"}. There is no replacement: searching Deezer for the film now returns belly-dance
  // compilations and nothing else, so the film is out rather than pointed at something wrong.
  // The 2020 film, not the 2009 one of the same name — album 131829662 is Shayad / Mehrama.
  { movie: 'Love Aaj Kal', albumId: '131829662' },
  { movie: 'Chennai Express', albumId: '1002725171' },
  { movie: 'Dil Dhadakne Do', albumId: '697137231' },
  { movie: 'Piku', albumId: '921346301' },
  { movie: 'Simmba', albumId: '694294831' },
  { movie: 'Uri: The Surgical Strike', albumId: '921155141' },
  { movie: 'Bhool Bhulaiyaa', albumId: '697699001' },
  { movie: 'Dhoom 2', albumId: '198977382' },
  { movie: 'Krrish 3', albumId: '697173691' },
  { movie: 'Don 2', albumId: '697203941' },
  { movie: 'Ek Tha Tiger', albumId: '198977702' },
  { movie: 'Kalank', albumId: '921210481' },
  { movie: 'Shershaah', albumId: '612890272' },
  { movie: 'Atrangi Re', albumId: '691559181' },
  { movie: 'Bhool Bhulaiyaa 2', albumId: '691509941' },
  { movie: 'Laal Singh Chaddha', albumId: '691206401' },
  { movie: 'Tu Jhoothi Main Makkaar', albumId: '687930381' },
  { movie: 'Satyaprem Ki Katha', albumId: '685418901' },
  { movie: 'Sanam Teri Kasam', albumId: '827896661' },
  { movie: 'Half Girlfriend', albumId: '909251492' },
  { movie: 'Tiger Zinda Hai', albumId: '197823362' },
  { movie: 'Manmarziyaan', albumId: '827249221' },
  { movie: 'Luka Chuppi', albumId: '694222071' },
  { movie: 'Chhichhore', albumId: '694151281' },
  { movie: 'Baar Baar Dekho', albumId: '909247082' },
  { movie: 'OK Jaanu', albumId: '14975295' },
  { movie: 'Jab Harry Met Sejal', albumId: '45765772' },
  { movie: 'Street Dancer 3D', albumId: '694052171' },
  { movie: 'Kabhi Alvida Naa Kehna', albumId: '1209527' },
  { movie: 'Namastey London', albumId: '827347721' },
  { movie: 'Hum Aapke Hain Koun', albumId: '680594031' },
  { movie: 'Kaho Naa Pyaar Hai', albumId: '60057432' },
  { movie: 'Dilwale Dulhania Le Jayenge', albumId: '57508672' },
  { movie: 'Dil Chahta Hai', albumId: '700629181' },
  { movie: 'Lagaan', albumId: '1208636' },
  { movie: 'Swades', albumId: '699675581' },
  { movie: 'Kaminey', albumId: '697148831' },
  { movie: 'Omkara', albumId: '827244461' },
  { movie: 'Haider', albumId: '11456858' },
  { movie: 'Ishqiya', albumId: '691631641' },
  { movie: 'Gangs of Wasseypur', albumId: '696143311' },
  { movie: 'Kahaani', albumId: '696143361' },
  { movie: 'Special', albumId: '43730241' },
  { movie: 'Baby', albumId: '801989831' },
  { movie: 'Rustom', albumId: '921370331' },
  { movie: 'Newton', albumId: '1057470382' },
  { movie: 'Bareilly Ki Barfi', albumId: '909488372' },
  { movie: 'Secret Superstar', albumId: '912603191' },
  { movie: 'Fukrey', albumId: '696096911' },
  { movie: 'Fukrey Returns', albumId: '909487692' },
  { movie: 'Judwaa', albumId: '50072242' },
  { movie: 'Raabta', albumId: '985740441' },
  { movie: 'Jagga Jasoos', albumId: '696006491' },
  { movie: 'Munna Michael', albumId: '827254431' },
  { movie: 'Behen Hogi Teri', albumId: '912454261' },
  { movie: 'Noor', albumId: '217128002' },
  { movie: 'Begum Jaan', albumId: '7269876' },
  { movie: 'Phillauri', albumId: '696014591' },
  { movie: 'Kaabil', albumId: '697126671' },
  { movie: 'Sultan', albumId: '8214928' },
  { movie: 'Jai Gangaajal', albumId: '921497121' },
  { movie: 'Rocky Handsome', albumId: '696175611' },
  { movie: 'Baaghi', albumId: '13457155' },
  { movie: 'Housefull', albumId: '696212121' },
  { movie: 'Dishoom', albumId: '696041601' },
  { movie: 'Mohenjo Daro', albumId: '696040841' },
  { movie: 'Banjo', albumId: '64427972' },
  { movie: 'Force', albumId: '15810564' },
  { movie: 'Dear Zindagi', albumId: '879418802' },
  { movie: 'Rangoon', albumId: '99215762' },
  { movie: 'Sarkar', albumId: '691687591' },
  { movie: 'Tubelight', albumId: '43528751' },
  { movie: 'Mubarakan', albumId: '696008001' },
  { movie: 'Toilet', albumId: '448060195' },
  { movie: 'Ittefaq', albumId: '80415922' },
  { movie: 'Qarib Qarib Singlle', albumId: '921312231' },
  { movie: 'Sonu Ke Titu Ki Sweety', albumId: '697089651' },
  { movie: 'Parmanu', albumId: '921342961' },
  { movie: 'Veere Di Wedding', albumId: '909498112' },
  { movie: 'Race', albumId: '181423732' },
  { movie: 'Gold', albumId: '79885322' },
  { movie: 'Namaste England', albumId: '74725912' },
  { movie: 'Badhaai Ho', albumId: '675760' },
  { movie: '2.0', albumId: '309988807' },
  { movie: 'Zero', albumId: '541234922' },
  { movie: 'Article', albumId: '65677092' },
  { movie: 'Saaho', albumId: '132660662' },
  { movie: 'Dream Girl', albumId: '108665102' },
  { movie: 'War', albumId: '161963' },
  { movie: 'Marjaavaan', albumId: '694035681' },
  { movie: 'Commando', albumId: '70134182' },
  { movie: 'Dabangg', albumId: '691666831' },
  { movie: 'Street Dancer', albumId: '1012320931' },
  { movie: 'Malang', albumId: '694054021' },
  { movie: 'Gunjan Saxena', albumId: '920509451' },
  { movie: 'Bhuj', albumId: '273197852' },
  { movie: 'Bell Bottom', albumId: '898066942' },
  { movie: 'Chandigarh Kare Aashiqui', albumId: '693636681' },
  { movie: 'Gehraiyaan', albumId: '303780667' },
  { movie: 'Gangubai Kathiawadi', albumId: '296444042' },
  { movie: 'Jersey', albumId: '48944702' },
  { movie: 'Runway', albumId: '71624572' },
  { movie: 'Heropanti', albumId: '697147071' },
  { movie: 'Samrat Prithviraj', albumId: '320139137' },
  { movie: 'Jugjugg Jeeyo', albumId: '691510011' },
  { movie: 'Shamshera', albumId: '333032787' },
  { movie: 'Ek Villain Returns', albumId: '688249711' },
  { movie: 'Vikram Vedha', albumId: '53539082' },
  { movie: 'Thank God', albumId: '660220171' },
  { movie: 'Circus', albumId: '820168011' },
  { movie: 'Shehzada', albumId: '687913011' },
  { movie: 'Kisi Ka Bhai Kisi Ki Jaan', albumId: '918456471' },
  { movie: 'Zara Hatke Zara Bachke', albumId: '481587265' },
  { movie: 'Tiger', albumId: '304592047' },
  { movie: 'Fighter', albumId: '13580795' },
  { movie: 'Teri Baaton Mein Aisa Uljha Jiya', albumId: '1033680432' },
  { movie: 'Crew', albumId: '153268552' },
  { movie: 'Bade Miyan Chote Miyan', albumId: '202910032' },
  { movie: 'Srikanth', albumId: '618868401' },
  { movie: 'Chandu Champion', albumId: '684964311' },
  { movie: 'Bad Newz', albumId: '64537672' },
  { movie: 'Khel Khel Mein', albumId: '55122442' },
  { movie: 'Vedaa', albumId: '909532422' },
  { movie: 'Jigra', albumId: '657124771' },
  { movie: 'Devara', albumId: '709711441' },
  { movie: 'The Sabarmati Report', albumId: '914872161' },
  { movie: 'Baby John', albumId: '12465998' },
  { movie: 'Game Changer', albumId: '992230901' },
  { movie: 'Sky Force', albumId: '273926052' },
  { movie: 'Chhaava', albumId: '712558271' },
  { movie: 'Saiyaara', albumId: '1046793042' },
  { movie: 'Aashiqui', albumId: '702530821' },
  { movie: 'Raja Hindustani', albumId: '190436402' },
  { movie: 'Dil Se', albumId: '674037341' },
  { movie: 'Taal', albumId: '180653982' },
  { movie: 'Refugee', albumId: '107220752' },
  { movie: 'Mission Kashmir', albumId: '184564082' },
  { movie: 'Josh', albumId: '13474885' },
  { movie: 'Fiza', albumId: '203021852' },
  { movie: 'Yaadein', albumId: '202905722' },
  { movie: 'Dil Hai Tumhaara', albumId: '180636622' },
  { movie: 'Saathiya', albumId: '198978052' },
  { movie: 'Koi Mil Gaya', albumId: '279088852' },
  { movie: 'Main Hoon Na', albumId: '699912801' },
  { movie: 'Hum Tum', albumId: '682984741' },
  { movie: 'Murder', albumId: '948859171' },
  { movie: 'Dhoom', albumId: '720302881' },
  { movie: 'Black', albumId: '13203876' },
  { movie: 'Bunty Aur Babli', albumId: '462780375' },
  { movie: 'Salaam Namaste', albumId: '197823632' },
  { movie: 'Fanaa', albumId: '198977472' },
  { movie: 'Krrish', albumId: '691678361' },
  { movie: 'Guru', albumId: '63574352' },
  { movie: 'Jaane Tu Ya Jaane Na', albumId: '697493181' },
  { movie: 'Rock On', albumId: '11339296' },
  { movie: 'Singh Is Kinng', albumId: '44533121' },
  { movie: 'Ajab Prem Ki Ghazab Kahani', albumId: '181417902' },
  { movie: 'Idiots', albumId: '1062768011' },
  { movie: 'My Name Is Khan', albumId: '618805331' },
  { movie: 'Raajneeti', albumId: '558738' },
  { movie: 'Once Upon A Time In Mumbaai', albumId: '696173961' },
  { movie: 'Band Baaja Baaraat', albumId: '198976912' },
  { movie: 'Tees Maar Khan', albumId: '696155701' },
  { movie: 'Selfiee', albumId: '600031942' },
  { movie: 'Sikandar', albumId: '670687841' },
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
  { movie: 'Encanto', albumId: '272207802' },
  { movie: 'Sing Street', albumId: '12652006' },
  { movie: 'Yesterday', albumId: '100538662' },
  { movie: 'Dreamgirls', albumId: '1254542' },
  { movie: 'Straight Outta Compton', albumId: '12118414' },
  { movie: 'The Sound of Music', albumId: '516060102' },
  { movie: 'Into the Woods', albumId: '9223175' },
  { movie: 'Beauty and the Beast', albumId: '15623826' },
  { movie: 'The Princess and the Frog', albumId: '90598512' },
  { movie: 'Suicide Squad', albumId: '14102130' },
  { movie: 'Trolls World Tour', albumId: '135723312' },
  { movie: 'Top Gun', albumId: '708670' },
  { movie: 'The Breakfast Club', albumId: '499107091' },
  { movie: 'Pretty in Pink', albumId: '12253592' },
  { movie: 'Stand by Me', albumId: '7563956' },
  { movie: 'American Graffiti', albumId: '310799027' },
  { movie: 'The Graduate', albumId: '96900992' },
  { movie: 'Quadrophenia', albumId: '565271372' },
  { movie: 'La Bamba', albumId: '436062' },
  { movie: 'Great Balls of Fire', albumId: '7823861' },
  { movie: "What's Love Got to Do with It", albumId: '408632447' },
  { movie: 'Selena', albumId: '190824922' },
  { movie: 'Sweet Dreams', albumId: '496384401' },
  { movie: 'Sparkle', albumId: '14119864' },
  { movie: 'Get Rich or Die Tryin', albumId: '685700' },
  { movie: 'Notorious', albumId: '87614052' },
  { movie: 'All Eyez on Me', albumId: '262791492' },
  { movie: 'Menace II Society', albumId: '370966097' },
  { movie: 'Juice', albumId: '9239783' },
  { movie: 'Above the Rim', albumId: '415439547' },
  { movie: 'Belly', albumId: '7473891' },
  { movie: 'Set It Off', albumId: '12979986' },
  { movie: 'Waiting to Exhale', albumId: '114002' },
  { movie: 'Poetic Justice', albumId: '113030' },
  { movie: 'Do the Right Thing', albumId: '7690843' },
  { movie: 'Clockers', albumId: '281800562' },
  { movie: 'He Got Game', albumId: '6618924' },
  { movie: 'Shaft', albumId: '97509052' },
  { movie: 'Superfly', albumId: '65650522' },
  { movie: 'Grease 2', albumId: '45784762' },
  { movie: 'Fame', albumId: '709195671' },
  { movie: 'Staying Alive', albumId: '48140842' },
  { movie: 'Burlesque', albumId: '700961' },
  { movie: 'Rock of Ages', albumId: '347874' },
  { movie: 'Pitch Perfect 2', albumId: '11015500' },
  { movie: 'Pitch Perfect 3', albumId: '57684992' },
  { movie: 'Step Up', albumId: '73480' },
  { movie: 'Center Stage', albumId: '230242' },
  { movie: 'Black Swan', albumId: '135714012' },
  { movie: 'An American in Paris', albumId: '90138312' },
  { movie: 'Singin in the Rain', albumId: '90112712' },
  { movie: 'Swing Time', albumId: '139786442' },
  { movie: 'Meet Me in St Louis', albumId: '90121612' },
  { movie: 'Easter Parade', albumId: '1144105' },
  { movie: 'White Christmas', albumId: '1038535562' },
  { movie: 'Oklahoma', albumId: '11539884' },
  { movie: 'South Pacific', albumId: '6749036' },
  { movie: 'My Fair Lady', albumId: '6965050' },
  { movie: 'Camelot', albumId: '432034877' },
  { movie: 'Fiddler on the Roof', albumId: '302603' },
  { movie: 'Jesus Christ Superstar', albumId: '70929102' },
  { movie: 'Godspell', albumId: '14532030' },
  { movie: 'Little Shop of Horrors', albumId: '72173012' },
  { movie: 'The Rocky Horror Picture Show', albumId: '1041088472' },
  { movie: 'Evita', albumId: '339657' },
  { movie: 'Respect', albumId: '249804632' },
  { movie: 'Back to Black', albumId: '566732401' },
  { movie: 'In the Heights', albumId: '231630912' },
  { movie: 'West Side Story', albumId: '71605' },
  { movie: 'Sing 2', albumId: '280809921' },
  { movie: 'The Secret Life of Pets', albumId: '134515982' },
  { movie: 'Minions', albumId: '134517642' },
  { movie: 'Shrek 2', albumId: '12981060' },
  { movie: 'Happy Feet', albumId: '101420442' },
  { movie: 'Home', albumId: '377976717' },
  { movie: 'Abominable', albumId: '140432372' },
  { movie: 'Vivo', albumId: '248395612' },
  { movie: 'Turning Red', albumId: '300349637' },
  { movie: 'Inside Out', albumId: '10495744' },
  { movie: 'Toy Story 3', albumId: '133523812' },
  { movie: 'Finding Nemo', albumId: '473879' },
  { movie: 'Finding Dory', albumId: '13366813' },
  { movie: 'Cars', albumId: '13632934' },
  { movie: 'Onward', albumId: '133159202' },
  { movie: 'Elemental', albumId: '469645625' },
  { movie: 'The Little Mermaid', albumId: '443830295' },
  { movie: 'The Lion King', albumId: '103027012' },
  { movie: 'Hercules', albumId: '301034' },
  { movie: 'Tarzan', albumId: '74437962' },
  { movie: 'The Hunchback of Notre Dame', albumId: '240927862' },
  { movie: 'Lilo and Stitch', albumId: '301019' },
  { movie: 'Brother Bear', albumId: '301037' },
  { movie: 'Atlantis The Lost Empire', albumId: '306939' },
  { movie: 'Hannah Montana', albumId: '300647' },
  { movie: 'Rent', albumId: '345025' },
  { movie: 'Almost Famous', albumId: '169735462' },
  { movie: 'High Fidelity', albumId: '69455142' },
  { movie: 'The Commitments', albumId: '100905' },
  { movie: 'Guardians of the Galaxy', albumId: '8113988' },
  { movie: 'Spider-Man Across the Spider-Verse', albumId: '471194275' },
  { movie: 'Wonka', albumId: '518062822' },
  { movie: 'Reservoir Dogs', albumId: '12252090' },
  { movie: 'Fight Club', albumId: '362476' },
  { movie: 'Donnie Darko', albumId: '8351746' },
  { movie: 'Garden State', albumId: '75294' },
  { movie: 'Little Miss Sunshine', albumId: '264203322' },
  { movie: 'Lost in Translation', albumId: '671003' },
  { movie: 'The Virgin Suicides', albumId: '752610461' },
  { movie: 'Marie Antoinette', albumId: '581040871' },
  { movie: 'The Great Gatsby', albumId: '72385542' },
  { movie: 'Elizabethtown', albumId: '6899608' },
  { movie: 'Magnolia', albumId: '948745981' },
  { movie: 'Punch-Drunk Love', albumId: '365927' },
  { movie: 'Phantom Thread', albumId: '53869152' },
  { movie: 'Licorice Pizza', albumId: '273814102' },
  { movie: 'Gone Girl', albumId: '8709085' },
  { movie: 'O Brother Where Art Thou', albumId: '68619391' },
  { movie: 'A Complete Unknown', albumId: '684798441' },
  { movie: 'Crazy Heart', albumId: '74396072' },
  { movie: 'Wild Rose', albumId: '324005677' },
  { movie: 'Country Strong', albumId: '806200' },
  { movie: 'Nashville', albumId: '9510866' },
  { movie: 'Forrest Gump', albumId: '1634886' },
  { movie: 'Titanic', albumId: '1589656' },
  { movie: 'Love Actually', albumId: '269969312' },
  { movie: 'The Holiday', albumId: '648112111' },
  { movie: 'Serendipity', albumId: '387001127' },
  { movie: "You've Got Mail", albumId: '12548790' },
  { movie: '10 Things I Hate About You', albumId: '69453602' },
  { movie: 'Clueless', albumId: '435691' },
  { movie: 'Mean Girls', albumId: '651776701' },
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
  { movie: 'Dunkirk', albumId: '90189482' },
  { movie: 'Tenet', albumId: '183724522' },
  { movie: 'The Prestige', albumId: '320958757' },
  { movie: 'Batman Begins', albumId: '90112632' },
  { movie: 'The Batman', albumId: '300744257' },
  { movie: 'Man of Steel', albumId: '90118312' },
  { movie: 'Wonder Woman', albumId: '90133602' },
  { movie: 'The Avengers', albumId: '1674608' },
  { movie: 'Doctor Strange', albumId: '14344340' },
  { movie: 'Spider-Man: Into the Spider-Verse', albumId: '81761222' },
  { movie: 'Alien', albumId: '9491846' },
  { movie: 'Godzilla: King of the Monsters', albumId: '97586112' },
  { movie: 'Beetlejuice', albumId: '654153971' },
  { movie: 'The Nightmare Before Christmas', albumId: '491145235' },
  { movie: 'The Shape of Water', albumId: '52252852' },
  { movie: 'Moonrise Kingdom', albumId: '3571321' },
  { movie: 'Fantastic Mr. Fox', albumId: '924106' },
  { movie: 'Her', albumId: '206741772' },
  { movie: 'Ex Machina', albumId: '134515942' },
  { movie: 'Get Out', albumId: '127074472' },
  { movie: 'Hereditary', albumId: '130049982' },
  { movie: 'Midsommar', albumId: '140733232' },
  { movie: 'Gravity', albumId: '90108322' },
];

/**
 * Video game soundtracks. The answer is the game, and the collection rides the same machinery
 * as the film ones — `title` holds the answer, `artist` the track that is playing.
 *
 * Games turn out to be the easiest of the three to source: this music is written to be owned
 * rather than licensed, so the composer's own album is on Deezer in full, complete with
 * previews. Almost every candidate resolved first try, which is not true of Hollywood.
 *
 * Franchise-level labels, same rule as the film scores: Korb's Hades palette, McCreary's God of
 * War themes and Larkin's Hollow Knight writing all recur across their sequels, so pinning an
 * answer to one instalment would mark a correct recognition wrong.
 *
 * Two were rejected rather than fudged. "Halo" on Deezer is the TV series score, not Martin
 * O'Donnell's game music — a different thing wearing the same name. And plain NieR sits beside
 * NieR: Automata sharing composer and themes closely enough that a round could not fairly
 * distinguish them, so only Automata is here.
 */
const GAME_SOUNDTRACKS: MovieAlbum[] = [
  { movie: 'The Last of Us', albumId: '409638277' },
  { movie: 'Journey', albumId: '206992352' },
  { movie: 'Minecraft', albumId: '894481492' },
  { movie: 'Undertale', albumId: '49333512' },
  { movie: 'Celeste', albumId: '193375342' },
  { movie: 'Hollow Knight', albumId: '819144161' },
  { movie: 'NieR: Automata', albumId: '417822547' },
  { movie: 'DOOM', albumId: '941543521' },
  { movie: 'Cyberpunk 2077', albumId: '191001362' },
  { movie: 'The Witcher 3', albumId: '54723492' },
  { movie: 'Hades', albumId: '854241482' },
  { movie: 'Ori and the Blind Forest', albumId: '9730700' },
  { movie: 'God of War', albumId: '369191727' },
  { movie: 'Elden Ring', albumId: '351595207' },
  { movie: 'Stardew Valley', albumId: '14124862' },
  { movie: 'Portal 2', albumId: '956350181' },
  { movie: 'Mass Effect', albumId: '108889842' },
  { movie: 'Death Stranding', albumId: '260094522' },
  { movie: 'Disco Elysium', albumId: '386053877' },
  { movie: 'Outer Wilds', albumId: '349891417' },
  { movie: 'Silent Hill 2', albumId: '666275041' },
  { movie: 'Life is Strange', albumId: '658853791' },
  { movie: 'Bastion', albumId: '88139982' },
  { movie: 'Transistor', albumId: '7814163' },
  { movie: 'Persona 5', albumId: '506559661' },
  { movie: 'Katana ZERO', albumId: '95719332' },
  { movie: 'Dark Souls', albumId: '664124241' },
  { movie: 'Bloodborne', albumId: '206840502' },
  { movie: 'Nioh', albumId: '206271242' },
  { movie: 'Final Fantasy VII Remake', albumId: '417286337' },
  { movie: 'Final Fantasy XV', albumId: '619306721' },
  { movie: 'Octopath Traveler', albumId: '547618912' },
  { movie: 'Bravely Default', albumId: '417711917' },
  { movie: 'Donkey Kong', albumId: '446825335' },
  { movie: 'Ace Combat 7', albumId: '532732122' },
  { movie: 'Gran Turismo', albumId: '469932525' },
  { movie: 'Need for Speed', albumId: '155427442' },
  { movie: 'Fall Guys', albumId: '164194352' },
  { movie: 'Overwatch', albumId: '747067121' },
  { movie: 'Diablo III', albumId: '746671041' },
  { movie: 'Diablo IV', albumId: '746678981' },
  { movie: 'StarCraft II', albumId: '747087851' },
  { movie: 'World of Warcraft', albumId: '747092301' },
  { movie: 'Apex Legends', albumId: '224979742' },
  { movie: 'Destiny 2', albumId: '991767281' },
  { movie: 'Borderlands 3', albumId: '578128391' },
  { movie: 'Dishonored', albumId: '168177632' },
  { movie: 'Prey', albumId: '100987702' },
  { movie: 'Deus Ex', albumId: '101520502' },
  { movie: 'Control', albumId: '578127191' },
  { movie: 'Alan Wake 2', albumId: '658578821' },
  { movie: 'Quantum Break', albumId: '12633324' },
  { movie: 'Max Payne 3', albumId: '377010507' },
  { movie: 'Spider-Man', albumId: '100718172' },
  { movie: 'Horizon Zero Dawn', albumId: '420840767' },
  { movie: 'Horizon Forbidden West', albumId: '304716997' },
  { movie: 'Days Gone', albumId: '93491262' },
  { movie: 'Uncharted 4', albumId: '207000562' },
  { movie: 'Detroit Become Human', albumId: '420682597' },
  { movie: 'Beyond Two Souls', albumId: '12788184' },
  { movie: 'Little Nightmares', albumId: '829528521' },
  { movie: 'Inside', albumId: '325646287' },
  { movie: 'Limbo', albumId: '228487222' },
  { movie: 'Gris', albumId: '508680571' },
  { movie: 'Firewatch', albumId: '77498972' },
  { movie: 'Night in the Woods', albumId: '98224022' },
  { movie: 'Slay the Spire', albumId: '80830042' },
  { movie: 'Into the Breach', albumId: '58648192' },
  { movie: 'FTL', albumId: '14509546' },
  { movie: 'Terraria', albumId: '181564652' },
  { movie: 'Hyper Light Drifter', albumId: '633380821' },
  { movie: 'Dead Cells', albumId: '68587421' },
  { movie: 'Cuphead', albumId: '50988402' },
  { movie: 'Shovel Knight', albumId: '247183162' },
  { movie: 'Katamari Damacy', albumId: '557072802' },
  { movie: 'Persona 3', albumId: '550065052' },
  { movie: 'Nier Replicant', albumId: '955282131' },
  { movie: 'Tekken 7', albumId: '528028342' },
  { movie: 'Guilty Gear Strive', albumId: '314541027' },
  { movie: 'Mortal Kombat 11', albumId: '100751482' },
  { movie: 'Metro Exodus', albumId: '100960382' },
  { movie: 'S.T.A.L.K.E.R.', albumId: '666680201' },
  { movie: 'Kingdom Come Deliverance', albumId: '707807411' },
  { movie: 'Far Cry 5', albumId: '68418681' },
  { movie: 'Watch Dogs 2', albumId: '14441992' },
  { movie: 'Returnal', albumId: '308390927' },
  { movie: 'Sackboy', albumId: '190770212' },
  { movie: 'Astro Bot', albumId: '647697451' },
  { movie: 'It Takes Two', albumId: '424119687' },
  { movie: 'A Way Out', albumId: '349922767' },
  { movie: 'Unravel', albumId: '122368432' },
  { movie: 'Ori and the Will of the Wisps', albumId: '134031992' },
  { movie: 'Sea of Stars', albumId: '518169002' },
  { movie: 'Chained Echoes', albumId: '380978097' },
  { movie: 'Pizza Tower', albumId: '435473127' },
  { movie: 'Hi-Fi Rush', albumId: '854985072' },
  { movie: 'Signalis', albumId: '445993705' },
  { movie: 'Lies of P', albumId: '513191791' },
  { movie: 'Palworld', albumId: '1039556682' },
  { movie: 'Pacific Drive', albumId: '546143802' },
  { movie: 'Alan Wake', albumId: '98719952' },
  { movie: 'Tell Me Why', albumId: '173410042' },
  { movie: 'Immortality', albumId: '330907247' },
  { movie: 'Pentiment', albumId: '385381507' },
  { movie: 'Norco', albumId: '298616522' },
  { movie: 'Tunic', albumId: '528674712' },
  { movie: 'Neon White', albumId: '328337837' },
  { movie: 'Ghostrunner', albumId: '182991392' },
  { movie: 'Furi', albumId: '795456621' },
  { movie: 'Rez Infinite', albumId: '266165172' },
  { movie: 'Tetris Effect', albumId: '151929852' },
  { movie: 'Beat Saber', albumId: '61213582' },
  { movie: 'Titanfall 2', albumId: '132387362' },
  { movie: 'Halo Infinite', albumId: '430144307' },
  { movie: 'Gears 5', albumId: '208974142' },
  { movie: 'Forza Motorsport', albumId: '494933461' },
  { movie: 'Minecraft Dungeons', albumId: '155858992' },
  { movie: 'Subnautica', albumId: '56831252' },
  { movie: 'Satisfactory', albumId: '665502881' },
  { movie: 'Frostpunk', albumId: '224320792' },
  { movie: 'Cities Skylines', albumId: '97129372' },
  { movie: 'Total War Three Kingdoms', albumId: '228053742' },
  { movie: 'Age of Empires IV', albumId: '507333391' },
  { movie: 'Crusader Kings III', albumId: '858278812' },
  { movie: 'Stellaris', albumId: '112559122' },
  { movie: 'Europa Universalis IV', albumId: '96728932' },
  { movie: 'XCOM 2', albumId: '12246154' },
  { movie: 'Divinity Original Sin 2', albumId: '901430452' },
  { movie: 'Pillars of Eternity', albumId: '217946932' },
  { movie: 'Pathfinder Wrath of the Righteous', albumId: '261338332' },
  { movie: 'Wasteland 3', albumId: '234385652' },
  { movie: 'Fallout 4', albumId: '850235822' },
  { movie: 'The Outer Worlds', albumId: '124040512' },
  { movie: 'Starfield', albumId: '475796135' },
  { movie: 'Mass Effect 2', albumId: '155695602' },
  { movie: 'Mass Effect 3', albumId: '96465052' },
  { movie: 'Dragon Age Inquisition', albumId: '96466432' },
  { movie: 'Anthem', albumId: '97240932' },
  { movie: 'Star Wars Jedi Fallen Order', albumId: '167428042' },
  { movie: 'Star Wars Squadrons', albumId: '175649952' },
  { movie: 'Battlefield 1', albumId: '67439212' },
  { movie: 'Call of Duty Modern Warfare', albumId: '375206067' },
  { movie: 'Titanfall', albumId: '113728002' },
  { movie: 'Half-Life Alyx', albumId: '956365801' },
  { movie: 'Portal', albumId: '1053383092' },
  { movie: 'Warframe', albumId: '71855572' },
  { movie: 'Genshin Impact', albumId: '365537727' },
  { movie: 'Honkai Star Rail', albumId: '1031181382' },
  { movie: 'Arknights', albumId: '387008397' },
  { movie: 'Granblue Fantasy', albumId: '545671372' },
  { movie: 'Ys VIII', albumId: '631565811' },
  { movie: 'Tales of Arise', albumId: '386870967' },
  { movie: 'Scarlet Nexus', albumId: '846996192' },
  { movie: 'Code Vein', albumId: '355845007' },
  { movie: 'God Eater', albumId: '400285817' },
  { movie: 'Soul Hackers 2', albumId: '469351615' },
  { movie: 'Shin Megami Tensei V', albumId: '468754905' },
  { movie: 'Danganronpa', albumId: '145158482' },
  { movie: 'Ghostwire Tokyo', albumId: '302491367' },
  { movie: 'Resident Evil 4', albumId: '487254415' },
  { movie: 'Dead Space', albumId: '108578782' },
  { movie: 'Silent Hill', albumId: '574356211' },
  { movie: 'Amnesia', albumId: '11805736' },
  { movie: 'Outlast', albumId: '85444152' },
  { movie: 'Until Dawn', albumId: '672553761' },
  { movie: 'The Quarry', albumId: '142708062' },
  { movie: 'Alien Isolation', albumId: '649866101' },
  { movie: 'Soma', albumId: '138123692' },
  { movie: 'Elite Dangerous', albumId: '418408777' },
  { movie: 'Hardspace Shipbreaker', albumId: '578121071' },
];

/**
 * Anime, film and series together, because the music does not respect the split — a composer's
 * palette for a long-running series is as recognisable as any film score, and viewers do not
 * think of them as different things.
 *
 * The Ghibli entries moved here out of the film scores, where they were the only non-Western
 * thing in a list of Hollywood. Hisaishi belongs next to Sawano and Ushio rather than next to
 * Zimmer.
 *
 * Franchise-labelled for the same reason as everywhere else: what Deezer carries is usually one
 * season or one film of a series (Attack on Titan Season 3, Evangelion III, Naruto's Road to
 * Ninja), and those share their themes with the rest, so pinning the answer to the instalment
 * would mark a correct recognition wrong.
 *
 * Cowboy Bebop was rejected. The album that comes back is the Netflix *live-action* series, and
 * although it is Seatbelts playing, it is not the thing anyone means by Cowboy Bebop. Your Name,
 * Akira, Ghost in the Shell, A Silent Voice, Paprika and Perfect Blue simply are not on Deezer —
 * this is the one area where the catalogue has real gaps rather than bad matches.
 */
const ANIME_TITLES: MovieAlbum[] = [
  { movie: 'Spirited Away', albumId: '181915142' },
  { movie: "Howl's Moving Castle", albumId: '181915712' },
  { movie: 'Princess Mononoke', albumId: '181915022' },
  { movie: 'My Neighbor Totoro', albumId: '181915672' },
  { movie: "Kiki's Delivery Service", albumId: '181916442' },
  { movie: 'Ponyo', albumId: '181915702' },
  { movie: 'Suzume', albumId: '372101037' },
  { movie: 'Attack on Titan', albumId: '100049482' },
  { movie: 'Jujutsu Kaisen', albumId: '955540351' },
  { movie: 'Neon Genesis Evangelion', albumId: '383249417' },
  { movie: 'Naruto', albumId: '257074532' },
  { movie: 'Death Note', albumId: '548659902' },
  { movie: 'Fullmetal Alchemist', albumId: '309993217' },
  { movie: 'Your Lie in April', albumId: '462685495' },
  { movie: 'Made in Abyss', albumId: '368207467' },
  { movie: 'Steins;Gate', albumId: '432611347' },
  { movie: 'Cyberpunk: Edgerunners', albumId: '499327601' },
  { movie: 'Chainsaw Man', albumId: '397326747' },
  { movie: 'Spy x Family', albumId: '386244647' },
  { movie: 'Vinland Saga', albumId: '183223872' },
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
  /*
   * Its own collection rather than folded into the film scores: naming a game from its music is
   * a different body of knowledge, and mixing the two would make a round's difficulty depend on
   * which kind it happened to draw.
   */
  {
    id: 'movies-anime',
    label: 'Guess the Anime',
    blurb: 'Ghibli, Attack on Titan, Chainsaw Man — name the anime from its score',
    kind: 'score',
    movies: ANIME_TITLES,
  },
  {
    id: 'movies-games',
    label: 'Guess the Game: Video Games',
    blurb: 'Elden Ring, Minecraft, Undertale — name the game from its soundtrack',
    kind: 'score',
    movies: GAME_SOUNDTRACKS,
  },
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
