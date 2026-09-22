export type Transform = { x: number; y: number; scale: number; rotation: number };

/** Same centered cover crop as object-fit: cover in the viewfinder. */
export function coverCrop(sourceWidth: number, sourceHeight: number, targetRatio: number) {
  if (![sourceWidth, sourceHeight, targetRatio].every(value => Number.isFinite(value) && value > 0)) throw new Error("Invalid frame dimensions");
  const width = Math.max(1, Math.floor(Math.min(sourceWidth, sourceHeight * targetRatio)));
  const height = Math.max(1, Math.floor(Math.min(sourceHeight, sourceWidth / targetRatio)));
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height };
}

/** Coordinates scale identically between the CSS preview and full-resolution canvas. */
export function overlayPlacement(width: number, height: number, imageWidth: number, imageHeight: number, transform: Transform) {
  const fit = Math.min(width / imageWidth, height / imageHeight) * transform.scale;
  return { centerX: width * (0.5 + transform.x), centerY: height * (0.5 + transform.y), width: imageWidth * fit, height: imageHeight * fit };
}

/** Render only camera pixels, with an explicit opt-in for the reference layer. */
export function composePhoto(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  crop: ReturnType<typeof coverCrop>,
  reference: { image: CanvasImageSource; width: number; height: number } | null,
  includeOverlay: boolean,
  opacity: number,
  transform: Transform,
) {
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  if (!includeOverlay || !reference || opacity === 0) return;
  paintOverlay(ctx, crop.width, crop.height, reference, opacity, transform);
}

export function paintOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, reference: { image: CanvasImageSource; width: number; height: number }, opacity: number, transform: Transform) {
  const layer = overlayPlacement(width, height, reference.width, reference.height, transform);
  ctx.save();
  ctx.translate(layer.centerX, layer.centerY);
  ctx.rotate(transform.rotation * Math.PI / 180);
  ctx.globalAlpha = Math.max(0, Math.min(100, opacity)) / 100;
  ctx.drawImage(reference.image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.restore();
}
