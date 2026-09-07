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
  { baseHz: number; spacingHz: number; syncHz: number; symbolMs: number; volume: number }
> = {
  /**
   * The library's tuned set: eight tones from 18kHz, above almost everyone's hearing. Silent
   * to the room, and — the reason it is the default — clear of where music has its energy, so
   * it still decodes with a song playing.
   */
  default: { baseHz: 18000, spacingHz: 125, syncHz: 19125, symbolMs: 30, volume: 0.2 },
  /**
   * Audible chime. Bell-register tones with a short symbol, tuned after the first version
   * decoded far more slowly than the silent one in a real room.
   *
   * Two real reasons to prefer it over the silent one, neither cosmetic:
   *
   *   - Firefox resamples microphone input to 32kHz, which cannot carry an 18kHz tone at all.
   *     `listen()` reports that as `usable: false`. This profile is well inside what any
   *     capture rate carries, so it is the only variant those phones can hear.
   *   - A sound nobody can hear gives a player no idea whether anything is happening. A chime
   *     is its own feedback.
   *
   * Why 4kHz and not the piano register it started in. The first attempt sat at 880–1870Hz,
   * squarely inside the speech band, and phones fight for that band on purpose: handset voice
   * processing keeps suppressing and gating there even when `noiseSuppression` is asked for
   * and reported off. Frames were being eaten rather than misread, so the receiver simply
   * waited through repeat after repeat. Above ~4kHz the voice chain mostly stops caring, while
   * the tones stay far below the 16kHz ceiling a 32kHz capture imposes.
   *
   * The other half of the delay was the symbol: 60ms made every frame take 1.6s before a
   * retry could even begin. 40ms is still long enough to read as notes rather than a buzz.
   *
   * It still lives closer to music than the silent profile does, so it is at its best in the
   * lobby before a game starts — which is when people join anyway.
   */
  jingle: { baseHz: 4000, spacingHz: 250, syncHz: 6250, symbolMs: 40, volume: 0.18 },
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
