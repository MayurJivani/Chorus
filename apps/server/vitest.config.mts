import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
      CSRF_SECRET: 'test-csrf-secret-at-least-32-characters-long-x',
      CORS_ORIGIN: 'http://localhost:5173',
    },
  },
});
