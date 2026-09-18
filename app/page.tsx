"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, ChevronRight, Download, Eye, EyeOff, Focus, Grid3X3, ImagePlus, Layers2, LoaderCircle, LockKeyhole, Move, RotateCcw, RotateCw, ShieldCheck, Smartphone, SwitchCamera, X, ZoomIn } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";
import { coverCrop, overlayPlacement, composePhoto, type Transform } from "@/lib/capture";

type ReferenceImage = { url: string; name: string; width: number; height: number; image: HTMLImageElement };
type Capture = { url: string; blob: Blob; filename: string; width: number; height: number; withOverlay: boolean; opacity: number };
type CameraState = "idle" | "starting" | "ready" | "error";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
function LabeledSlider(props: React.ComponentProps<typeof Slider>) {
  return <Slider {...props} ref={node => {
    const thumb = node?.querySelector('[role="slider"]');
    if (thumb && props["aria-labelledby"]) thumb.setAttribute("aria-labelledby", String(props["aria-labelledby"]));
  }} />;
}
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
  const [includeOverlay, setIncludeOverlay] = useState(false);
  const [transform, setTransform] = useState<Transform>(INITIAL);
  const [locked, setLocked] = useState(false);
  const [grid, setGrid] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const hasOverlay = Boolean(reference);
  const ratio = reference ? reference.width / reference.height : videoSize.width ? videoSize.width / videoSize.height : 4 / 3;
  const frameHeight = Math.min(stageSize.height, stageSize.width / ratio);
  const frameWidth = frameHeight * ratio;
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
  useEffect(() => () => { if (capture) URL.revokeObjectURL(capture.url); }, [capture]);
  useEffect(() => {
    function closeCamera() {
      requestRef.current++;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    function onPageHide() { closeCamera(); setCameraState("idle"); }
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      closeCamera();
      sourceRequestRef.current++;
      window.removeEventListener("pagehide", onPageHide);
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
    setIncludeOverlay(false);
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
    captureLockRef.current = true;
    setCapturing(true);
    try {
      const source = coverCrop(video.videoWidth, video.videoHeight, ratio);
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Kein Bildspeicher verfügbar");
      const withOverlay = Boolean(includeOverlay && reference);
      composePhoto(ctx, video, source, reference, includeOverlay, opacity, transform);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Bild konnte nicht erstellt werden")), "image/jpeg", 0.96));
      const date = new Date();
      const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}-${date.getMilliseconds()}`;
      setCapture({ url: URL.createObjectURL(blob), blob, filename: `zeitblick-${stamp}${withOverlay ? "-mit-vorlage" : ""}.jpg`, width: canvas.width, height: canvas.height, withOverlay, opacity });
      setFlash(true);
      window.setTimeout(() => setFlash(false), 180);
      setReviewOpen(true);
    } catch { toast.error("Das Foto konnte nicht erstellt werden. Bitte versuche es erneut."); }
    finally { captureLockRef.current = false; setCapturing(false); }
  }

  async function savePhoto() {
    if (!capture) return;
    const file = new File([capture.blob], capture.filename, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try { await navigator.share({ files: [file], title: "Zeitblick Foto" }); return; }
      catch (error) { if ((error as DOMException).name === "AbortError") return; }
    }
    const link = document.createElement("a");
    link.href = capture.url;
    link.download = capture.filename;
    document.body.appendChild(link); link.click(); link.remove();
    toast.success("Download gestartet. Du findest das Foto in deinen Downloads.");
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
        if (typeof value.includeInPhoto === "boolean") setIncludeOverlay(value.includeInPhoto);
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { applied: value };
      } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional browser API. Visible controls always remain available. */ }
    return () => lifecycle.abort();
  }, []);

  return (
    <div className="app-shell">
      <Toaster position="bottom-center" theme="dark" richColors />
      <header className="app-header">
        <a className="brand" href="/" aria-label="Zeitblick Startseite"><span className="brand-symbol"><Layers2 size={24} strokeWidth={1.65} /></span><span>zeitblick<span className="brand-period">.</span></span></a>
        <span className="header-divider" /><span className="app-category">OVERLAY KAMERA</span>
        <div className="header-actions"><span className="private-label"><ShieldCheck size={15} /> Lokal. Privat. Werbefrei.</span><button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="App installieren und Hilfe" title="App installieren und Hilfe"><Smartphone size={20} /></button></div>
      </header>
      <main className="workspace">
        <div className="workspace-heading"><div><div className="eyebrow">DAMALS IM BLICK. HEUTE IM BILD.</div><h1>Die Perspektive von damals.</h1></div><span className="workspace-note">Dein Motiv. Dein Moment.</span></div>
        <div className="workspace-grid">
          <section className="camera-panel" aria-label="Kamera und Sucher">
            <div className="camera-toolbar"><div className="viewfinder-title"><Focus size={17} /><span>Sucher</span><span className={`camera-status ${cameraState === "ready" ? "active" : ""}`}>{cameraState === "ready" ? "LIVE" : cameraState === "starting" ? "VERBINDET" : "BEREIT"}</span></div><div className="toolbar-actions"><button className={`icon-button ${grid ? "selected" : ""}`} onClick={() => setGrid(!grid)} aria-label="Hilfsraster" aria-pressed={grid} title="Hilfsraster"><Grid3X3 size={18} /></button><button className="icon-button" disabled={cameraState === "starting"} onClick={() => startCamera(facing === "environment" ? "user" : "environment")} aria-label="Kamera wechseln" title="Kamera wechseln"><SwitchCamera size={20} /></button>{cameraState === "ready" && <button className="icon-button" onClick={stopCamera} aria-label="Kamera ausschalten" title="Kamera ausschalten"><CameraOff size={18} /></button>}</div></div>
            <div className={`stage-area ${draggingFile ? "file-over" : ""}`} ref={stageRef} onDragOver={event => { event.preventDefault(); setDraggingFile(true); }} onDragLeave={() => setDraggingFile(false)} onDrop={event => { event.preventDefault(); setDraggingFile(false); const file = event.dataTransfer.files[0]; if (file) loadReference(file); }}>
              <div className={`viewfinder ${reference && !locked && overlayVisible ? "movable" : ""}`} style={{ width: frameWidth, height: frameHeight }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd} tabIndex={reference ? 0 : -1} role="group" aria-label="Live-Sucher. Vorlage mit den Pfeiltasten verschieben." onKeyDown={event => { if (!reference || locked || !overlayVisible) return; const moves: Record<string, [number, number]> = { ArrowLeft: [-0.005, 0], ArrowRight: [0.005, 0], ArrowUp: [0, -0.005], ArrowDown: [0, 0.005] }; if (moves[event.key]) { event.preventDefault(); const [dx, dy] = moves[event.key]; setTransform(t => ({ ...t, x: Math.max(-1, Math.min(1, t.x + dx * (event.shiftKey ? 5 : 1))), y: Math.max(-1, Math.min(1, t.y + dy * (event.shiftKey ? 5 : 1))) })); } }}>
                <video ref={videoRef} autoPlay playsInline muted className={cameraState === "ready" ? "live-video" : "live-video inactive"} onResize={() => { const video = videoRef.current; if (video?.videoWidth && video?.videoHeight) setVideoSize({ width: video.videoWidth, height: video.videoHeight }); }} />
                {reference && placement && <img className="overlay-image" src={reference.url} alt="Deine historische Vorlage" draggable={false} style={{ width: placement.width, height: placement.height, left: placement.centerX, top: placement.centerY, transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`, opacity: overlayVisible ? opacity / 100 : 0 }} />}
                {grid && <div className="thirds-grid" aria-hidden="true"><i /><i /><i /><i /></div>}
                <div className="frame-corners" aria-hidden="true"><i /><i /><i /><i /></div>
                {flash && <div className="capture-flash" />}
              </div>
              {cameraState !== "ready" && <div className={`camera-empty ${reference ? "with-reference" : ""}`}><div className="camera-empty-content"><span className="empty-camera-icon">{cameraState === "starting" ? <LoaderCircle className="spin" size={30} /> : cameraState === "error" ? <CameraOff size={30} strokeWidth={1.4} /> : <Camera size={32} strokeWidth={1.35} />}</span><h2>{cameraState === "starting" ? "Deine Kamera wird gestartet …" : cameraState === "error" ? "Noch kein Kamerabild" : "Ein neuer Blick auf damals."}</h2><p>{cameraState === "starting" ? "Bitte erlaube den Kamerazugriff in deinem Browser." : cameraError || "Starte die Kamera und lege dein altes Foto über die heutige Aussicht."}</p><button className="primary-button start-camera" onClick={() => cameraState === "starting" ? stopCamera() : startCamera()}>{cameraState === "starting" ? "Abbrechen" : <><Camera size={18} />{cameraState === "error" ? "Erneut versuchen" : "Kamera starten"}</>}</button>{cameraState !== "error" && <span className="camera-permission-note"><LockKeyhole size={12} /> Kamera erst nach deiner Freigabe</span>}</div></div>}
              {cameraState === "ready" && <div className="frame-label"><span>{facing === "user" ? "Frontkamera" : "Rückkamera"}</span><span>{crop ? `${crop.width} × ${crop.height}` : ""}</span></div>}
            </div>
            <div className="viewfinder-bottom"><span>{reference ? <><Move size={14} />{locked ? "Vorlage ist fixiert" : "Ziehen & mit zwei Fingern zoomen"}</> : <><ImagePlus size={14} />Wähle ein Foto als Vorlage</>}</span><button disabled={!reference} className={`quiet-button ${overlayVisible && reference ? "highlight" : ""}`} onClick={() => setOverlayVisible(!overlayVisible)} aria-pressed={overlayVisible && Boolean(reference)}>{overlayVisible ? <Eye size={16} /> : <EyeOff size={16} />}<span>{overlayVisible ? "Vorlage sichtbar" : "Vorlage ausgeblendet"}</span></button></div>
            <div className="mobile-quick"><div className="mobile-quick-top"><button onClick={() => fileRef.current?.click()} disabled={loadingImage}><ImagePlus size={17} />{loadingImage ? "Lädt …" : reference ? "Bild wechseln" : "Vorlage"}</button><div className="mobile-opacity"><label id="mobile-opacity-label">Deckkraft <span>{Math.round(opacity)} %</span></label><LabeledSlider aria-labelledby="mobile-opacity-label" className="control-slider" min={0} max={100} step={1} value={[opacity]} onValueChange={([value]) => setOpacity(value)} disabled={!reference} /></div></div><div className="mobile-export"><label htmlFor="mobile-include">Vorlage mitspeichern</label><Switch id="mobile-include" className="app-switch" checked={includeOverlay && hasOverlay} onCheckedChange={setIncludeOverlay} disabled={!reference} /></div></div>
            <div className="capture-bar"><div className="last-photo-wrap"><button className={`last-photo ${capture ? "has-photo" : ""}`} disabled={!capture} onClick={() => setReviewOpen(true)} aria-label="Letztes Foto ansehen">{capture ? <img src={capture.url} alt="Letztes Foto" /> : <ImagePlus size={22} strokeWidth={1.4} />}</button><span>{capture ? "Letztes Foto" : "Dein Foto"}</span></div><button className="shutter" disabled={cameraState !== "ready" || capturing} onClick={takePhoto} aria-label="Foto aufnehmen"><span>{capturing ? <LoaderCircle className="spin" size={28} /> : <Camera size={28} strokeWidth={1.6} />}</span></button><div className="export-indicator"><span className={`export-indicator-icon ${includeOverlay && reference ? "with-overlay" : ""}`}>{includeOverlay && reference ? <Layers2 size={18} /> : <Check size={20} />}</span><span>{includeOverlay && reference ? "Mit Vorlage" : "Ohne Vorlage"}<small>im fertigen Foto</small></span></div></div>
          </section>
          <aside className="controls-panel" aria-label="Overlay Einstellungen">
            <section className="control-section reference-section"><div className="section-label"><span className="step-number">01</span><h2>Deine Vorlage</h2><span className="section-icon"><Layers2 size={17} /></span></div><input ref={fileRef} className="sr-only" type="file" accept="image/*" aria-label="Vorlagenbild auswählen" onChange={event => { const file = event.target.files?.[0]; if (file) loadReference(file); event.target.value = ""; }} />{reference ? <div className="reference-selected"><img src={reference.url} alt="Geladene Vorlage" /><div><strong title={reference.name}>{reference.name}</strong><span>{reference.width} × {reference.height} px</span><button className="text-button" onClick={() => fileRef.current?.click()}>Bild wechseln</button></div><button className="icon-button" onClick={removeReference} aria-label="Vorlage entfernen"><X size={16} /></button></div> : <button className="upload-area" disabled={loadingImage} onClick={() => fileRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) loadReference(file); }}><span className="upload-icon">{loadingImage ? <LoaderCircle className="spin" size={23} /> : <ImagePlus size={23} strokeWidth={1.5} />}</span><strong>{loadingImage ? "Bild wird geladen …" : "Vorlage auswählen"}</strong><span>Ein altes Foto. Ein neuer Blick.</span><small>JPG, PNG oder WebP</small></button>}</section>
            <section className="control-section"><div className="section-label"><span className="step-number">02</span><h2>Ausrichten</h2><button className="icon-button reset-button" disabled={!hasOverlay} onClick={() => { setTransform(INITIAL); setLocked(false); }} aria-label="Ausrichtung zurücksetzen" title="Ausrichtung zurücksetzen"><RotateCcw size={16} /></button></div><div className={`adjustments ${!hasOverlay ? "unavailable" : ""}`}><div className="range-heading"><label id="opacity-label">Deckkraft</label><output className="value-pill">{Math.round(opacity)}<span> %</span></output></div><LabeledSlider className="control-slider opacity-slider" aria-labelledby="opacity-label" value={[opacity]} onValueChange={([value]) => setOpacity(value)} min={0} max={100} step={1} disabled={!hasOverlay} /><div className="range-limits"><span>Nur Kamera</span><span>Nur Vorlage</span></div><div className="range-heading compact"><label id="scale-label"><ZoomIn size={15} />Größe</label><output>{Math.round(transform.scale * 100)} %</output></div><LabeledSlider className="control-slider secondary-slider" aria-labelledby="scale-label" value={[transform.scale * 100]} onValueChange={([value]) => setTransform(t => ({ ...t, scale: value / 100 }))} min={25} max={400} step={1} disabled={!hasOverlay || locked} /><div className="range-heading compact"><label id="rotation-label"><RotateCw size={15} />Drehung</label><output>{Math.round(transform.rotation)}°</output></div><LabeledSlider className="control-slider secondary-slider" aria-labelledby="rotation-label" value={[transform.rotation]} onValueChange={([value]) => setTransform(t => ({ ...t, rotation: value }))} min={-180} max={180} step={1} disabled={!hasOverlay || locked} /><div className="lock-row"><label htmlFor="lock-overlay"><LockKeyhole size={14} />Position fixieren</label><Switch className="app-switch" id="lock-overlay" checked={locked} onCheckedChange={setLocked} disabled={!hasOverlay} /></div></div></section>
            <section className="control-section export-section"><div className="section-label"><span className="step-number">03</span><h2>Dein Foto</h2></div><div className="export-setting"><label htmlFor="include-overlay"><span>Vorlage mitspeichern</span><small>{includeOverlay && reference ? "Mit der eingestellten Deckkraft." : "Nur das aktuelle Kamerabild."}</small></label><Switch className="app-switch" id="include-overlay" checked={includeOverlay && hasOverlay} onCheckedChange={setIncludeOverlay} disabled={!hasOverlay} /></div><div className={`export-explainer ${includeOverlay && reference ? "export-composite" : ""}`}><span>{includeOverlay && reference ? <Layers2 size={17} /> : <ShieldCheck size={18} />}</span><p>{includeOverlay && reference ? "Die Vorlage wird ins Foto eingeblendet – auch wenn sie im Sucher ausgeblendet ist." : "Die Vorlage hilft dir beim Ausrichten. Dein gespeichertes Foto bleibt ohne Overlay."}</p></div></section>
          </aside>
        </div>
        <footer className="app-footer"><span><LockKeyhole size={13} />Deine Bilder werden auf deinem Gerät verarbeitet.</span><button onClick={() => setHelpOpen(true)}>So funktioniert’s<ChevronRight size={14} /></button></footer>
      </main>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent className="photo-dialog" showCloseButton={false}><button className="dialog-close icon-button" aria-label="Fotovorschau schließen" onClick={() => setReviewOpen(false)}><X size={21} /></button><DialogTitle>Dein Moment, festgehalten.</DialogTitle><DialogDescription>Kontrolliere dein Foto und speichere es auf deinem Gerät.</DialogDescription>{capture && <><div className="photo-review"><img src={capture.url} alt={capture.withOverlay ? "Aufgenommenes Foto mit Vorlage" : "Aufgenommenes Foto ohne Vorlage"} /></div><div className="photo-meta"><span><Check size={15} />{capture.withOverlay ? `Mit Vorlage · ${capture.opacity} %` : "Ohne Vorlage"}</span><span>JPG · {capture.width} × {capture.height}</span></div><button className="primary-button save-button" onClick={savePhoto}><Download size={18} />Foto speichern</button><a className="direct-download" href={capture.url} download={capture.filename}>Direkt als JPG herunterladen</a><button className="quiet-button back-camera" onClick={() => setReviewOpen(false)}>Weiter fotografieren</button></>}</DialogContent></Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="help-dialog" showCloseButton={false}><button className="dialog-close icon-button" aria-label="Hilfe schließen" onClick={() => setHelpOpen(false)}><X size={21} /></button><DialogTitle>Ein Ort. Zwei Zeiten.</DialogTitle><DialogDescription>So hältst du die Perspektive von damals fest.</DialogDescription><ol className="help-steps"><li><span>01</span><div><strong>Vorlage auswählen</strong><p>Wähle ein historisches Bild aus deinen Fotos.</p></div></li><li><span>02</span><div><strong>Perspektive finden</strong><p>Starte die Kamera. Passe die Deckkraft an, verschiebe die Vorlage und zoome mit zwei Fingern. Bewege dein Handy, bis die Ansichten zusammenpassen.</p></div></li><li><span>03</span><div><strong>Den Moment aufnehmen</strong><p>„Vorlage mitspeichern“ ist anfangs aus. Tippe auf den Auslöser und dann auf „Foto speichern“. Mit dem Schalter kannst du auch beide Bilder zusammen aufnehmen.</p></div></li></ol><div className="install-help"><Smartphone size={22} /><div><strong>Wie eine App öffnen</strong><p>Android: Im Chrome-Menü „Zum Startbildschirm hinzufügen“ wählen. iPhone: In Safari über „Teilen“ zum Home-Bildschirm hinzufügen.</p>{installPrompt && <button className="primary-button" onClick={async () => { try { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); } catch { toast.error("Nutze zum Hinzufügen bitte das Menü deines Browsers."); } }}>App hinzufügen</button>}</div></div><p className="help-footnote">Fotos werden aus dem Live-Kamerabild aufgenommen. Auflösung und Kamerafunktionen hängen vom Gerät und Browser ab. Vorlagen und Fotos bleiben hier nur bis zum Neuladen verfügbar – speichere deine Aufnahme vorher.</p></DialogContent></Dialog>
    </div>
  );
}
