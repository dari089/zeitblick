type AndroidBridge = { saveMedia?: (payload: string) => void; startCamera?: (lens: string, quality: string, id: string) => void; stopCamera?: () => void; capturePhoto?: (id: string) => void; setExposure?: (value: number) => void; setPreviewBounds?: (x: number, y: number, width: number, height: number, density: number) => void; savePhotos: (payload: string) => void; pickReference?: (requestId: string) => void; releaseReference?: (url: string) => void };
export function androidBridge(): AndroidBridge | undefined {
  return typeof window !== 'undefined' ? (window as Window & { ZeitblickAndroid?: AndroidBridge }).ZeitblickAndroid : undefined;
}
async function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Foto konnte nicht gelesen werden')); reader.readAsDataURL(blob); });
}
export async function saveToAndroid(files: File[]): Promise<void> {
  const bridge = androidBridge(); if (!bridge) throw new Error('Android-Speichern nicht verfügbar');
  const id = crypto.randomUUID();
  const images = await Promise.all(files.map(async file => ({ name: file.name, mime: file.type, data: await base64(file) })));
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { window.removeEventListener('zeitblick-save-result', result); reject(new Error('Speichern dauert zu lange. Bitte prüfe deine Galerie, bevor du es erneut versuchst.')); }, 60000);
    function result(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (detail?.id !== id) return;
      window.clearTimeout(timeout); window.removeEventListener('zeitblick-save-result', result);
      if (detail.success) resolve(); else reject(new Error(detail.error || 'Speichern fehlgeschlagen'));
    }
    window.addEventListener('zeitblick-save-result', result);
    try { const payload=JSON.stringify({id,images}); if(files.some(file=>file.type!=='image/jpeg')){if(!bridge.saveMedia)throw Error('Bitte die aktuelle APK für GIF- und Videoexport installieren.');bridge.saveMedia(payload);}else bridge.savePhotos(payload); }
    catch (error) { window.clearTimeout(timeout); window.removeEventListener('zeitblick-save-result', result); reject(error); }
  });
}

export type NativeLens = { id: string; label: string; facing: 'environment' | 'user' };
export type NativeCamera = { requestId: string; id: string; width: number; height: number; facing: 'environment' | 'user'; exposureMin: number; exposureMax: number; exposureStep: number };
function nativeRequest<T>(eventName: string, invoke: (id: string) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('Die Kamera antwortet nicht. Bitte erneut versuchen.')); }, 45000);
    function cleanup() { clearTimeout(timer); window.removeEventListener(eventName, result); }
    function result(event: Event) { const value = (event as CustomEvent).detail; if (value?.requestId !== id) return; cleanup(); if(value.error) reject(new Error(value.error)); else resolve(value); }
    window.addEventListener(eventName, result);
    try { invoke(id); } catch(error) { cleanup(); reject(error); }
  });
}
export function openNativeCamera(lens: string, quality: string) { return nativeRequest<NativeCamera>('zeitblick-camera-result', id => androidBridge()!.startCamera!(lens, quality, id)); }
export function captureNativePhoto() { return nativeRequest<{url: string}>('zeitblick-photo-result', id => androidBridge()!.capturePhoto!(id)); }
