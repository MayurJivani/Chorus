import { motion } from 'framer-motion';

const sections = [
  {
    icon: '🎵',
    title: 'How it works',
    body: "Every day there's one new song to guess. You start with a one-second snippet. If you don't know it, skip or guess wrong and the snippet grows: 1, 2, 4, 7, 11, then 16 seconds. Guess correctly in as few listens as possible to keep your streak alive.",
  },
  {
    icon: '🎤',
    title: 'Three ways to play',
    body: null,
    jsx: (
      <ul className="flex flex-col gap-1.5 text-slate-400 text-sm leading-relaxed">
        <li>
          <span className="font-medium text-slate-200">Daily Challenge</span>: one shared song per
          day, keep your streak alive.
        </li>
        <li>
          <span className="font-medium text-slate-200">Artist Mode</span>: pick any artist and guess
          10 songs from their discography.
        </li>
        <li>
          <span className="font-medium text-slate-200">Multiplayer</span>: race friends in real time
          on a shared snippet timer.
        </li>
      </ul>
    ),
  },
  {
    icon: '🎧',
    title: 'Music credit',
    body: null,
    jsx: (
      <p className="text-slate-400 leading-relaxed">
        Song previews are provided by{' '}
        <a
          href="https://www.deezer.com"
          className="font-medium text-chorus-accent2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Deezer
        </a>
        . All rights to the underlying recordings belong to their respective artists and labels.
        Chorus only plays short preview clips for the purpose of the guessing game.
      </p>
    ),
  },
  {
    icon: '🔒',
    title: 'Your data',
    body: 'You can play as a guest with no account. Your streak and stats are tied to your browser session. Creating an account lets you keep your stats permanently and across devices. Passwords are hashed with argon2id and never stored in plain text.',
  },
];

const team = [
  {
    name: 'Mayur Jivani',
    github: 'https://github.com/MayurJivani',
  },
  {
    name: 'Ritwik Garg',
    github: 'https://github.com/ritwikgarg',
  },
];

export function AboutPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 sm:gap-6 px-4 py-4 sm:py-8">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-2">
        <h1 className="text-4xl font-extrabold gradient-text">About Chorus</h1>
        <p className="mt-2 text-slate-400">The daily music guessing game.</p>
      </motion.div>

      <div className="flex flex-col gap-4">
        {sections.map(({ icon, title, body, jsx }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="glass rounded-2xl p-6 flex gap-4"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-chorus-accent/15 text-xl">
              {icon}
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="font-bold text-white">{title}</h2>
              {jsx ?? <p className="text-slate-400 leading-relaxed">{body}</p>}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Built by */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 + sections.length * 0.08 }}
        className="glass rounded-2xl p-6 flex gap-4"
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-chorus-accent/15 text-xl">
          👥
        </span>
        <div className="flex flex-col gap-3">
          <h2 className="font-bold text-white">Built by</h2>
          <div className="flex flex-wrap gap-3">
            {team.map((member) => (
              <a
                key={member.github}
                href={member.github}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 transition-all duration-200 hover:border-chorus-accent/40 hover:bg-chorus-accent/10 hover:-translate-y-0.5"
              >
                {/* GitHub icon */}
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-slate-400">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.607.069-.607 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10Z" />
                </svg>
                <span className="text-sm font-medium text-slate-200">{member.name}</span>
              </a>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
