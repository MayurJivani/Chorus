import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 doesn't forward rejected promises from async handlers to the error middleware
 * on its own — this wraps a handler so a thrown/rejected error reaches `next()` instead of
 * becoming an unhandled rejection. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
