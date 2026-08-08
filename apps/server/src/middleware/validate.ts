import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    if (target === 'query') {
      // Express 5 exposes req.query via a prototype getter that re-parses on every access,
      // so Object.assign would mutate a throwaway object. Replace it with an own property
      // holding the validated (and transformed) query values instead.
      Object.defineProperty(req, 'query', {
        value: result.data,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      req[target] = result.data;
    }
    next();
  };
}
