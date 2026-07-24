# Chorus 🎵

**A daily music-guessing game.**

Listen to a growing snippet of a song and guess it in as few listens as possible.

🎮 **Play now:** [chorus.futile.studio](https://chorus.futile.studio?utm_source=chatgpt.com)

Guests can play instantly. Create an account to permanently save your streaks and stats.

## 🎯 Game Modes

### Daily Puzzle

One shared song every UTC day. Songs are guaranteed not to repeat until every active song in the bank has been played.

### Artist Mode

Pick an artist and play a shared **10-song daily challenge** generated from their Deezer discography.

* 🏆 Per-artist leaderboards
* 👤 Solo or async multiplayer
* 🔎 Type-to-guess with autocomplete
* 🔘 3-option multiple choice
* ⭐ Optional featured tracks

Both guessing methods use the artist's full filtered catalog, not just the day's 10 songs.

Karaoke, tribute, acoustic, live, remix, and other alternate versions are automatically excluded.

## 🛠️ Tech Stack

* **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Framer Motion
* **Backend:** Express, TypeScript, SQLite, Drizzle ORM, better-sqlite3
* **Audio:** Deezer public API with 30-second preview clips

## 🚀 Getting Started

```bash
npm install

cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local

npm run -w apps/server db:migrate
npm run curate:songs

npm run dev
```

The API runs on `8888` and the web app on `5174`.

Generate `SESSION_SECRET` and `CSRF_SECRET` with:

```bash
openssl rand -hex 32
```

## 📜 Scripts

| Command                  | Description                  |
| ------------------------ | ---------------------------- |
| `npm run dev`            | Start frontend and backend   |
| `npm run lint`           | Lint the project             |
| `npm run typecheck`      | Run TypeScript checks        |
| `npm run test`           | Run tests                    |
| `npm run build`          | Build for production         |
| `npm run curate:songs`   | Populate the song bank       |
| `npm run reverify:songs` | Re-check Deezer availability |

## 🔐 Security

* Argon2id password hashing
* Server-side opaque sessions
* CSRF protection
* Rate limiting
* Zod input validation
* Helmet security headers
* Content Security Policy

## 🚢 Deployment

The backend requires a **persistent writable filesystem** for SQLite. Suitable hosts include Fly.io, Render, or a VPS.

The frontend can be deployed as a static build to Vercel, Netlify, Cloudflare Pages, or alongside the backend.

Regularly back up the SQLite database for production deployments.

---

Built with ❤️ and 🎵
