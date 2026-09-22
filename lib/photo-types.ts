export type SaveMode = "clean" | "overlay" | "both";
export type PhotoCapture = {
  id: string;
  raw: HTMLCanvasElement;
  layer: HTMLCanvasElement | null;
  url: string;
  blob: Blob;
  width: number;
  height: number;
  opacity: number;
  filename: string;
};

export function canvasBlob(canvas: HTMLCanvasElement, type = "image/jpeg"): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Foto konnte nicht erstellt werden")), type, 0.96));
}
