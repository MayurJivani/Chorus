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
import { authRouter } from './routes/auth.routes';
import { songsRouter } from './routes/songs.routes';
import { puzzleRouter } from './routes/puzzle.routes';
import { statsRouter } from './routes/stats.routes';
import { artistsRouter } from './routes/artists.routes';
import { multiplayerRouter } from './routes/multiplayer.routes';
import { leaderboardRouter } from './routes/leaderboard.routes';

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

  // Serve the built Vite frontend in production.
  // `public/` lives alongside `dist/` (i.e. at <server-root>/public).
  // In development this directory won't exist and Express will fall through.
  const publicDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    // SPA catch-all: serve index.html for any non-/api route so that
    // client-side routes (e.g. /play, /artist) work on hard refresh.
    app.get('/{*path}', (_req, res, next) => {
      const indexPath = path.join(publicDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
