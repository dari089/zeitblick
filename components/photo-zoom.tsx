"use client";
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import type { PhotoCapture } from "@/lib/photo-types";

type Pose = { x: number; y: number; z: number };
const start: Pose = { x: 0, y: 0, z: 1 };
export function PhotoZoom({ capture, opacity }: { capture: PhotoCapture; opacity: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [pose, setPose] = useState(start);
  const poseRef = useRef(start);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ center: { x: number; y: number }; distance: number; pose: Pose } | null>(null);
  const fit = Math.min(size.width / capture.width, size.height / capture.height);
  const width = capture.width * fit, height = capture.height * fit;
  function update(next: Pose) {
    const z = Math.max(1, Math.min(6, next.z));
    const maxX = Math.max(0, (width * z - size.width) / 2);
    const maxY = Math.max(0, (height * z - size.height) / 2);
    const clamped = { z, x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) };
    poseRef.current = clamped; setPose(clamped);
  }
  function zoomTo(z: number, point = { x: 0, y: 0 }) {
    const current = poseRef.current, next = Math.max(1, Math.min(6, z));
    const factor = next / current.z;
    update({ z: next, x: point.x - (point.x - current.x) * factor, y: point.y - (point.y - current.y) * factor });
  }
  useEffect(() => {
    const node = ref.current; if (!node) return;
    const observer = new ResizeObserver(([entry]) => { setSize({ width: entry.contentRect.width, height: entry.contentRect.height }); setPose(start); poseRef.current = start; });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = ref.current; if (!node) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const rect = node!.getBoundingClientRect();
      zoomTo(poseRef.current.z * Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 });
    }
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [size.width, size.height, width, height]);
  function beginGesture() {
    const values = Array.from(points.current.values());
    if (!values.length) { gesture.current = null; return; }
    gesture.current = { center: values.length > 1 ? { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 } : values[0], distance: values.length > 1 ? Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) : 0, pose: { ...poseRef.current } };
  }
  function position(event: React.PointerEvent) { const rect = ref.current!.getBoundingClientRect(); return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }; }
  return <div className="zoom-container">
    <div className="zoom-surface" ref={ref} role="group" tabIndex={0} aria-label="Fotovergleich. Mit zwei Fingern zoomen, ziehen zum Verschieben. Plus und Minus zum Zoomen, Pfeiltasten zum Verschieben." onDoubleClick={() => zoomTo(pose.z > 1 ? 1 : 2.5)} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); points.current.set(event.pointerId, position(event)); beginGesture(); }} onPointerMove={event => {
      if (!points.current.has(event.pointerId) || !gesture.current) return;
      points.current.set(event.pointerId, position(event));
      const values = Array.from(points.current.values()), g = gesture.current;
      const center = values.length > 1 ? { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 } : values[0];
      const z = Math.max(1, Math.min(6, values.length > 1 && g.distance ? g.pose.z * Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) / g.distance : g.pose.z));
      update({ z, x: center.x - (g.center.x - g.pose.x) * z / g.pose.z, y: center.y - (g.center.y - g.pose.y) * z / g.pose.z });
    }} onPointerUp={event => { points.current.delete(event.pointerId); beginGesture(); }} onPointerCancel={event => { points.current.delete(event.pointerId); beginGesture(); }} onLostPointerCapture={event => { points.current.delete(event.pointerId); beginGesture(); }} onKeyDown={event => {
      const directions: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTo(pose.z + 0.5); }
      else if (event.key === '-') { event.preventDefault(); zoomTo(pose.z - 0.5); }
      else if (directions[event.key]) { event.preventDefault(); const [x, y] = directions[event.key]; update({ ...pose, x: pose.x + x, y: pose.y + y }); }
    }}>
      <div className="zoom-images" style={{ width, height, transform: `translate(-50%,-50%) translate(${pose.x}px,${pose.y}px) scale(${pose.z})` }}>
        <img src={capture.url} alt="Dein aufgenommenes Foto ohne Overlay" draggable={false} />
        {capture.layerUrl && <img src={capture.layerUrl} alt="Ausgerichtete Vorlage zum Vergleichen" draggable={false} style={{ opacity: opacity / 100 }} />}
      </div>
    </div>
    <div className="zoom-controls"><button className="icon-button" aria-label="Vorschau verkleinern" onClick={() => zoomTo(pose.z - 0.5)} disabled={pose.z <= 1}><Minus size={18} /></button><output aria-label="Vorschauzoom">{pose.z.toFixed(1)}×</output><button className="icon-button" aria-label="Vorschau vergrößern" onClick={() => zoomTo(pose.z + 0.5)} disabled={pose.z >= 6}><Plus size={18} /></button><span /><button className="icon-button" aria-label="Vorschauzoom zurücksetzen" onClick={() => update(start)}><Scan size={18} /></button></div>
    <span className="zoom-hint">Zoom nur zur Kontrolle · voller Bildausschnitt wird gespeichert</span>
  </div>;
}
