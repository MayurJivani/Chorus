import { motion } from 'framer-motion';

const sections = [
  {
    icon: '🎵',
    title: 'How it works',
    body: "Every day there's one new song to guess. You start with a one-second snippet — if you don't know it, skip or guess wrong and the snippet grows: 1, 2, 4, 7, 11, then 16 seconds. Guess correctly in as few listens as possible to keep your streak alive.",
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
        . All rights to the underlying recordings belong to their respective artists and labels —
        Chorus only plays short preview clips for the purpose of the guessing game.
      </p>
    ),
  },
  {
    icon: '🔒',
    title: 'Your data',
    body: 'You can play as a guest with no account — your streak and stats are tied to your browser session. Creating an account lets you keep your stats permanently and across devices. Passwords are hashed with argon2id and never stored in plain text.',
  },
];

export function AboutPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-2xl flex-col gap-6 px-4 py-12">
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
    </div>
  );
}
