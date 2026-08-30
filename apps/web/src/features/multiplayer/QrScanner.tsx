/**
 * Camera QR scanner for joining a room, built on the browser's own `BarcodeDetector`.
 *
 * No decoding library is bundled: the lobby already renders a QR that a phone's native camera
 * app can open directly, so this only has to serve the case where someone is *already* in
 * Chorusify and doesn't want to leave it. Where `BarcodeDetector` is missing (Firefox, older
 * iOS) `isQrScanSupported()` reports false and the caller keeps the code field as the only
 * join path, rather than showing a button that cannot work.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal shape of the parts of the Barcode Detection API used here. */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function barcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

export function isQrScanSupported(): boolean {
  return (
    barcodeDetectorCtor() !== null && typeof navigator !== 'undefined' && !!navigator.mediaDevices
  );
}

/**
 * Pulls a room code out of whatever the QR encoded.
 *
 * Accepts a full invite URL or a bare code, because a code typed into a QR generator by hand
 * is just as valid an invite as the one the lobby renders. Returns null for anything that
 * isn't plausibly a code, so a stray QR (a wifi config, a product barcode) is ignored and
 * scanning simply continues instead of navigating somewhere broken.
 */
export function parseRoomCode(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const fromUrl = /\/room\/([A-Za-z0-9]{4,12})/.exec(text);
  if (fromUrl?.[1]) return fromUrl[1].toUpperCase();

  if (/^[A-Za-z0-9]{4,12}$/.test(text)) return text.toUpperCase();
  return null;
}

interface QrScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Held in a ref so the detect loop can stop itself without being re-created every frame.
  const activeRef = useRef(true);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    activeRef.current = true;
    let stream: MediaStream | null = null;
    let frame = 0;

    const Ctor = barcodeDetectorCtor();
    if (!Ctor) {
      setError('This browser can’t scan QR codes. Enter the code instead.');
      return;
    }
    const detector = new Ctor({ formats: ['qr_code'] });

    const tick = async () => {
      if (!activeRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          const results = await detector.detect(video);
          for (const result of results) {
            const code = parseRoomCode(result.rawValue);
            if (code) {
              activeRef.current = false;
              onScanRef.current(code);
              return;
            }
          }
        } catch {
          /* A failed frame is normal (bad focus, motion blur) — just try the next one. */
        }
      }
      frame = requestAnimationFrame(() => void tick());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (!activeRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        void tick();
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera permission denied. Enter the code instead.'
            : 'Could not open the camera. Enter the code instead.',
        );
      }
    })();

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleClose = useCallback(() => {
    activeRef.current = false;
    onClose();
  }, [onClose]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-2xl border border-white/10 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
          aria-label="Camera viewfinder"
        />
        {/* Framing guide — purely decorative, so it must not swallow taps on the video. */}
        <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-chorusify-accent2/70" />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center">
            <p className="text-sm text-slate-300">{error}</p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500">Point at the room’s QR code</p>
      <button type="button" onClick={handleClose} className="btn-ghost w-full !rounded-xl !py-2.5">
        Cancel
      </button>
    </div>
  );
}
