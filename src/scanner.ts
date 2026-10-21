/**
 * Barcode scanning with the camera (or from a photo). Uses the browser's
 * BarcodeDetector where it exists; on iPhone it doesn't, so a ZXing
 * WebAssembly reader is loaded from this app's own files (works offline).
 * This module is loaded only when the scan tab opens.
 */
import { isbnFromBarcode } from './isbn';

interface Detector {
  detect(src: ImageBitmapSource | HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

let detectorPromise: Promise<Detector> | null = null;

function getDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    if (Native) {
      try {
        if ((await Native.getSupportedFormats()).includes('ean_13')) return new Native({ formats: ['ean_13'] });
      } catch {
        /* fall through to the WebAssembly reader */
      }
    }
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url')
    ]);
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL(wasmUrl, location.href).href : prefix + path) },
      fireImmediately: true
    });
    return new BarcodeDetector({ formats: ['ean_13'] }) as unknown as Detector;
  })();
  return detectorPromise;
}

export type ScanError = 'nocamera' | 'denied' | 'other';

export interface ScanSession {
  stop(): void;
  /** resume scanning after a result was handled */
  resume(): void;
}

/**
 * Start the rear camera in `video` and call `onIsbn` when an ISBN barcode is seen.
 * Scanning pauses after each hit until `resume()` is called.
 */
export async function startScanner(video: HTMLVideoElement, onIsbn: (isbn: string) => void, onError: (e: ScanError) => void): Promise<ScanSession> {
  let stopped = false;
  let paused = false;
  let timer = 0;
  let stream: MediaStream | null = null;

  const session: ScanSession = {
    stop() {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      video.srcObject = null;
    },
    resume() {
      paused = false;
      loop();
    }
  };

  if (!navigator.mediaDevices?.getUserMedia) {
    onError('nocamera');
    return session;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (e) {
    const name = (e as Error).name;
    onError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'nocamera' : 'other');
    return session;
  }
  if (stopped) {
    stream.getTracks().forEach((tr) => tr.stop());
    return session;
  }
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    /* autoplay may need a tap; the video still starts when shown */
  }

  let detector: Detector;
  try {
    detector = await getDetector();
  } catch {
    onError('other');
    return session;
  }

  async function loop(): Promise<void> {
    if (stopped || paused) return;
    if (video.readyState >= 2 && video.videoWidth) {
      try {
        const codes = await detector.detect(video);
        for (const c of codes) {
          const isbn = isbnFromBarcode(c.rawValue);
          if (isbn && !stopped && !paused) {
            paused = true;
            onIsbn(isbn);
            return;
          }
        }
      } catch {
        /* a frame that couldn't be read: try the next one */
      }
    }
    timer = window.setTimeout(loop, 180);
  }
  loop();
  return session;
}

/** Read an ISBN barcode from a photo file. */
export async function scanImageFile(file: Blob): Promise<string | null> {
  const detector = await getDetector();
  const bmp = await createImageBitmap(file);
  try {
    const codes = await detector.detect(bmp);
    for (const c of codes) {
      const isbn = isbnFromBarcode(c.rawValue);
      if (isbn) return isbn;
    }
    return null;
  } finally {
    bmp.close?.();
  }
}
