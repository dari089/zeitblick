import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptureReview } from '../components/capture-review';
import { reviewFixture } from './review-fixture';
import type { PhotoCapture, SaveMode } from '../lib/photo-types';
import '../app/globals.css';

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
