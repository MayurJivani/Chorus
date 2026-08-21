import { doubleCsrf } from 'csrf-csrf';
import type { Request } from 'express';
import { env } from '../env';

const { generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  getSessionIdentifier: (req: Request) => req.session.id,
  cookieName: env.NODE_ENV === 'production' ? '__Host-chorusify.csrf' : 'chorusify_csrf',
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: env.NODE_ENV === 'production',
    httpOnly: false, // must be readable by client JS to echo back in the X-CSRF-Token header
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req: Request) => req.headers['x-csrf-token'],
});

export { generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError };
