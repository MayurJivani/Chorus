export interface Config {
  /** Bottom data tone, Hz. Default 18000. */
  baseHz: number;
  /** Gap between data tones, Hz. Default 125. */
  spacingHz: number;
  /** Preamble tone, Hz. Default 19125. */
  syncHz: number;
  /** Symbol duration, ms. Default 30. */
  symbolMs: number;
  /** Preamble length in symbols. Default 3. */
  syncSymbols: number;
  /** Receiver search grid resolution. Default 8. */
  hopsPerSymbol: number;
  /** Longest payload accepted, bytes. Default 64. */
  maxPayload: number;
}

export const DEFAULTS: Config;

/** Quality of a received frame. */
export interface Reception {
  /** Winning tone's ratio to the mean of the pack, averaged over the frame, dB. */
  marginDb: number;
}

export interface BroadcastOptions extends Partial<Config> {
  /** Output gain, 0–1. Default 0.2. */
  volume?: number;
  /** Gap between repeats, ms. Default one frame plus 400. */
  repeatMs?: number;
  /** Stop automatically after this long, ms. Default never. */
  durationMs?: number;
  /** Supply your own context, including an OfflineAudioContext. */
  context?: BaseAudioContext;
}

export interface Broadcast {
  /** Length of one frame, ms. */
  frameMs: number;
  stop(): void;
}

export interface ListenOptions extends Partial<Config> {
  /** Suppress an identical repeated payload for this long, ms. Default 3000. */
  dedupeMs?: number;
  /**
   * Nine tone magnitudes per hop, for meters and room measurement.
   * The array is reused between calls — read it, do not retain it.
   */
  onFrame?: (mags: Float64Array) => void;
  context?: BaseAudioContext;
}

export interface Listener {
  /** What the microphone constraints actually resolved to. */
  settings: MediaTrackSettings;
  /**
   * False when the capture rate cannot carry the band, which happens on
   * browsers that resample the microphone down. Nothing will ever be received;
   * fall back to a room code.
   */
  usable: boolean;
  sampleRate: number;
  /** The context the graph runs in. */
  context: BaseAudioContext;
  /**
   * The microphone node, so you can tap the graph for a meter, a spectrogram or
   * a recording — anything the library has no business knowing about.
   * Disconnect whatever you attach before calling `stop()`.
   */
  source: AudioNode;
  stop(): void;
}

/**
 * Play `payload` as sound, repeating until stopped. Must be called from a user
 * gesture. The payload is bytes and this has no opinion about what they mean —
 * but it goes out over a speaker, so it should be a challenge, not a secret.
 */
export function broadcast(
  payload: Uint8Array | string,
  options?: BroadcastOptions,
): Promise<Broadcast>;

/**
 * Listen for payloads. Anyone with a speaker can transmit, so `bytes` is
 * untrusted input and the CRC is not a signature.
 */
export function listen(
  onPayload: (bytes: Uint8Array, info: Reception) => void,
  options?: ListenOptions,
): Promise<Listener>;

// ── The modem on its own, with no Web Audio dependency ────────────────────────

/** Frequencies the receiver listens on: eight data tones, then the sync tone. */
export function tones(cfg?: Config): number[];

/** Goertzel magnitude of `freq` over buf[start, start+len). */
export function goertzel(
  buf: Float32Array,
  start: number,
  len: number,
  freq: number,
  sampleRate: number,
): number;

/** CRC-16/CCITT-FALSE. */
export function crc16(bytes: Iterable<number>): number;

/** payload -> [len][payload][crc16] -> 3-bit symbols. Throws past `maxPayload`. */
export function encode(payload: Uint8Array, cfg?: Config): number[];

/** Symbols -> payload, or null if the length is implausible or the CRC fails. */
export function decode(symbols: number[], cfg?: Config): Uint8Array | null;

/** How many symbols a frame carrying `len` payload bytes occupies. */
export function symbolCount(len: number): number;

export interface DecoderOptions extends Partial<Config> {
  onPayload?: (bytes: Uint8Array, info: Reception) => void;
  onFrame?: (mags: Float64Array) => void;
}

/**
 * Streaming receiver. Feed it sample chunks of any size.
 * Throws if `sampleRate` cannot carry the top tone.
 */
export class Decoder {
  constructor(sampleRate: number, options?: DecoderOptions);
  push(chunk: Float32Array | number[]): void;
  reset(): void;
}
