import cors from 'cors';
import helmet from 'helmet';
import type { Express } from 'express';
import { env } from '../env';

export function applySecurityMiddleware(app: Express): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // Allow Google Fonts stylesheet (Inter)
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          // Allow Google Fonts glyphs
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'https://*.dzcdn.net', 'data:'],
          mediaSrc: ["'self'", 'https://*.dzcdn.net'],
          // Bare `ws:`/`wss:` scheme sources allow a socket to *any* host, which would let
          // injected script exfiltrate over a WebSocket the rest of this policy is careful to
          // prevent. Multiplayer's socket is attached to this same server, so same-origin is
          // all it ever needs — browsers match a same-origin ws://wss:// URL against 'self'.
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Only apply CORS when the frontend runs on a separate origin (development).
  // In production the frontend is served from the same Express process.
  if (env.CORS_ORIGIN.length > 0) {
    app.use(
      cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      }),
    );
  }

  app.disable('x-powered-by');
}
