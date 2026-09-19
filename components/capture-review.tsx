"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Eye, Layers2, LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LabeledSlider } from "@/components/labeled-slider";
import { SaveModeControl } from "@/components/save-mode";
import { PhotoZoom } from "@/components/photo-zoom";
import { canvasBlob, type PhotoCapture, type SaveMode } from "@/lib/photo-types";
import { photoZip } from "@/lib/zip";
import { toast } from "sonner";
import { androidBridge, saveToAndroid } from "@/lib/android";

type Prepared = { opacity: number; composite: Blob; compositeUrl: string; archive: Blob; archiveUrl: string };
export function CaptureReview({ capture, open, onOpenChange, mode, setMode }: { capture: PhotoCapture; open: boolean; onOpenChange: (open: boolean) => void; mode: SaveMode; setMode: (mode: SaveMode) => void }) {
  const [opacity, setOpacity] = useState(capture.opacity);
  const [visible, setVisible] = useState(true);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [prepareError, setPrepareError] = useState(false);
  const [saving, setSaving] = useState(false);
  const actualMode = capture.layer ? mode : 'clean';
  const ready = actualMode === 'clean' || prepared?.opacity === opacity;

  useEffect(() => {
    if (!capture.layer || !open) return;
    let cancelled = false;
    const urls: string[] = [];
    setPrepareError(false);
    setPrepared(null);
    const timer = window.setTimeout(async () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = capture.width; canvas.height = capture.height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('Kein Bildspeicher');
        context.drawImage(capture.raw, 0, 0);
        context.globalAlpha = opacity / 100;
        context.drawImage(capture.layer!, 0, 0);
        const composite = await canvasBlob(canvas);
        if (cancelled) return;
        const archive = await photoZip([{ name: `${capture.filename}-ohne-overlay.jpg`, blob: capture.blob }, { name: `${capture.filename}-mit-overlay.jpg`, blob: composite }]);
        if (cancelled) return;
        const compositeUrl = URL.createObjectURL(composite), archiveUrl = URL.createObjectURL(archive);
        urls.push(compositeUrl, archiveUrl); setPrepared({ opacity, composite, compositeUrl, archive, archiveUrl });
      } catch { if (!cancelled) setPrepareError(true); }
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [capture, opacity, open]);

  const downloadUrl = actualMode === 'clean' ? capture.url : actualMode === 'both' ? prepared?.archiveUrl : prepared?.compositeUrl;
  const downloadName = `${capture.filename}${actualMode === 'both' ? '-beide.zip' : actualMode === 'overlay' ? '-mit-overlay.jpg' : '-ohne-overlay.jpg'}`;
  function directDownload() {
    if (!downloadUrl || !ready) return;
    const a = document.createElement('a'); a.href = downloadUrl; a.download = downloadName; document.body.appendChild(a); a.click(); a.remove();
    toast.success(actualMode === 'both' ? 'Download gestartet: Beide JPGs sind im ZIP enthalten.' : 'Foto-Download gestartet.');
  }
  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const files = actualMode === 'both' && prepared ? [new File([capture.blob], `${capture.filename}-ohne-overlay.jpg`, { type: 'image/jpeg' }), new File([prepared.composite], `${capture.filename}-mit-overlay.jpg`, { type: 'image/jpeg' })] : [new File([actualMode === 'overlay' && prepared ? prepared.composite : capture.blob], downloadName, { type: 'image/jpeg' })];
      if (androidBridge()) { await saveToAndroid(files); toast.success(files.length === 2 ? "Beide Fotos wurden in deiner Galerie gespeichert." : "Foto in deiner Galerie gespeichert."); return; }
      if (navigator.canShare?.({ files }) && navigator.share) {
        try { await navigator.share({ files, title: 'Zeitblick' }); return; }
        catch (error) { if ((error as DOMException).name === 'AbortError') return; }
      }
      directDownload();
    } catch (error) { toast.error((error as Error).message || "Speichern fehlgeschlagen."); } finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="review-dialog" showCloseButton={false}>
    <header className="review-header"><button className="back-button" aria-label="Zur Kamera" onClick={() => onOpenChange(false)}><ArrowLeft size={20} /><span>Zur Kamera</span></button><div><DialogTitle>Passt die Perspektive?</DialogTitle><DialogDescription>{capture.width} × {capture.height} px · JPG</DialogDescription></div><span className="review-header-spacer" /></header>
    <PhotoZoom capture={capture} opacity={visible ? opacity : 0} />
    <footer className="review-footer"><div className="review-inner">
      {capture.layer && <div className="review-overlay-row"><button className={`pill-button ${visible ? 'selected' : ''}`} aria-pressed={visible} onClick={() => setVisible(!visible)}><Eye size={16} />{visible ? 'Overlay sichtbar' : 'Nur dein Foto'}</button><div className="review-opacity"><label id="review-opacity-label">Overlay im Vergleich <output>{opacity} %</output></label><LabeledSlider className="control-slider" aria-labelledby="review-opacity-label" min={0} max={100} step={1} value={[opacity]} onValueChange={([value]) => { setOpacity(value); setVisible(true); }} /></div></div>}
      <SaveModeControl id="review-save" value={actualMode} onChange={setMode} hasOverlay={Boolean(capture.layer)} />
      <div className="review-save-row"><p>{actualMode === 'both' ? 'Eine Aufnahme, zwei separate JPGs.' : actualMode === 'overlay' ? `Mit ${opacity} % Overlay. Der Sichtbarkeitsschalter dient nur dem Vergleich.` : 'Dein Foto bleibt vollständig ohne Overlay.'}</p><button className="primary-button" onClick={save} disabled={!ready || saving}>{!ready || saving ? <LoaderCircle className="spin" size={18} /> : actualMode === 'both' ? <Layers2 size={18} /> : <Download size={18} />}{!ready ? 'Wird vorbereitet …' : actualMode === 'both' ? 'Beide speichern' : 'Foto speichern'}</button></div>
      {prepareError && <p className="export-error" role="alert">Die Overlay-Datei konnte nicht erstellt werden. Verändere die Deckkraft zum erneuten Versuch oder speichere das Foto ohne Overlay.</p>}
      {!androidBridge() && <a className="download-link" href={ready ? downloadUrl : undefined} download={downloadName} aria-disabled={!ready} onClick={event => { if (!ready) event.preventDefault(); }}>{actualMode === 'both' ? 'Beide JPGs zusammen als ZIP herunterladen' : 'Direkt als JPG herunterladen'}</a>}
    </div></footer>
  </DialogContent></Dialog>;
}
