import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger';
import { env } from '../env';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}

/** Recognizes both our own HttpError and third-party libraries (e.g. csrf-csrf's
 * http-errors-based ForbiddenError) that follow the same `status`/`statusCode` convention. */
function getHttpStatus(err: unknown): number | undefined {
  if (err instanceof HttpError) return err.status;
  if (typeof err === 'object' && err !== null) {
    const candidate =
      (err as { status?: unknown; statusCode?: unknown }).status ??
      (err as { statusCode?: unknown }).statusCode;
    if (typeof candidate === 'number' && candidate >= 400 && candidate < 600) return candidate;
  }
  return undefined;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const status = getHttpStatus(err) ?? 500;
  const isClientError = status >= 400 && status < 500;
  const message = isClientError && err instanceof Error ? err.message : 'Internal server error';

  if (!isClientError) {
    logger.error({ err, path: req.path }, 'Unhandled error');
  } else {
    logger.warn({ path: req.path, status }, 'Request rejected');
  }

  res.status(status).json({
    error: isClientError ? message : 'Internal server error',
    ...(env.NODE_ENV !== 'production' && !isClientError && err instanceof Error
      ? { stack: err.stack }
      : {}),
  });
}
