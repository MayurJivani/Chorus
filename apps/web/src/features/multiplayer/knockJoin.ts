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

/**
 * Eight tones from 18kHz, above almost everyone's hearing.
 *
 * There was briefly a second, audible profile, and it is worth recording why it is gone rather
 * than leaving the question open. An audible carrier has to share the spectrum with the room,
 * and every band loud enough to hear is already occupied: the speech band is gated and
 * suppressed by handset voice processing on purpose, 4-8kHz is where consonants and cymbals
 * live, and placing it high enough to dodge both made it a shrill hiss rather than anything
 * worth playing to a room. Each move fixed one interferer and exposed the next.
 *
 * This profile wins by being somewhere nothing else is, which is the same reason it decodes
 * quickly with a song playing.
 *
 * The cost, which the listener UI reports rather than hides: Firefox resamples microphone input
 * to 32kHz and cannot carry an 18kHz tone at all, so those phones can never receive this and
 * fall back to scanning or typing the code.
 */
const CONFIG = { baseHz: 18000, spacingHz: 125, syncHz: 19125, symbolMs: 30, syncSymbols: 3 };
const VOLUME = 0.2;

/** Room codes are uppercase alphanumerics; anything else is a mis-decode, not a room. */
const CODE = /^[A-Z0-9]{4,12}$/;

export interface KnockBroadcast {
  stop(): void;
}

/**
 * Announce a room code until stopped. Must be called from a user gesture — the browser will
 * not start an AudioContext otherwise.
 */
export async function announceRoom(code: string): Promise<KnockBroadcast> {
  const tx = await broadcast(code.toUpperCase(), { ...CONFIG, volume: VOLUME });
  return { stop: () => tx.stop() };
}

export interface KnockListener {
  /**
   * False when the microphone cannot carry the band — Firefox, mostly. Nothing will ever
   * arrive, so the caller must say so rather than leave a spinner running forever.
   */
  usable: boolean;
  stop(): void;
}

/**
 * Listen for a nearby room. `onCode` may fire repeatedly: the transmitter repeats its frame,
 * and the library only suppresses an identical payload for a few seconds.
 */
export async function listenForRoom(onCode: (code: string) => void): Promise<KnockListener> {
  const rx = await listen((bytes) => {
    const text = new TextDecoder().decode(bytes).trim().toUpperCase();
    // Anyone with a speaker can transmit and the CRC is not a signature, so this is untrusted
    // input. Shape-check before it reaches the join call.
    if (CODE.test(text)) onCode(text);
  }, CONFIG);

  return { usable: rx.usable, stop: () => rx.stop() };
}

export const __testing = { CONFIG, CODE };
