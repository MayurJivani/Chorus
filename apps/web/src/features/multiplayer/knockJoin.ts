/**
 * Join-by-sound for Host Only rooms (Beta).
 *
 * In Host Only audio mode one device is already the room's speaker, so it can also announce the
 * room code as sound. Phones on the join page listen and fill the code in themselves — no
 * reading six characters off a TV and typing them wrong, no QR to photograph.
 *
 * Scoped to Host Only on purpose. When every phone plays its own audio there is no single
 * speaker to broadcast from, and several devices transmitting the same frame out of step is
 * worse than one — they smear each other.
 *
 * Wraps the vendored `knock-audio`; see ../../vendor/knock/README.md for why it is a copy.
 */
import { broadcast, listen } from '../../vendor/knock';

export type KnockProfile = 'default' | 'jingle';

/**
 * Frame geometry per profile. Both ends must agree — a receiver listening on the wrong tones
 * hears nothing at all rather than failing loudly — so the profile comes from one admin
 * setting that host and joiner both read from /api/config.
 */
const PROFILES: Record<
  KnockProfile,
  {
    baseHz: number;
    spacingHz: number;
    syncHz: number;
    symbolMs: number;
    /** Preamble length. Longer locks more reliably in a noisy room, at a little time. */
    syncSymbols: number;
    volume: number;
  }
> = {
  /**
   * The library's tuned set: eight tones from 18kHz, above almost everyone's hearing. Silent
   * to the room, and — the reason it is the default — clear of where music has its energy, so
   * it still decodes with a song playing.
   */
  default: {
    baseHz: 18000,
    spacingHz: 125,
    syncHz: 19125,
    symbolMs: 30,
    syncSymbols: 3,
    volume: 0.2,
  },
  /**
   * Audible chime, placed for a noisy room rather than for prettiness.
   *
   * Why it exists at all: Firefox resamples microphone input to 32kHz and cannot carry an
   * 18kHz tone, so this is the only variant those phones can receive — and a signal nobody
   * can hear gives a player nothing to tell them it is working.
   *
   * The band has moved twice, both times for the same reason: an audible carrier has to share
   * the spectrum with the room, and the room is not quiet.
   *
   *   - 880-1870Hz failed because that is the speech band, which handset voice processing
   *     suppresses and gates on purpose even when `noiseSuppression` is reported off. Frames
   *     were eaten rather than misread, so the receiver waited through repeat after repeat.
   *   - 4000-6250Hz was better but still exposed: consonants put a lot of energy in 4-8kHz
   *     (an "s" is mostly that), and hi-hats and cymbals sit there too. Talking or music in
   *     the room would still cost frames.
   *
   * 8000-11600Hz is the highest band that is still plainly audible while staying clear of the
   * 16kHz ceiling a 32kHz capture imposes. Above sibilance, above nearly all musical content
   * except cymbal shimmer, and far above a fan — fan and air-conditioning noise is broadband
   * but rolls off steeply with frequency, so it is a non-issue this high.
   *
   * Spacing is wide (400Hz) so a noisy bin has to be very wrong to beat the real tone, the
   * preamble is a symbol longer so frame lock survives a burst of noise, and the level is up
   * because unlike the silent profile this one has competition.
   *
   * Honest trade: this sounds like a high shimmer, not a tune. Musical registers are exactly
   * where voices and instruments are, so "sounds nice" and "survives a room" pull against each
   * other. Robustness wins here — the silent profile is still the one to use when a game is
   * actually playing.
   */
  jingle: {
    baseHz: 8000,
    spacingHz: 400,
    syncHz: 11600,
    symbolMs: 40,
    syncSymbols: 4,
    volume: 0.22,
  },
};

export function knockProfile(jingle: boolean): KnockProfile {
  return jingle ? 'jingle' : 'default';
}

/** Room codes are uppercase alphanumerics; anything else is a mis-decode, not a room. */
const CODE = /^[A-Z0-9]{4,12}$/;

export interface KnockBroadcast {
  stop(): void;
}

/**
 * Announce a room code until stopped. Must be called from a user gesture — the browser will
 * not start an AudioContext otherwise.
 */
export async function announceRoom(code: string, profile: KnockProfile): Promise<KnockBroadcast> {
  const { volume, ...cfg } = PROFILES[profile];
  const tx = await broadcast(code.toUpperCase(), { ...cfg, volume });
  return { stop: () => tx.stop() };
}

export interface KnockListener {
  /**
   * False when the microphone cannot carry the profile's band — Firefox on the ultrasonic
   * profile, mostly. Nothing will ever arrive, so the caller must say so rather than leave a
   * spinner running forever.
   */
  usable: boolean;
  stop(): void;
}

/**
 * Listen for a nearby room. `onCode` may fire repeatedly: the transmitter repeats its frame,
 * and the library only suppresses an identical payload for a few seconds.
 */
export async function listenForRoom(
  profile: KnockProfile,
  onCode: (code: string) => void,
): Promise<KnockListener> {
  const { volume: _volume, ...cfg } = PROFILES[profile];
  const rx = await listen((bytes) => {
    const text = new TextDecoder().decode(bytes).trim().toUpperCase();
    // Anyone with a speaker can transmit and the CRC is not a signature, so this is untrusted
    // input. Shape-check before it reaches the join call.
    if (CODE.test(text)) onCode(text);
  }, cfg);

  return { usable: rx.usable, stop: () => rx.stop() };
}

export const __testing = { PROFILES, CODE };
