import { describe, it, expect } from 'vitest';
import { passwordProblems, isPasswordAcceptable } from '../../src/utils/passwordPolicy';

/**
 * The rule used to be "at least 8 characters", which accepts every password an attacker tries
 * first. These pin the shapes that matter — guessable ones — rather than character-class rules,
 * which mostly produce "Password1!" and no extra safety.
 */
describe('passwordProblems', () => {
  it('accepts an ordinary decent password', () => {
    expect(passwordProblems('marmalade-otter-7')).toEqual([]);
    expect(isPasswordAcceptable('correct horse battery')).toBe(true);
  });

  it('rejects anything too short', () => {
    expect(passwordProblems('short1')).toContainEqual(expect.stringContaining('at least 8'));
  });

  it('rejects the passwords everyone tries first', () => {
    for (const weak of ['password', 'PASSWORD', '12345678', 'iloveyou', 'chorusify']) {
      expect(isPasswordAcceptable(weak)).toBe(false);
    }
  });

  it('rejects one character repeated', () => {
    expect(passwordProblems('aaaaaaaaaa')).toContainEqual(expect.stringContaining('repeated'));
  });

  it('rejects a straight run in either direction', () => {
    expect(passwordProblems('abcdefgh')).toContainEqual(expect.stringContaining('straight run'));
    expect(passwordProblems('87654321')).toContainEqual(expect.stringContaining('straight run'));
  });

  it('allows a long password that merely contains a short run', () => {
    // The check is for a password that *is* a run, not one with "abc" somewhere inside it.
    expect(isPasswordAcceptable('quiet-abc-lantern')).toBe(true);
  });

  /* Details already on the account are known to exactly the people most likely to try. */
  it('rejects a password built from the email address', () => {
    expect(passwordProblems('mayur12345', { email: 'mayur@example.com' })).toContainEqual(
      expect.stringContaining('email'),
    );
  });

  it('rejects a password built from the display name', () => {
    expect(passwordProblems('IcarusFalls99', { displayName: 'IcarusFalls' })).toContainEqual(
      expect.stringContaining('display name'),
    );
  });

  it('ignores a very short email local part, which would match almost anything', () => {
    // "jo" appearing inside a password says nothing; only treat it as derived at 3+ characters.
    expect(isPasswordAcceptable('jonquil-thicket', { email: 'jo@example.com' })).toBe(true);
  });

  it('catches whitespace a user cannot see when they later fail to log in', () => {
    expect(passwordProblems('marmalade-otter ')).toContainEqual(expect.stringContaining('space'));
  });

  it('reports every problem at once rather than one at a time', () => {
    const problems = passwordProblems('mayur', { email: 'mayur@example.com' });
    expect(problems.length).toBeGreaterThan(1);
  });
});
