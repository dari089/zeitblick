export function alignmentJob<T>(payload:unknown,signal?:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./alignment-worker.ts',import.meta.url));
  const timeout=setTimeout(()=>{cleanup();reject(Error('Die Berechnung dauert zu lange. Versuche kleinere Bilder oder manuelle Punkte.'));},90000);
  const cancel=()=>{cleanup();reject(new DOMException('Abgebrochen','AbortError'));};
  function cleanup(){clearTimeout(timeout);worker.terminate();signal?.removeEventListener('abort',cancel);}
  worker.onmessage=e=>{cleanup();if(e.data.ok)resolve(e.data.result as T);else reject(Error(e.data.error));};
  worker.onerror=()=>{cleanup();reject(Error('Die Offline-Bildverarbeitung konnte nicht gestartet werden.'));};
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted){cancel();return;}
  worker.postMessage(payload);
 });
}
