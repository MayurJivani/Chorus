import { describe, it, expect } from 'vitest';
import { __testing } from './knockJoin';

const { CONFIG, CODE } = __testing;

describe('the carrier', () => {
  it('stays above hearing', () => {
    // The point of the surviving profile: it is somewhere nothing else in a room is, which is
    // why it decodes quickly even with a song playing. An audible variant was tried and
    // dropped — every band loud enough to hear already has speech, consonants or cymbals in it.
    expect(CONFIG.baseHz).toBeGreaterThanOrEqual(17000);
  });

  it('never puts a data tone on top of the sync tone', () => {
    // A data tone colliding with the preamble would make frames undetectable.
    const topData = CONFIG.baseHz + 7 * CONFIG.spacingHz;
    expect(CONFIG.syncHz).toBeGreaterThan(topData);
  });

  it('needs a capture rate most phones give but Firefox does not', () => {
    // Documents the known limit rather than pretending it away: 48kHz capture carries this,
    // Firefox's 32kHz does not, and the listener reports that instead of hanging.
    expect(48000 / 2).toBeGreaterThan(CONFIG.syncHz);
    expect(32000 / 2).toBeLessThan(CONFIG.syncHz);
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
