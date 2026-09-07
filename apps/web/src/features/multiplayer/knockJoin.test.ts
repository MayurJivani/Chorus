import { describe, it, expect } from 'vitest';
import { knockProfile, __testing } from './knockJoin';

const { PROFILES, CODE } = __testing;

describe('knock profiles', () => {
  it('maps the admin toggle to the two variants', () => {
    expect(knockProfile(false)).toBe('default');
    expect(knockProfile(true)).toBe('jingle');
  });

  it('keeps the silent profile above hearing and the chime inside it', () => {
    // The whole point of the split: one is meant to be inaudible, the other audible.
    expect(PROFILES.default.baseHz).toBeGreaterThanOrEqual(17000);
    expect(PROFILES.jingle.syncHz).toBeLessThan(4000);
  });

  it('keeps every jingle tone under the Nyquist limit of a resampled microphone', () => {
    // Firefox resamples microphone input to 32kHz, which is why the silent profile is
    // unreceivable there. The chime only earns its place if it survives that.
    const top = PROFILES.jingle.syncHz;
    expect(top).toBeLessThan(32000 / 2);
  });

  it('never puts a data tone on top of the sync tone', () => {
    // A data tone colliding with the preamble would make frames undetectable.
    for (const p of Object.values(PROFILES)) {
      const topData = p.baseHz + 7 * p.spacingHz;
      expect(p.syncHz).toBeGreaterThan(topData);
    }
  });
});

describe('received payload validation', () => {
  it('accepts a room code', () => {
    expect(CODE.test('ESXT2B')).toBe(true);
  });

  it('rejects anything that is not one', () => {
    // Anyone with a speaker can transmit and the CRC is not a signature, so a decoded frame is
    // untrusted input — it must not reach the join call unchecked.
    for (const bad of ['', 'ab', 'esxt2b', 'ESXT 2B', '../../etc', 'A'.repeat(13), '<script>']) {
      expect(CODE.test(bad), bad).toBe(false);
    }
  });
});
