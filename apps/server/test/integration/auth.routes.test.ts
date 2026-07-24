import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db/client';
import { users, sessions } from '../../src/db/schema';

const app = createApp();

beforeEach(() => {
  db.delete(sessions).run();
  db.delete(users).run();
});

async function getCsrfToken(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get('/api/csrf-token');
  return res.body.csrfToken as string;
}

describe('auth routes', () => {
  it('issues a guest session on first contact', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(res.body.guestId).toEqual(expect.any(String));
  });

  it('registers a new user and returns a usable fresh csrf token', async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const registerRes = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'new@example.com',
        password: 'correct horse battery staple',
        displayName: 'New',
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user.email).toBe('new@example.com');
    expect(registerRes.body.csrfToken).toEqual(expect.any(String));

    // The token issued before registration is bound to the pre-rotation session and must be rejected now.
    const staleAttempt = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrfToken);
    expect(staleAttempt.status).toBe(403);

    // The fresh token returned by register works immediately.
    const freshAttempt = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', registerRes.body.csrfToken);
    expect(freshAttempt.status).toBe(200);
  });

  it('rejects registration without a valid CSRF token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'nocsrf@example.com',
        password: 'correct horse battery staple',
        displayName: 'X',
      });
    expect(res.status).toBe(403);
  });

  it('rejects a duplicate email with 409', async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'dup@example.com',
        password: 'correct horse battery staple',
        displayName: 'A',
      });

    const csrfToken2 = await getCsrfToken(agent);
    const res = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken2)
      .send({ email: 'dup@example.com', password: 'another password 123', displayName: 'B' });

    expect(res.status).toBe(409);
  });

  it('rejects login with a wrong password and accepts the right one', async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);
    const registerRes = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'login@example.com',
        password: 'correct horse battery staple',
        displayName: 'A',
      });
    const logoutRes = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', registerRes.body.csrfToken);
    expect(logoutRes.status).toBe(200);

    const loginCsrf = await getCsrfToken(agent);
    const wrong = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', loginCsrf)
      .send({ email: 'login@example.com', password: 'wrong password' });
    expect(wrong.status).toBe(401);

    const right = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', loginCsrf)
      .send({ email: 'login@example.com', password: 'correct horse battery staple' });
    expect(right.status).toBe(200);
    expect(right.body.user.email).toBe('login@example.com');
  });
});
