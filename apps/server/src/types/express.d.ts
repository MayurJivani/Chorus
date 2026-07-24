import type { RequestSession } from '../auth/session';

declare global {
  namespace Express {
    interface Request {
      session: RequestSession;
    }
  }
}

export {};
