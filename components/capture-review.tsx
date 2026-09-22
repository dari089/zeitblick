"use client";
import { useRef, useState } from "react";
import { Columns2, ArrowLeft, Download, Eye, Layers2, LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LabeledSlider } from "@/components/labeled-slider";
import { SaveModeControl } from "@/components/save-mode";
import { PhotoZoom } from "@/components/photo-zoom";
import type { PhotoCapture, SaveMode } from "@/lib/photo-types";
import { exportPhotos } from "@/lib/photo-export";
import { photoZip } from "@/lib/zip";
import { toast } from "sonner";
import { androidBridge, saveToAndroid } from "@/lib/android";
import { useRafState } from "@/lib/use-raf-state";

export function CaptureReview({ capture, open, onOpenChange, mode, setMode, initialSide = false }: { initialSide?: boolean; capture: PhotoCapture; open: boolean; onOpenChange: (open: boolean) => void; mode: SaveMode; setMode: (mode: SaveMode) => void }) {
  const [opacity, setOpacity, opacityRef] = useRafState(capture.opacity);
  const [side, setSide] = useState(initialSide);
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const actualMode = capture.layer ? mode : 'clean';

  async function downloadFiles(files: File[]) {
    const blob = files.length === 2 ? await photoZip(files.map(file => ({ name: file.name, blob: file }))) : files[0];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = files.length === 2 ? `${capture.filename}-beide.zip` : files[0].name;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast.success(files.length === 2 ? 'Download gestartet: Beide JPGs sind im ZIP enthalten.' : 'Foto-Download gestartet.');
  }
  async function save(downloadOnly = false) {
    if (saveLock.current) return;
    saveLock.current = true; setSaving(true);
    const exportMode = actualMode, exportOpacity = opacityRef.current;
    try {
      // Let the saving indicator paint before encoding a full-size photo.
      await new Promise<void>(resolve => requestAnimationFrame(() => window.setTimeout(resolve, 0)));
      const files = await exportPhotos(capture, exportMode, exportOpacity);
      if (!downloadOnly && androidBridge()) {
        await saveToAndroid(files);
        toast.success(files.length === 2 ? 'Beide Fotos wurden in deiner Galerie gespeichert.' : 'Foto in deiner Galerie gespeichert.');
        return;
      }
      if (!downloadOnly && navigator.canShare?.({ files }) && navigator.share) {
        try { await navigator.share({ files, title: 'Zeitblick' }); return; }
        catch (error) { if ((error as DOMException).name === 'AbortError') return; }
      }
      await downloadFiles(files);
    } catch (error) { toast.error((error as Error).message || 'Speichern fehlgeschlagen.'); }
    finally { saveLock.current = false; setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={value => { if (!saveLock.current) onOpenChange(value); }}><DialogContent className="review-dialog" showCloseButton={false} fullScreen>
    <header className="review-header"><button className="back-button" aria-label="Zur Kamera" disabled={saving} onClick={() => onOpenChange(false)}><ArrowLeft size={20} /><span>Zur Kamera</span></button><div><DialogTitle>Passt die Perspektive?</DialogTitle><DialogDescription>{capture.width} × {capture.height} px · JPG</DialogDescription></div><span className="review-header-spacer" /></header>
    <PhotoZoom side={side && Boolean(capture.layer)} capture={capture} opacity={visible ? opacity : 0} />
    <footer className="review-footer"><div className="review-inner">
      {capture.layer && <button className={`comparison-button pill-button ${side?'selected':''}`} aria-pressed={side} onClick={() => setSide(!side)}><Columns2 size={16} />{side?'Nebeneinander':'Überlagert'}</button>}
      {capture.layer && <div className="review-overlay-row">{!side && <button className={`pill-button ${visible ? 'selected' : ''}`} aria-pressed={visible} onClick={() => setVisible(!visible)}><Eye size={16} />{visible ? 'Overlay sichtbar' : 'Nur dein Foto'}</button>}<div className="review-opacity"><label id="review-opacity-label">{side ? 'Overlay beim Speichern' : 'Overlay im Vergleich'} <output>{opacity} %</output></label><LabeledSlider className="control-slider" aria-labelledby="review-opacity-label" disabled={saving} min={0} max={100} step={1} value={[opacity]} onValueChange={([value]) => { setOpacity(value); setVisible(true); }} /></div></div>}
      <SaveModeControl id="review-save" value={actualMode} onChange={value => { if (!saveLock.current) setMode(value); }} hasOverlay={Boolean(capture.layer)} />
      <div className="review-save-row"><p>{actualMode === 'both' ? 'Eine Aufnahme, zwei separate JPGs.' : actualMode === 'overlay' ? `Mit ${opacity} % Overlay. Der Sichtbarkeitsschalter dient nur dem Vergleich.` : 'Dein Foto bleibt vollständig ohne Overlay.'}</p><button className="primary-button" onClick={() => save()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : actualMode === 'both' ? <Layers2 size={18} /> : <Download size={18} />}{saving ? 'Wird gespeichert …' : actualMode === 'both' ? 'Beide speichern' : 'Foto speichern'}</button></div>
      {!androidBridge() && <button className="download-link" onClick={() => save(true)} disabled={saving}>{actualMode === 'both' ? 'Beide JPGs zusammen als ZIP herunterladen' : 'Direkt als JPG herunterladen'}</button>}
    </div></footer>
  </DialogContent></Dialog>;
}
