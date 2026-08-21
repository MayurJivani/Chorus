<div align="center">

# 📼 Chorusify 🎧

### _Guess your favorite music._

A snippet plays. The needle drops. The clock ticks.
**Do you actually know the song, or do you just think you do?**

**[▶ chorusify.com](https://chorusify.com)**

</div>

<br>

> _For everyone who's ever finished a lyric before the singer did. For the ones who know a song from its first half-second. For the people who still argue about which is the "real" version of a track. This one's for you._

---

## 🎶 Modes

**Daily** — One song. Dropped at midnight UTC. The whole world guesses the same track, at the same time. Did you nail it before your friends woke up?

**Artist** — Pick a discography, any discography, and go 10 rounds deep. Type it out from memory or pick from the lineup. Real leaderboards, per artist, for the true completionists.

**Multiplayer** — Up to 8 in a room, real-time, no sign-up. Songs unfold second by second (`1s → 2s → 4s → 7s → 11s → 16s`), and _you_ decide how much you need to hear before you buzz in. Hesitate too long and someone else calls it first.

**Survival** — One song after another, no end in sight, until the one that finally gets you. How deep does your crate go?

**Era** — Strip it back to a single decade. '60s soul, '90s grunge, 2000s pop, wherever your ear was raised.

_Karaoke covers, live cuts, and remixes don't make the bank. Originals only, no cheap wins, just the real thing._

---

## 🛠 Built With

```
apps/web     React 19 · Vite 8 · TypeScript · Tailwind v4 · Framer Motion
apps/server  Express 5 · TypeScript · PostgreSQL · Drizzle ORM · postgres.js
realtime     WebSockets (ws), same-origin, session-authenticated
music data   Deezer API, 30s previews, thousands of tracks deep
```

---

## 🎧 Sound Check

Get it spinning locally before you drop the needle for real.

```bash
npm install
cp apps/server/.env.example apps/server/.env
openssl rand -hex 32          # session secret

npm run -w apps/server db:migrate
npm run curate:songs
npm run dev                    # api :8888, web :5174
```

| Script               | What it does                          |
| -------------------- | ------------------------------------- |
| `dev`                | frontend + backend, watch mode        |
| `build`              | production build                      |
| `lint` / `typecheck` | keep the code in tune                 |
| `test`               | full suite, isolated `_test` database |
| `curate:songs`       | stock the crate from Deezer           |
| `reverify:songs`     | make sure every track still plays     |

---

## 🚀 Deploy

Set `DATABASE_URL`, ship it. Migrations run automatically on boot.

```bash
npm run build:full && npm start
```

The frontend also ships standalone to Vercel, Netlify, or Cloudflare Pages, if you'd rather split the set.

---

## 🔒 Security

Argon2id · opaque server-side sessions · double-submit CSRF · rate limiting · Zod validation · Helmet + CSP

---

<div align="center">

_Made for anyone who's ever shouted the song title before the first verse even landed._

**Built with ❤️ and 🎵**

[chorusify.com](https://chorusify.com)

</div>
