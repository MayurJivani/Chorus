import path from 'path';
import fs from 'fs';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { applySecurityMiddleware } from './middleware/security';
import { sessionMiddleware } from './auth/session';
import { doubleCsrfProtection, generateCsrfToken } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './logger';
import { getPublicGameConfig } from './services/settingsService';
import { renderIndexWithPreview } from './middleware/ogTags';
import { authRouter } from './routes/auth.routes';
import { songsRouter } from './routes/songs.routes';
import { puzzleRouter } from './routes/puzzle.routes';
import { statsRouter } from './routes/stats.routes';
import { artistsRouter } from './routes/artists.routes';
import { multiplayerRouter } from './routes/multiplayer.routes';
import { leaderboardRouter } from './routes/leaderboard.routes';
import { categoriesRouter } from './routes/categories.routes';
import { survivalRouter } from './routes/survival.routes';
import { eraRouter } from './routes/era.routes';
import { challengesRouter } from './routes/challenges.routes';
import { duelsRouter } from './routes/duels.routes';
import { adminRouter } from './routes/admin.routes';
import { friendsRouter } from './routes/friends.routes';
import { profileRouter } from './routes/profile.routes';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  applySecurityMiddleware(app);
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Player-facing game config (snippet schedule, guess count, run length). Public because the
  // client needs it before anyone has logged in, and it contains nothing sensitive — the same
  // numbers are already visible in any challenge response.
  app.get('/api/config', (_req, res, next) => {
    getPublicGameConfig()
      .then((config) => res.json(config))
      .catch(next);
  });

  app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: generateCsrfToken(req, res) });
  });

  app.use(doubleCsrfProtection);

  app.use('/api/auth', authRouter);
  app.use('/api/songs', songsRouter);
  app.use('/api/puzzle', puzzleRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/artists', artistsRouter);
  app.use('/api/multiplayer', multiplayerRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/survival', survivalRouter);
  app.use('/api/era', eraRouter);
  app.use('/api/challenges', challengesRouter);
  app.use('/api/duels', duelsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/friends', friendsRouter);
  app.use('/api/profile', profileRouter);

  // Serve the built Vite frontend in production.
  // `public/` lives alongside `dist/` (i.e. at <server-root>/public).
  // In development this directory won't exist and Express will fall through.
  const publicDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    // `index: false` matters: with the default, this would answer "/" with index.html directly
    // and the catch-all below would never run for the homepage — leaving the most-shared URL of
    // all with a relative og:image, which every crawler ignores.
    app.use(express.static(publicDir, { index: false }));
    // SPA catch-all: serve index.html for any non-/api route so that
    // client-side routes (e.g. /play, /artist) work on hard refresh.
    //
    // The HTML is rewritten rather than sent verbatim so that a shared link previews as what it
    // actually is. Crawlers don't run JavaScript, so tags React sets at runtime are invisible to
    // them, and every link — a Queen challenge, a survival streak — previewed identically.
    app.get('/{*path}', (req, res, next) => {
      const indexPath = path.join(publicDir, 'index.html');
      if (!fs.existsSync(indexPath)) {
        next();
        return;
      }

      renderIndexWithPreview(indexPath, req)
        .then((html) => res.type('html').send(html))
        .catch((err) => {
          // A preview is cosmetic — fall back to the unmodified page rather than 500 a route
          // that would otherwise have worked.
          logger.warn({ err, path: req.path }, 'Falling back to the unmodified index.html');
          res.sendFile(indexPath);
        });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
