import rateLimit from 'express-rate-limit';
import { env } from '../env';

// express-rate-limit instances are module-level singletons shared by every `createApp()`
// call within a process, which includes the whole integration test suite — a real limit here
// would make unrelated tests fail once enough requests accumulate across test files. Rate
// limiting itself isn't what those tests are exercising, so use an effectively-unlimited cap
// under test and keep the real production limits otherwise.
const isTest = env.NODE_ENV === 'test';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 100_000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

export const guessRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 100_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many guesses. Please slow down.' },
});

export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 100_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many search requests. Please slow down.' },
});
