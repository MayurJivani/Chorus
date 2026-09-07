// The modem, with no opinion about audio hardware.
//
// Everything here is arithmetic over Float32Arrays, so it runs identically in a
// browser, in an AudioWorklet or in `node --test`. The Web Audio parts live in
// knock.js; this file is what the tests exercise.

/** Default frame geometry. Overridable per call, but these are the tuned set. */
export const DEFAULTS = {
  baseHz: 18000, // bottom data tone
  spacingHz: 125, // 8 data tones -> 18000..18875
  syncHz: 19125, // preamble, two spacings clear of the top data tone
  symbolMs: 30, // 1440 samples at 48k
  syncSymbols: 3, // preamble length
  hopsPerSymbol: 8, // receiver search grid
  maxPayload: 64, // bytes; anything longer is a mis-decode
};

const TONES = 8; // 3 bits per symbol
const BITS = 3;

/** Frequencies the receiver listens on: 8 data tones then the sync tone. */
export function tones(cfg = DEFAULTS) {
  const f = [];
  for (let i = 0; i < TONES; i++) f.push(cfg.baseHz + i * cfg.spacingHz);
  f.push(cfg.syncHz);
  return f;
}

/** The inner loop, taking the coefficient the caller already worked out. */
function bin(buf, start, len, coeff) {
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < len; i++) {
    const s = buf[start + i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / len;
}

/** Coefficient for one Goertzel bin. */
const coeff = (freq, sampleRate) => 2 * Math.cos((2 * Math.PI * freq) / sampleRate);

/**
 * Goertzel magnitude of `freq` over buf[start, start+len).
 * One bin of a DFT for the cost of a loop — cheaper than an FFT when only nine
 * frequencies matter.
 */
export function goertzel(buf, start, len, freq, sampleRate) {
  return bin(buf, start, len, coeff(freq, sampleRate));
}

/** CRC-16/CCITT-FALSE. */
export function crc16(bytes) {
  let c = 0xffff;
  for (const b of bytes) {
    c ^= b << 8;
    for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c;
}

/** payload -> [len][payload][crc16] -> 3-bit symbols, zero-padded. */
export function encode(payload, cfg = DEFAULTS) {
  if (payload.length > cfg.maxPayload) throw new RangeError(`payload > ${cfg.maxPayload} bytes`);
  const body = Uint8Array.of(payload.length, ...payload);
  const c = crc16(body);
  const frame = Uint8Array.of(...body, c >> 8, c & 0xff);

  const symbols = [];
  let acc = 0;
  let n = 0;
  for (const byte of frame) {
    acc = (acc << 8) | byte;
    n += 8;
    while (n >= BITS) {
      n -= BITS;
      symbols.push((acc >> n) & 0b111);
    }
  }
  if (n) symbols.push((acc << (BITS - n)) & 0b111);
  return symbols;
}

/** Symbols -> payload, or null if the length is implausible or the CRC fails. */
export function decode(symbols, cfg = DEFAULTS) {
  const bytes = [];
  let acc = 0;
  let n = 0;
  for (const s of symbols) {
    acc = (acc << BITS) | s;
    n += BITS;
    if (n >= 8) {
      n -= 8;
      bytes.push((acc >> n) & 0xff);
    }
  }
  const len = bytes[0];
  if (len === undefined || len > cfg.maxPayload || bytes.length < len + 3) return null;
  const body = bytes.slice(0, len + 1);
  const crc = (bytes[len + 1] << 8) | bytes[len + 2];
  if (crc16(body) !== crc) return null;
  return Uint8Array.from(body.slice(1));
}

/** How many symbols a frame carrying `len` payload bytes occupies. */
export function symbolCount(len) {
  return Math.ceil(((len + 3) * 8) / BITS);
}

/**
 * Streaming receiver. Feed it sample chunks of any size; it calls `onPayload`
 * once per frame that survives its CRC.
 *
 * It runs a nine-tone Goertzel bank on a sliding grid looking for the preamble,
 * then locks to the preamble's trailing edge and reads symbols on that grid.
 * Every decision is relative — argmax across the data tones, sync measured
 * against the mean of the others — because the received level varies by 40dB
 * between a phone beside the speaker and one across the room, so any absolute
 * threshold is wrong for somebody.
 */
export class Decoder {
  constructor(sampleRate, { onPayload, onFrame, ...opts } = {}) {
    this.cfg = { ...DEFAULTS, ...opts };
    this.sampleRate = sampleRate;
    this.onPayload = onPayload;
    this.onFrame = onFrame; // (mags) -> void, for meters and room measurement
    this.freqs = tones(this.cfg);

    // A platform that resamples the microphone below the band cannot ever hear
    // a frame, and would otherwise fail by silently decoding nothing forever.
    // Firefox has historically resampled input to 32kHz, which puts Nyquist at
    // 16kHz and the whole band out of reach.
    const top = this.freqs[this.freqs.length - 1];
    if (top >= sampleRate / 2) {
      throw new RangeError(
        `knock: ${sampleRate}Hz input cannot carry a ${top}Hz tone (Nyquist is ${sampleRate / 2}Hz). ` +
          `Lower baseHz/syncHz, or this device cannot receive.`,
      );
    }
    this.coeffs = Float64Array.from(this.freqs, (f) => coeff(f, sampleRate));
    this.mags = new Float64Array(this.freqs.length);
    this.floor = 0; // rolling quiet-room level in the sync bin

    this.L = Math.round((this.cfg.symbolMs / 1000) * sampleRate);
    this.hop = Math.max(1, Math.round(this.L / this.cfg.hopsPerSymbol));

    this.buf = new Float32Array(this.L * 4);
    this.origin = 0; // absolute index of buf[0]
    this.n = 0; // samples held
    this.nextHopEnd = this.L; // absolute index one past the next search window

    this.reset();
  }

  reset() {
    this.syncRun = 0;
    this.armed = -1; // absolute sample index at which the preamble locked in
    this.prevD = null; // previous (sync - bestData), for the edge crossing
    this.prevEnd = 0;
    this.symbols = null; // non-null while reading a frame
    this.symbolStart = 0;
    this.expected = 0;
    this.margin = 0; // running sum of per-symbol peak-to-mean
  }

  /** @param {Float32Array|number[]} chunk */
  push(chunk) {
    let i = 0;
    while (i < chunk.length) {
      const room = this.buf.length - this.n;
      const take = Math.min(room, chunk.length - i);
      this.buf.set(chunk.subarray ? chunk.subarray(i, i + take) : chunk.slice(i, i + take), this.n);
      this.n += take;
      i += take;
      this.#drain();
      if (this.n === this.buf.length) this.#compact();
    }
  }

  /** Drop samples nothing still needs, sliding the rest to the front. */
  #compact() {
    const keepFrom = this.symbols ? this.symbolStart : this.nextHopEnd - this.L;
    const d = Math.max(0, Math.min(keepFrom - this.origin, this.n));
    this.buf.copyWithin(0, d, this.n);
    this.n -= d;
    this.origin += d;
  }

  /** Fill `this.mags` for the window starting at `startAbs`. Reused, not fresh. */
  #mags(startAbs, from, to) {
    const s = startAbs - this.origin;
    for (let i = from; i < to; i++) this.mags[i] = bin(this.buf, s, this.L, this.coeffs[i]);
    return this.mags;
  }

  #drain() {
    for (;;) {
      const end = this.origin + this.n;
      // A frame in progress gets the samples first: its grid is the preamble's,
      // not the search grid's.
      if (this.symbols && end >= this.symbolStart + this.L) {
        const m = this.#mags(this.symbolStart, 0, TONES);
        let best = 0;
        let sum = 0;
        for (let i = 0; i < TONES; i++) {
          sum += m[i];
          if (m[i] > m[best]) best = i;
        }
        // How far the winning tone stood above the pack, kept so the caller can
        // tell a frame that barely made it from one that arrived clean.
        this.margin += sum > 0 ? (m[best] * TONES) / sum : 0;
        this.symbols.push(best);
        this.symbolStart += this.L;
        const resumeAt = this.symbolStart;
        this.#onSymbols();
        // Searching resumes from the end of what the frame consumed, so the
        // search grid keeps moving and old samples stay droppable.
        if (!this.symbols) this.nextHopEnd = Math.max(this.nextHopEnd, resumeAt);
        continue;
      }
      if (this.symbols) return; // mid-frame: the search grid is paused
      if (end < this.nextHopEnd) return;
      this.#search(this.nextHopEnd - this.L);
      this.nextHopEnd += this.hop;
    }
  }

  #onSymbols() {
    if (this.symbols.length === 3 && !this.expected) {
      // Nine bits in: the length byte is complete, so the frame's size is known.
      const len = ((this.symbols[0] << 6) | (this.symbols[1] << 3) | this.symbols[2]) >> 1;
      if (len > this.cfg.maxPayload) return this.reset();
      this.expected = symbolCount(len);
    }
    if (this.expected && this.symbols.length >= this.expected) {
      const payload = decode(this.symbols, this.cfg);
      const marginDb = 20 * Math.log10(Math.max(1, this.margin / this.symbols.length));
      this.reset();
      if (payload) this.onPayload?.(payload, { marginDb });
    }
  }

  #search(startAbs) {
    const m = this.#mags(startAbs, TONES, TONES + 1);
    const sync = m[TONES];

    // Idle is the common case by a wide margin, so pay for one Goertzel and
    // only buy the other eight when the preamble tone shows up. `floor` tracks
    // the quiet-room level in that same bin, which keeps this a relative test —
    // an absolute one would be wrong for somebody. A meter wants every bin
    // regardless.
    if (this.armed < 0 && !this.onFrame && sync < 2 * this.floor) {
      this.floor += (sync - this.floor) * 0.01;
      this.syncRun = 0;
      this.prevD = null;
      return;
    }

    this.#mags(startAbs, 0, TONES);
    this.onFrame?.(m);

    let best = m[0];
    let sum = 0;
    for (let i = 0; i < TONES; i++) {
      sum += m[i];
      if (m[i] > best) best = m[i];
    }
    const dominant = sync > 3 * (sum / TONES);
    if (this.armed < 0 && !dominant) this.floor += (sync - this.floor) * 0.01;
    this.syncRun = dominant ? this.syncRun + 1 : 0;

    // Sustained sync for a symbol's worth of hops arms the edge detector. It
    // stays armed through the transition, where dominance necessarily lapses.
    if (this.armed < 0 && this.syncRun >= this.cfg.hopsPerSymbol) this.armed = startAbs;

    const d = sync - best;
    if (this.armed >= 0) {
      if (startAbs - this.armed > this.cfg.syncSymbols * 2 * this.L) {
        this.reset(); // a steady 19kHz whine, not a preamble
      } else if (this.prevD !== null && this.prevD > 0 && d <= 0) {
        // Sync energy falls off linearly as the window slides past the end of
        // the preamble, so it equals the data tones when the window straddles
        // the boundary half and half. Interpolate the crossing, add half a
        // window, and that is where the first data symbol starts.
        const t = this.prevD / (this.prevD - d);
        const cross = this.prevEnd + t * (startAbs - this.prevEnd);
        this.reset();
        this.symbols = [];
        this.expected = 0;
        this.symbolStart = Math.round(cross + this.L / 2);
      }
    }
    this.prevD = d;
    this.prevEnd = startAbs;
  }
}
