/**
 * What counts as an acceptable password.
 *
 * The rule was `min(8)` and nothing else, which accepts "12345678", "password" and the user's
 * own display name — the three shapes that actually show up in credential-stuffing lists. The
 * checks here are deliberately about *guessability* rather than character-class theatre:
 * requiring a symbol mostly produces "Password1!", which is no harder to guess than "password".
 *
 * Shared with the client so the form can say the same thing before the request is made. The
 * server is the authority; the client copy is a courtesy.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Passwords common enough that an attacker tries them first.
 *
 * Deliberately short — a real breach corpus belongs behind a service, and a 100k-entry list
 * bundled into the server is mostly dead weight. These are the ones that show up unprompted.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'qwerty123',
  'iloveyou',
  'admin123',
  'letmein1',
  'welcome1',
  'abc12345',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'dragon123',
  'monkey123',
  'chorusify',
]);

/** Every character the same: "aaaaaaaa". */
function isSingleCharacter(value: string): boolean {
  return /^(.)\1+$/.test(value);
}

/** A straight run up or down the alphabet or number line: "12345678", "abcdefgh". */
function isSequential(value: string): boolean {
  if (value.length < 4) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < value.length; i += 1) {
    const delta = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (delta !== 1) ascending = false;
    if (delta !== -1) descending = false;
  }
  return ascending || descending;
}

export interface PasswordContext {
  email?: string;
  displayName?: string;
}

/**
 * Every reason this password is unacceptable, or an empty list if it is fine.
 *
 * Returns all of them rather than the first: a form that reveals one problem at a time turns
 * choosing a password into a guessing game of its own.
 */
export function passwordProblems(password: string, context: PasswordContext = {}): string[] {
  const problems: string[] = [];
  const lower = password.toLowerCase();

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Keep it under ${PASSWORD_MAX_LENGTH} characters`);
  }
  // Trimmable whitespace is nearly always an accident, and one the user cannot see when they
  // fail to log in later.
  if (password !== password.trim()) {
    problems.push('Remove the space at the start or end');
  }
  if (COMMON_PASSWORDS.has(lower)) {
    problems.push('That is one of the most-guessed passwords — pick something else');
  }
  if (password.length >= PASSWORD_MIN_LENGTH && isSingleCharacter(password)) {
    problems.push('Use more than one repeated character');
  }
  if (password.length >= PASSWORD_MIN_LENGTH && isSequential(lower)) {
    problems.push('Avoid a straight run like 12345678 or abcdefgh');
  }

  // Anything derived from details already on the account is public knowledge to anyone who
  // knows the person, which is exactly who most account takeovers come from.
  const emailLocal = context.email?.split('@')[0]?.toLowerCase();
  if (emailLocal && emailLocal.length >= 3 && lower.includes(emailLocal)) {
    problems.push('Do not build it out of your email address');
  }
  const name = context.displayName?.toLowerCase().replace(/\s+/g, '');
  if (name && name.length >= 3 && lower.replace(/\s+/g, '').includes(name)) {
    problems.push('Do not build it out of your display name');
  }

  return problems;
}

/** Convenience for call sites that only need a yes or no. */
export function isPasswordAcceptable(password: string, context: PasswordContext = {}): boolean {
  return passwordProblems(password, context).length === 0;
}
