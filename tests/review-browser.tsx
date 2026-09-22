import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptureReview } from '../components/capture-review';
import { reviewFixture } from './review-fixture';
import type { PhotoCapture, SaveMode } from '../lib/photo-types';
import '../app/globals.css';

// Preview host uses HTTP; the shipped Android origin uses HTTPS.
if (!crypto.randomUUID) Object.defineProperty(crypto, "randomUUID", {value: () => "test-"+Date.now()+"-"+Math.random()});

// A native bridge double exposes operation counts and JPEG pixels in the test
// host. It never writes a gallery and is absent from the shipped entry point.
let encodes = 0;
const encode = HTMLCanvasElement.prototype.toBlob;
HTMLCanvasElement.prototype.toBlob = function(...args) {
  encodes++;
  window.parent.postMessage({ test: 'encodes', count: encodes }, location.origin);
  return encode.apply(this, args);
};
Object.assign(window, { ZeitblickAndroid: {
  async savePhotos(payload: string) {
    const message = JSON.parse(payload);
    const checks = [];
    for (const file of message.images) {
      const bytes = Uint8Array.from(atob(file.data), value => value.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], {type:'image/jpeg'}));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      checks.push({name:file.name, width:bitmap.width, height:bitmap.height, pixel:Array.from(context.getImageData(620,450,1,1).data)});
      bitmap.close(); canvas.width = 0;
    }
    window.parent.postMessage({ test: 'saved', checks, encodes }, location.origin);
    window.dispatchEvent(new CustomEvent('zeitblick-save-result',{detail:{id:message.id,success:true}}));
  }
} });

// Standalone browser check built with production CSS optimization.
function ReviewCheck() {
  const [capture, setCapture] = useState<PhotoCapture | null>(null);
  const [mode, setMode] = useState<SaveMode>('both');
  const [open, setOpen] = useState(true);
  useEffect(() => { void reviewFixture().then(setCapture); }, []);
  return <>
    <button onClick={() => setOpen(true)}>Vergleich erneut öffnen</button>
    {capture && <CaptureReview capture={capture} open={open} onOpenChange={setOpen} mode={mode} setMode={setMode} />}
  </>;
}
createRoot(document.getElementById('root')!).render(<ReviewCheck />);
