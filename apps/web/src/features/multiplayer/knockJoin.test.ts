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
    expect(PROFILES.jingle.syncHz).toBeLessThan(16000);
    expect(PROFILES.jingle.baseHz).toBeLessThan(15000);
  });

  it('keeps the chime above the noise a room actually makes', () => {
    /*
     * Three things share the audible spectrum with this carrier, and the band has to clear
     * all of them:
     *   - the speech band phones actively gate and suppress (to ~3.4kHz)
     *   - consonant energy, which is mostly 4-8kHz — an "s" is almost all of it
     *   - hi-hats and cymbals, the loudest thing in most music above 4kHz
     * Fans roll off steeply with frequency and are a non-issue this high.
     */
    expect(PROFILES.jingle.baseHz).toBeGreaterThanOrEqual(8000);
  });

  it('keeps a noisy-room margin between neighbouring tones', () => {
    // Wide spacing is what makes a noisy bin have to be very wrong to beat the real tone.
    expect(PROFILES.jingle.spacingHz).toBeGreaterThanOrEqual(300);
  });

  it('gives the chime a longer preamble than the silent profile', () => {
    // Frame lock is the part a burst of noise breaks, and it is the cheapest place to buy
    // reliability back.
    expect(PROFILES.jingle.syncSymbols).toBeGreaterThan(PROFILES.default.syncSymbols);
  });

  it('keeps a chime frame short enough to retry quickly', () => {
    // 27 symbols carry a six-character room code. At 60ms that was 1.6s before a retry could
    // even start, which is most of what "takes too long" was.
    const frameMs = (PROFILES.jingle.syncSymbols + 24) * PROFILES.jingle.symbolMs;
    expect(frameMs).toBeLessThan(1250);
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
