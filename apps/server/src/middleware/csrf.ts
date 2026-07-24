import { doubleCsrf } from 'csrf-csrf';
import type { Request } from 'express';
import { env } from '../env';

const { generateToken, doubleCsrfProtection, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  getSessionIdentifier: (req: Request) => req.session.id,
  cookieName: env.NODE_ENV === 'production' ? '__Host-chorus.csrf' : 'chorus_csrf',
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: env.NODE_ENV === 'production',
    httpOnly: false, // must be readable by client JS to echo back in the X-CSRF-Token header
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req: Request) => req.headers['x-csrf-token'],
});

export { generateToken as generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError };
