"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, Eye, EyeOff, Grid3X3, ImagePlus, Layers2, LoaderCircle, LockKeyhole, Move, RotateCcw, RotateCw, ShieldCheck, Smartphone, SwitchCamera, X, ZoomIn, SlidersHorizontal, Maximize2, Minimize2, ChevronDown } from "lucide-react";
import { LabeledSlider } from "@/components/labeled-slider";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { SaveModeControl } from "@/components/save-mode";
import { CaptureReview } from "@/components/capture-review";
import { canvasBlob, type PhotoCapture, type SaveMode } from "@/lib/photo-types";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";
import { androidBridge } from "@/lib/android";
import { coverCrop, overlayPlacement, composePhoto, paintOverlay, type Transform } from "@/lib/capture";

type ReferenceImage = { url: string; name: string; width: number; height: number; image: HTMLImageElement };
type CameraState = "idle" | "starting" | "ready" | "error";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const INITIAL: Transform = { x: 0, y: 0, scale: 1, rotation: 0 };

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);
  const sourceRequestRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const captureLockRef = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ center: { x: number; y: number }; distance: number; transform: Transform } | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState("");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 960, height: 580 });
  const [reference, setReference] = useState<ReferenceImage | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [opacity, setOpacity] = useState(50);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [saveMode, setSaveMode] = useState<SaveMode>("clean");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [nativeApp, setNativeApp] = useState(false);
  useEffect(() => setNativeApp(Boolean(androidBridge())), []);
  const [transform, setTransform] = useState<Transform>(INITIAL);
  const [locked, setLocked] = useState(false);
  const [grid, setGrid] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [capture, setCapture] = useState<PhotoCapture | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const hasOverlay = Boolean(reference);
  const ratio = stageSize.width / Math.max(1, stageSize.height);
  const frameHeight = stageSize.height;
  const frameWidth = stageSize.width;
  const crop = videoSize.width ? coverCrop(videoSize.width, videoSize.height, ratio) : null;
  const placement = reference ? overlayPlacement(frameWidth, frameHeight, reference.width, reference.height, transform) : null;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => { if (reference) URL.revokeObjectURL(reference.url); }, [reference]);
  useEffect(() => () => { if (capture) { URL.revokeObjectURL(capture.url); if (capture.layerUrl) URL.revokeObjectURL(capture.layerUrl); } }, [capture]);
  useEffect(() => {
    function closeCamera() {
      requestRef.current++;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    function onPageHide() { closeCamera(); setCameraState("idle"); }
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("zeitblick-pause", onPageHide);
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      closeCamera();
      sourceRequestRef.current++;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("zeitblick-pause", onPageHide);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);

  const stopCamera = useCallback(() => {
    requestRef.current++;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState("idle");
    setCameraError("");
  }, []);

  async function startCamera(nextFacing = facing) {
    const request = ++requestRef.current;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraState("starting");
    setCameraError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setCameraError("Öffne die App über ihren sicheren HTTPS-Link direkt in Chrome oder Safari. In manchen eingebetteten Browsern ist die Kamera gesperrt.");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
      } catch (error) {
        if ((error as DOMException).name !== "OverconstrainedError") throw error;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing } } });
      }
      if (request !== requestRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Video nicht verfügbar");
      video.srcObject = stream;
      await video.play();
      if (request !== requestRef.current) return;
      if (!video.videoWidth || !video.videoHeight) throw new Error("Kein Kamerabild");
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      const actualFacing = stream.getVideoTracks()[0].getSettings().facingMode;
      setFacing(actualFacing === "user" ? "user" : actualFacing === "environment" ? "environment" : nextFacing);
      setCameraState("ready");
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (request !== requestRef.current) return;
        setCameraState("error");
        setCameraError("Die Kamera wurde unterbrochen. Starte sie erneut.");
      });
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (request !== requestRef.current) return;
      streamRef.current = null;
      setCameraState("error");
      const name = (error as DOMException).name;
      setCameraError(name === "NotAllowedError" ? "Der Kamerazugriff ist blockiert. Erlaube die Kamera in den Website-Einstellungen deines Browsers und versuche es erneut." : name === "NotFoundError" ? "Keine Kamera gefunden. Öffne die App auf deinem Handy oder einem Gerät mit Kamera." : name === "NotReadableError" ? "Die Kamera ist gerade nicht verfügbar. Schließe andere Kamera-Apps und versuche es erneut." : "Das Kamerabild konnte nicht gestartet werden. Öffne die App direkt in Chrome oder Safari und versuche es erneut.");
    }
  }

  async function loadReference(file: File) {
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name)) { toast.error("Bitte wähle eine Bilddatei."); return; }
    if (file.size > 40 * 1024 * 1024) { toast.error("Das Bild ist zu groß. Bitte wähle eine Datei unter 40 MB."); return; }
    const request = ++sourceRequestRef.current;
    setLoadingImage(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (request !== sourceRequestRef.current) { URL.revokeObjectURL(url); return; }
      if (!img.naturalWidth || !img.naturalHeight) throw new Error("Ungültiges Bild");
      setReference({ url, name: file.name, width: img.naturalWidth, height: img.naturalHeight, image: img });
      setTransform(INITIAL);
      setLocked(false);
      setOverlayVisible(true);
      toast.success("Vorlage geladen. Richte jetzt deinen Blick aus.");
    } catch {
      URL.revokeObjectURL(url);
      if (request === sourceRequestRef.current) toast.error("Dieses Bildformat lässt sich hier nicht öffnen. Speichere das Bild als JPG, PNG oder WebP und wähle es erneut.");
    } finally { if (request === sourceRequestRef.current) setLoadingImage(false); }
  }

  function removeReference() {
    sourceRequestRef.current++;
    setLoadingImage(false);
    setReference(null);
    setSaveMode("clean");
    setTransform(INITIAL);
    setLocked(false);
  }

  function resetGesture() {
    const values = Array.from(pointers.current.values());
    if (!values.length) { gesture.current = null; return; }
    const center = values.length > 1 ? { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 } : values[0];
    gesture.current = { center, distance: values.length > 1 ? Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y) : 0, transform: { ...transform } };
  }
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!reference || locked || !overlayVisible) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    resetGesture();
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current || locked) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = Array.from(pointers.current.values());
    const g = gesture.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const center = values.length > 1 ? { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 } : values[0];
    const scale = values.length > 1 && g.distance > 0 ? g.transform.scale * Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y) / g.distance : g.transform.scale;
    setTransform({ ...g.transform, x: Math.max(-1, Math.min(1, g.transform.x + (center.x - g.center.x) / rect.width)), y: Math.max(-1, Math.min(1, g.transform.y + (center.y - g.center.y) / rect.height)), scale: Math.max(0.25, Math.min(4, scale)) });
  }
  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) { pointers.current.delete(event.pointerId); resetGesture(); }

  async function takePhoto() {
    const video = videoRef.current;
    if (captureLockRef.current || cameraState !== "ready" || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    captureLockRef.current = true; setCapturing(true);
    try {
      const source = coverCrop(video.videoWidth, video.videoHeight, ratio);
      const raw = document.createElement("canvas"); raw.width = source.width; raw.height = source.height;
      const ctx = raw.getContext("2d"); if (!ctx) throw new Error("Kein Bildspeicher");
      // Freeze camera pixels exactly once. Both exports use this same instant.
      composePhoto(ctx, video, source, null, false, 0, transform);
      let layer: HTMLCanvasElement | null = null;
      if (reference) {
        layer = document.createElement("canvas"); layer.width = raw.width; layer.height = raw.height;
        const layerCtx = layer.getContext("2d"); if (!layerCtx) throw new Error("Kein Bildspeicher");
        paintOverlay(layerCtx, raw.width, raw.height, reference, 100, transform);
      }
      const [blob, layerBlob] = await Promise.all([canvasBlob(raw), layer ? canvasBlob(layer, "image/png") : Promise.resolve(null)]);
      const id = new Date().toISOString().replace(/[:.]/g, "-");
      setCapture({ id, raw, layer, blob, url: URL.createObjectURL(blob), layerUrl: layerBlob ? URL.createObjectURL(layerBlob) : null, width: raw.width, height: raw.height, opacity, filename: `zeitblick-${id}` });
      setFlash(true); window.setTimeout(() => setFlash(false), 180); setReviewOpen(true);
    } catch { toast.error("Das Foto konnte nicht erstellt werden. Bitte versuche es erneut."); }
    finally { captureLockRef.current = false; setCapturing(false); }
  }

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast.info("Für die Vollbildansicht füge Zeitblick zum Home-Bildschirm hinzu.");
    } catch { toast.info("Öffne Zeitblick vom Home-Bildschirm für die Vollbildansicht."); }
  }

  useEffect(() => {
    type ModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => unknown }, options: { signal: AbortSignal }) => unknown };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(context.registerTool({ name: "configure_overlay", title: "Overlay einstellen", description: "Stellt Deckkraft und Sichtbarkeit der Vorlage sowie ihre Einbeziehung in neue Fotos ein. Startet keine Kamera und macht kein Foto.", inputSchema: { type: "object", properties: { opacity: { type: "number", minimum: 0, maximum: 100 }, visible: { type: "boolean" }, includeInPhoto: { type: "boolean" } }, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => {
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Ein Objekt wird benötigt.");
        const value = input as Record<string, unknown>;
        if (Object.keys(value).some(key => !["opacity", "visible", "includeInPhoto"].includes(key))) throw new Error("Unbekannte Einstellung.");
        if (value.opacity !== undefined && (typeof value.opacity !== "number" || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 100)) throw new Error("Deckkraft muss zwischen 0 und 100 liegen.");
        for (const key of ["visible", "includeInPhoto"]) if (value[key] !== undefined && typeof value[key] !== "boolean") throw new Error("Schalter benötigen true oder false.");
        if (typeof value.opacity === "number") setOpacity(value.opacity);
        if (typeof value.visible === "boolean") setOverlayVisible(value.visible);
        if (typeof value.includeInPhoto === "boolean") setSaveMode(value.includeInPhoto ? "overlay" : "clean");
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { applied: value };
      } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional browser API. Visible controls always remain available. */ }
    return () => lifecycle.abort();
  }, []);

  return (
    <div className="camera-app">
      <Toaster position="top-center" theme="dark" richColors />
      <input ref={fileRef} className="sr-only" type="file" accept="image/*" aria-label="Vorlagenbild auswählen" onChange={event => { const file = event.target.files?.[0]; if (file) loadReference(file); event.target.value = ""; }} />
      <header className="camera-topbar">
        <div className="brand"><Layers2 size={22} strokeWidth={1.5} /><span>zeitblick<span>.</span></span></div>
        <div className="camera-top-actions">
          <button className={`icon-button ${grid ? "selected" : ""}`} onClick={() => setGrid(!grid)} aria-label="Hilfsraster" aria-pressed={grid} title="Hilfsraster"><Grid3X3 size={20} /></button>
          <button className="icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? "Vollbild beenden" : "Vollbild öffnen"} title="Vollbild">{fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}</button>
          <button className={`icon-button ${settingsOpen ? "selected" : ""}`} onClick={() => setSettingsOpen(true)} aria-label="Einstellungen öffnen" title="Einstellungen"><SlidersHorizontal size={21} /></button>
        </div>
      </header>
      <main className={`camera-stage ${draggingFile ? "file-over" : ""}`} ref={stageRef} aria-label="Kamera und Sucher" onDragOver={event => { event.preventDefault(); setDraggingFile(true); }} onDragLeave={() => setDraggingFile(false)} onDrop={event => { event.preventDefault(); setDraggingFile(false); const file = event.dataTransfer.files[0]; if (file) loadReference(file); }}>
        <div className={`viewfinder ${reference && !locked && overlayVisible ? "movable" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd} tabIndex={reference ? 0 : -1} role="group" aria-label="Live-Sucher. Vorlage mit den Pfeiltasten verschieben." onKeyDown={event => { if (!reference || locked || !overlayVisible) return; const moves: Record<string, [number, number]> = { ArrowLeft: [-0.005, 0], ArrowRight: [0.005, 0], ArrowUp: [0, -0.005], ArrowDown: [0, 0.005] }; if (moves[event.key]) { event.preventDefault(); const [dx, dy] = moves[event.key]; setTransform(t => ({ ...t, x: Math.max(-1, Math.min(1, t.x + dx * (event.shiftKey ? 5 : 1))), y: Math.max(-1, Math.min(1, t.y + dy * (event.shiftKey ? 5 : 1))) })); } }}>
          <video ref={videoRef} autoPlay playsInline muted className={cameraState === "ready" ? "live-video" : "live-video inactive"} onResize={() => { const video = videoRef.current; if (video?.videoWidth && video?.videoHeight) setVideoSize({ width: video.videoWidth, height: video.videoHeight }); }} />
          {reference && placement && <img className="overlay-image" src={reference.url} alt="Deine historische Vorlage" draggable={false} style={{ width: placement.width, height: placement.height, left: placement.centerX, top: placement.centerY, transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`, opacity: overlayVisible ? opacity / 100 : 0 }} />}
          {grid && <div className="thirds-grid" aria-hidden="true"><i /><i /><i /><i /></div>}
          <div className="frame-corners" aria-hidden="true"><i /><i /><i /><i /></div>
          {flash && <div className="capture-flash" />}
        </div>
        <div className="viewfinder-top"><span className={`camera-status ${cameraState === "ready" ? "active" : ""}`}>{cameraState === "ready" ? "LIVE" : cameraState === "starting" ? "VERBINDET" : cameraState === "error" ? "KAMERA INAKTIV" : "SUCHER"}</span><div>{cameraState === "ready" && <button className="icon-button glass-button" onClick={stopCamera} aria-label="Kamera ausschalten"><CameraOff size={18} /></button>}{reference && <button className={`icon-button glass-button ${locked ? "selected" : ""}`} onClick={() => setLocked(!locked)} aria-label={locked ? "Vorlage lösen" : "Vorlage fixieren"} aria-pressed={locked}><LockKeyhole size={18} /></button>}</div></div>
        {cameraState !== "ready" && <div className={`camera-empty ${reference ? "with-reference" : ""}`}><div className="camera-empty-content"><span className="empty-camera-icon">{cameraState === "starting" ? <LoaderCircle className="spin" size={32} /> : cameraState === "error" ? <CameraOff size={32} strokeWidth={1.4} /> : <Camera size={36} strokeWidth={1.35} />}</span><h1>{cameraState === "starting" ? "Deine Kamera wird gestartet …" : cameraState === "error" ? "Noch kein Kamerabild" : "Damals im Blick."}</h1><p>{cameraState === "starting" ? "Bitte erlaube den Kamerazugriff in deinem Browser." : cameraError || "Lege dein historisches Foto über die heutige Aussicht."}</p><button className="primary-button" onClick={() => cameraState === "starting" ? stopCamera() : startCamera()}>{cameraState === "starting" ? "Abbrechen" : <><Camera size={18} />{cameraState === "error" ? "Erneut versuchen" : "Kamera starten"}</>}</button><span className="camera-permission-note"><ShieldCheck size={13} />Privat und werbefrei</span></div></div>}
        <div className="viewfinder-bottom"><span>{reference ? <>{locked ? <LockKeyhole size={13} /> : <Move size={13} />}{locked ? "Vorlage fixiert" : "Vorlage ziehen & zoomen"}</> : "Vorlage unten auswählen"}</span>{cameraState === "ready" && <span>{crop?.width} × {crop?.height}</span>}</div>
      </main>
      <footer className="camera-dock"><div className="dock-inner">
        <div className="opacity-row"><button className={`icon-button ${reference && overlayVisible ? "selected" : ""}`} onClick={() => setOverlayVisible(!overlayVisible)} disabled={!reference} aria-label={overlayVisible ? "Vorlage ausblenden" : "Vorlage anzeigen"} aria-pressed={overlayVisible}>{overlayVisible ? <Eye size={20} /> : <EyeOff size={20} />}</button><div className="opacity-control"><label id="opacity-label">Deckkraft <output>{opacity} %</output></label><LabeledSlider className="control-slider" aria-labelledby="opacity-label" min={0} max={100} step={1} value={[opacity]} onValueChange={([value]) => setOpacity(value)} disabled={!reference} /></div><button className="reference-button" onClick={() => fileRef.current?.click()} disabled={loadingImage}>{loadingImage ? <LoaderCircle className="spin" size={19} /> : reference ? <img src={reference.url} alt="Geladene Vorlage" /> : <ImagePlus size={21} />}<span>{reference ? "Wechseln" : "Vorlage"}</span></button></div>
        <div className="shutter-row"><button className="last-photo" onClick={() => setReviewOpen(true)} disabled={!capture} aria-label="Letztes Foto vergleichen">{capture ? <img src={capture.url} alt="Letztes Foto ohne Overlay" /> : <ImagePlus size={23} strokeWidth={1.5} />}</button><div className="shutter-wrap"><button className="shutter" onClick={takePhoto} disabled={cameraState !== "ready" || capturing} aria-label="Foto aufnehmen"><span>{capturing ? <LoaderCircle className="spin" size={28} /> : <Camera size={28} strokeWidth={1.5} />}</span></button></div><button className="camera-switch icon-button" disabled={cameraState === "starting"} onClick={() => startCamera(facing === "environment" ? "user" : "environment")} aria-label="Kamera wechseln"><SwitchCamera size={26} /></button></div>
        <button className="save-summary" onClick={() => setSettingsOpen(true)}>{saveMode === "both" && reference ? <Layers2 size={13} /> : <Check size={13} />}{!reference || saveMode === "clean" ? "Foto ohne Overlay" : saveMode === "both" ? "Beide Varianten speichern" : "Foto mit Overlay"}<ChevronDown size={13} /></button>
      </div></footer>
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}><SheetContent side="bottom" className="settings-sheet" showCloseButton={false}><div className="sheet-inner"><div className="sheet-heading"><div><SheetTitle>Dein Blick, deine Einstellungen.</SheetTitle><SheetDescription>Die Vorlage bleibt unabhängig vom gespeicherten Foto.</SheetDescription></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Einstellungen schließen"><X size={21} /></button></div><div className="settings-grid">
        <section className="settings-section"><h2>Vorlage ausrichten</h2><div className="range-heading"><label id="scale-label"><ZoomIn size={15} />Größe</label><output>{Math.round(transform.scale * 100)} %</output></div><LabeledSlider className="control-slider" aria-labelledby="scale-label" value={[transform.scale * 100]} onValueChange={([value]) => setTransform(t => ({ ...t, scale: value / 100 }))} min={25} max={400} step={1} disabled={!reference || locked} /><div className="range-heading"><label id="rotation-label"><RotateCw size={15} />Drehung</label><output>{Math.round(transform.rotation)}°</output></div><LabeledSlider className="control-slider" aria-labelledby="rotation-label" value={[transform.rotation]} onValueChange={([value]) => setTransform(t => ({ ...t, rotation: value }))} min={-180} max={180} step={1} disabled={!reference || locked} /><div className="setting-row"><label htmlFor="lock-overlay"><LockKeyhole size={15} />Position fixieren</label><Switch className="app-switch" id="lock-overlay" checked={locked} onCheckedChange={setLocked} disabled={!reference} /></div><div className="setting-buttons"><button className="quiet-button" disabled={!reference} onClick={() => { setTransform(INITIAL); setLocked(false); }}><RotateCcw size={15} />Zurücksetzen</button><button className="quiet-button" disabled={!reference} onClick={removeReference}><X size={15} />Vorlage entfernen</button></div></section>
        <section className="settings-section"><h2>Standard beim Speichern</h2><SaveModeControl id="camera-save" value={saveMode} onChange={setSaveMode} hasOverlay={hasOverlay} /><p className="setting-explanation">Du kannst die Auswahl nach der Aufnahme noch ändern. „Beide“ speichert zwei Varianten desselben Moments.</p><button className="help-link" onClick={() => { setSettingsOpen(false); setHelpOpen(true); }}><Smartphone size={19} /><span>{nativeApp ? "Hilfe & Android-App" : "Hilfe & zum Startbildschirm hinzufügen"}</span></button><p className="privacy-note"><ShieldCheck size={14} />Deine Bilder werden lokal auf deinem Gerät verarbeitet.</p></section>
      </div></div></SheetContent></Sheet>
      {capture && <CaptureReview key={capture.id} capture={capture} open={reviewOpen} onOpenChange={setReviewOpen} mode={saveMode} setMode={setSaveMode} />}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="help-dialog" showCloseButton={false}><button className="dialog-close icon-button" aria-label="Hilfe schließen" onClick={() => setHelpOpen(false)}><X size={21} /></button><DialogTitle>Ein Ort. Zwei Zeiten.</DialogTitle><DialogDescription>So hältst du die Perspektive von damals fest.</DialogDescription><ol className="help-steps"><li><strong>Vorlage auswählen</strong><p>Wähle unten dein historisches Bild aus. Mit dem Auge blendest du es im Sucher ein und aus.</p></li><li><strong>Ausrichten & aufnehmen</strong><p>Starte die Kamera, regle die Deckkraft und richte die Perspektive aus. Du kannst die Vorlage ziehen, mit zwei Fingern zoomen und in den Einstellungen drehen.</p></li><li><strong>Genau vergleichen</strong><p>Nach dem Auslösen zoomst du mit zwei Fingern oder den Plus- und Minus-Tasten bis zu 6× in die Aufnahme. Blende die Vorlage ein und aus oder ändere ihre Deckkraft. Der Zoom dient nur der Kontrolle und beschneidet dein Foto nicht.</p></li><li><strong>Eine oder beide Varianten speichern</strong><p>Wähle „Ohne Overlay“, „Mit Overlay“ oder „Beide“. Bei „Beide“ bekommst du zwei JPGs aus derselben Aufnahme. Unterstützt dein Gerät den gemeinsamen Speicherdialog nicht, enthält der ZIP-Download beide Dateien.</p></li></ol><div className="install-help"><Smartphone size={22} /><div><strong>{nativeApp ? "Zeitblick für Android" : "Wie eine App öffnen"}</strong><p>{nativeApp ? "Deine Fotos werden direkt im Album Zeitblick in deiner Galerie gespeichert. Die App verarbeitet deine Bilder lokal und funktioniert ohne Internet." : "Android: Im Chrome-Menü „Zum Startbildschirm hinzufügen“ wählen. iPhone: In Safari über „Teilen“ zum Home-Bildschirm hinzufügen."}</p>{installPrompt && <button className="primary-button" onClick={async () => { try { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); } catch { toast.error("Nutze zum Hinzufügen bitte das Menü deines Browsers."); } }}>App hinzufügen</button>}</div></div><p className="help-footnote">Die Auflösung hängt vom Live-Kamerabild deines Geräts ab. Speichere Fotos vor dem Neuladen. Vorlage und Aufnahme bleiben nur für diese Sitzung verfügbar.</p></DialogContent></Dialog>
    </div>
  );
}
