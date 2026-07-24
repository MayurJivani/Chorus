# Chorus

A daily music-guessing game — hear a growing snippet of a song and guess it in as few listens
as possible. Guests can play immediately; creating an account keeps streaks and stats forever.

Two modes:

- **Daily puzzle** (`/play`) — one shared song per UTC day, guaranteed not to repeat until every
  active song in the bank has had a turn (see `getOrCreateDailyPuzzle` in
  `apps/server/src/services/puzzleService.ts`).
- **Artist Mode** (`/artist`) — pick any artist and play a shared 10-song daily challenge drawn
  live from their Deezer discography, solo or "multiplayer" (an async shared challenge — same
  10 songs for everyone who plays that artist that day, compared on a per-artist leaderboard;
  see `apps/server/src/services/artistChallengeService.ts`). Guess by typing (autocomplete) or
  picking from 3 multiple-choice options — both are scoped to the artist's whole filtered
  catalog (~50 tracks), not just today's 10, so they don't trivially give away the answer set.
  Karaoke/tribute/acoustic/live/remix/etc. versions are always excluded (`apps/server/src/utils/trackFilters.ts`);
  an "include featured tracks" toggle controls whether collaborations where the artist is only
  a credited feature (e.g. "... ft. Coldplay") are eligible — this is part of the challenge's
  identity (`artist_challenges.include_features`), so "with" and "without" are two independent,
  still-deterministic daily challenges.

## Stack

- **Frontend** (`apps/web`): React 18 + Vite + TypeScript, Tailwind CSS, Framer Motion.
- **Backend** (`apps/server`): Express + TypeScript, SQLite via Drizzle ORM + `better-sqlite3`.
- **Audio**: [Deezer](https://www.deezer.com)'s public search API for 30-second preview clips
  (audio-only, no video, no API key required). See [About](apps/web/src/routes/AboutPage.tsx)
  for attribution.

## Getting started

```bash
npm install

# apps/server/.env — copy from .env.example and fill in SESSION_SECRET / CSRF_SECRET
# (generate each with: openssl rand -hex 32)
cp apps/server/.env.example apps/server/.env

# apps/web/.env.local — copy from .env.example (defaults are fine for local dev)
cp apps/web/.env.example apps/web/.env.local

npm run -w apps/server db:migrate   # create the SQLite schema
npm run curate:songs                # populate the song bank from Deezer (no API key needed)

npm run dev                         # starts both the API (8888) and the web app (5174)
```

## Scripts (run from the repo root)

| Script                   | What it does                                                                   |
| ------------------------ | ------------------------------------------------------------------------------ |
| `npm run dev`            | Runs both `apps/server` and `apps/web` dev servers together                    |
| `npm run lint`           | Lints both apps and `scripts/`                                                 |
| `npm run typecheck`      | Typechecks both apps and `scripts/`                                            |
| `npm run test`           | Runs the Vitest suites for both apps                                           |
| `npm run build`          | Production builds for both apps                                                |
| `npm run curate:songs`   | Populates the `songs` table from a curated title/artist seed list              |
| `npm run reverify:songs` | Re-checks existing songs are still available on Deezer, deactivating dead ones |

## Song bank

`scripts/song-candidates.json` is the maintainer-edited seed list (title/artist pairs).
`scripts/curate-songs.ts` looks each one up on Deezer and inserts a verified row into `songs`.
Deezer's preview URLs are short-lived signed links (expire in minutes), so the server always
fetches a fresh one at request time (`apps/server/src/services/deezerService.ts`) rather than
reusing the value stored at curation time — the `songs.preview_url` column is just a
curation-time snapshot.

## Security notes

- Passwords are hashed with argon2id; sessions are opaque server-side tokens (httpOnly, Secure
  in production, SameSite=Lax) — not JWTs, so they're trivially revocable.
- CSRF is enforced via a double-submit cookie. The frontend reads the current token straight
  from the (non-httpOnly) `chorus_csrf` cookie on every state-changing request rather than
  caching it — the cookie is the source of truth and the server keeps it in sync on every
  session rotation, including the _silent_ guest-session reissue in `sessionMiddleware` (not
  just explicit login/register/logout), so the client can never hold a stale cached copy.
- Guests get a session immediately (no signup friction); registering merges any guest stats onto
  the new account.
- See `apps/server/src/middleware/` for rate limiting, input validation (zod), security headers
  (helmet/CSP), and centralized error handling.

## Deployment

The backend needs a host with a **persistent writable filesystem** for the SQLite file (Fly.io,
Render, or a small VPS) — not a serverless/stateless platform. The frontend's static build can
go anywhere (Vercel, Netlify, Cloudflare Pages, or the same host as the backend). Back up the
SQLite file regularly (e.g. [Litestream](https://litestream.io/) to S3-compatible storage) for a
public deployment.
