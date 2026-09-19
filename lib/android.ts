type AndroidBridge = { savePhotos: (payload: string) => void };
export function androidBridge(): AndroidBridge | undefined {
  return typeof window !== 'undefined' ? (window as Window & { ZeitblickAndroid?: AndroidBridge }).ZeitblickAndroid : undefined;
}
async function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Foto konnte nicht gelesen werden')); reader.readAsDataURL(blob); });
}
export async function saveToAndroid(files: File[]): Promise<void> {
  const bridge = androidBridge(); if (!bridge) throw new Error('Android-Speichern nicht verfügbar');
  const id = crypto.randomUUID();
  const images = await Promise.all(files.map(async file => ({ name: file.name, data: await base64(file) })));
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { window.removeEventListener('zeitblick-save-result', result); reject(new Error('Speichern dauert zu lange. Bitte prüfe deine Galerie, bevor du es erneut versuchst.')); }, 60000);
    function result(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (detail?.id !== id) return;
      window.clearTimeout(timeout); window.removeEventListener('zeitblick-save-result', result);
      if (detail.success) resolve(); else reject(new Error(detail.error || 'Speichern fehlgeschlagen'));
    }
    window.addEventListener('zeitblick-save-result', result);
    try { bridge.savePhotos(JSON.stringify({ id, images })); }
    catch (error) { window.clearTimeout(timeout); window.removeEventListener('zeitblick-save-result', result); reject(error); }
  });
}
