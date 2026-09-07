// Web Audio wiring. All the arithmetic is in dsp.js.

import { DEFAULTS, Decoder, encode, tones } from './dsp.js';

const FADE = 0.003; // seconds; shapes the band edges so they don't click

/** Forwards microphone samples to the main thread in 1024-sample chunks. */
const TAP = `
class KnockTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('knock-tap', KnockTap);
`;

const tapped = new WeakSet();

async function audioContext(context) {
  const ctx = context ?? new AudioContext({ sampleRate: 48000 });
  // An OfflineAudioContext is suspended until it renders, and resuming it here
  // would be wrong — passing one in is how you test a transmitter without a room.
  if (ctx.state === 'suspended' && !ctx.startRendering) await ctx.resume(); // needs a user gesture
  return ctx;
}

const toBytes = (p) => (typeof p === 'string' ? new TextEncoder().encode(p) : p);

/**
 * Play `payload` as sound, repeating until stopped.
 *
 * The payload is bytes and this has no opinion about what they mean — but it
 * goes out over a speaker in a room, so it should be a challenge (a room id and
 * a short-lived nonce) rather than a secret. See the README.
 *
 * @returns {Promise<{stop(): void, frameMs: number}>}
 */
export async function broadcast(
  payload,
  { context, repeatMs, durationMs, volume = 0.2, ...opts } = {},
) {
  const cfg = { ...DEFAULTS, ...opts };
  const ctx = await audioContext(context);
  const freqs = tones(cfg);
  const symbols = encode(toBytes(payload), cfg);
  const dur = cfg.symbolMs / 1000;
  const seq = [...Array(cfg.syncSymbols).fill(cfg.syncHz), ...symbols.map((s) => freqs[s])];
  const frameMs = seq.length * cfg.symbolMs;
  const gap = repeatMs ?? frameMs + 400;

  let timer = null;
  const send = () => {
    const t0 = ctx.currentTime + 0.05;
    const osc = new OscillatorNode(ctx);
    const gain = new GainNode(ctx, { gain: 0 });
    osc.connect(gain).connect(ctx.destination);
    seq.forEach((f, k) => {
      const t = t0 + k * dur;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + FADE);
      gain.gain.setValueAtTime(volume, t + dur - FADE);
      gain.gain.linearRampToValueAtTime(0, t + dur);
    });
    osc.start(t0);
    osc.stop(t0 + seq.length * dur);
    osc.onended = () => gain.disconnect();
  };

  const stop = () => {
    clearInterval(timer);
    clearTimeout(deadline);
  };

  send();
  timer = setInterval(send, gap);
  // A nonce is only good for a few seconds, so a broadcast that outlives it is
  // just noise. Callers that want a fixed window say so here.
  const deadline = durationMs ? setTimeout(stop, durationMs) : null;
  return { frameMs, stop };
}

/**
 * Listen for payloads. Calls `onPayload(bytes)` once per frame that passes CRC.
 *
 * @returns {Promise<{stop(): void, settings: MediaTrackSettings, sampleRate: number}>}
 */
export async function listen(onPayload, { context, dedupeMs = 3000, onFrame, ...opts } = {}) {
  const ctx = await audioContext(context);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const track = stream.getAudioTracks()[0];
  const settings = track.getSettings();
  // Asking is not the same as getting. Noise suppression in particular is happy
  // to treat a 19kHz tone as noise, so report what actually applied.
  for (const k of ['echoCancellation', 'noiseSuppression', 'autoGainControl']) {
    if (settings[k]) console.warn(`knock: ${k} is on; reception will suffer`);
  }

  // The band has to survive capture, not just the AudioContext. A browser that
  // resamples the microphone to 32kHz throws the whole band away before we ever
  // see it, and the context rate will not admit to it. Report rather than throw:
  // the app's job is to fall back to a room code, not to give up.
  const top = tones({ ...DEFAULTS, ...opts }).at(-1);
  const capture = settings.sampleRate ?? ctx.sampleRate;
  const usable = capture / 2 > top;
  if (!usable) {
    console.warn(
      `knock: microphone captures at ${capture}Hz, so nothing above ${capture / 2}Hz survives. ` +
        `This device cannot receive; fall back to a room code.`,
    );
  }

  if (!tapped.has(ctx)) {
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' })));
    tapped.add(ctx);
  }

  let last = { key: '', at: -Infinity };
  const decoder = new Decoder(ctx.sampleRate, {
    ...opts,
    onFrame,
    onPayload(bytes, info) {
      const key = bytes.join(',');
      const now = performance.now();
      if (key === last.key && now - last.at < dedupeMs) return;
      last = { key, at: now };
      onPayload(bytes, info);
    },
  });

  const src = new MediaStreamAudioSourceNode(ctx, { mediaStream: stream });
  const tap = new AudioWorkletNode(ctx, 'knock-tap');
  const mute = new GainNode(ctx, { gain: 0 });
  tap.port.onmessage = (e) => decoder.push(e.data);
  src.connect(tap).connect(mute).connect(ctx.destination);

  return {
    settings,
    usable,
    sampleRate: ctx.sampleRate,
    // The graph, so a caller can tap it for a meter, a spectrogram, a recording
    // — anything the library has no business knowing about.
    context: ctx,
    source: src,
    stop() {
      tap.port.onmessage = null;
      src.disconnect();
      tap.disconnect();
      mute.disconnect();
      track.stop();
    },
  };
}
