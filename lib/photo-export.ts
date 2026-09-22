import { canvasBlob, type PhotoCapture, type SaveMode } from './photo-types';

/** Called only on Save; comparing/zooming never encodes photos or builds ZIPs. */
export async function exportPhotos(capture: PhotoCapture, mode: SaveMode, opacity: number): Promise<File[]> {
  const clean = () => new File([capture.blob], `${capture.filename}-ohne-overlay.jpg`, { type: 'image/jpeg' });
  if (mode === 'clean' || !capture.layer) return [clean()];
  const canvas = document.createElement('canvas');
  canvas.width = capture.width; canvas.height = capture.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Kein Bildspeicher verfügbar.');
    context.drawImage(capture.raw, 0, 0);
    context.globalAlpha = Math.max(0, Math.min(100, opacity)) / 100;
    context.drawImage(capture.layer, 0, 0);
    const withOverlay = new File([await canvasBlob(canvas)], `${capture.filename}-mit-overlay.jpg`, { type: 'image/jpeg' });
    return mode === 'both' ? [clean(), withOverlay] : [withOverlay];
  } finally { canvas.width = 0; canvas.height = 0; }
}
