import type { Request } from 'express';

export interface Identity {
  userId: string | null;
  guestId: string | null;
}

/** The playing identity for the current request: a logged-in user, or the anonymous guest
 * session issued by `sessionMiddleware`. Shared by any route that records per-player game
 * state (puzzle guesses, artist-challenge progress, stats). */
export function getIdentity(req: Request): Identity {
  if (req.session.userId) {
    return { userId: req.session.userId, guestId: null };
  }
  return { userId: null, guestId: req.session.guestId };
}

export function ownerKeyFor(identity: Identity, fallbackGuestId: string): string {
  return identity.userId ?? identity.guestId ?? fallbackGuestId;
}
