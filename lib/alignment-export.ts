export type Crop={x:number;y:number;w:number;h:number};
export const FULL_CROP:Crop={x:0,y:0,w:1,h:1};
export function cropBounds(width:number,height:number,crop:Crop){
 const x=Math.max(0,Math.min(width-1,Math.round(crop.x*width))),y=Math.max(0,Math.min(height-1,Math.round(crop.y*height)));
 return {x,y,width:Math.max(1,Math.min(width-x,Math.round(crop.w*width))),height:Math.max(1,Math.min(height-y,Math.round(crop.h*height)))};
}
export function cropCanvas(source:HTMLCanvasElement,crop:Crop,maxEdge=Infinity){
 const bounds=cropBounds(source.width,source.height,crop),scale=Math.min(1,maxEdge/Math.max(bounds.width,bounds.height));
 const c=document.createElement('canvas');c.width=Math.max(2,Math.round(bounds.width*scale));c.height=Math.max(2,Math.round(bounds.height*scale));
 const ctx=c.getContext('2d')!;ctx.fillStyle='#101510';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,bounds.x,bounds.y,bounds.width,bounds.height,0,0,c.width,c.height);return c;
}
export function transition(progress:number,returnToOld:boolean){
 const phase=returnToOld?(progress<.5?progress*2:(1-progress)*2):progress;
 const t=Math.max(0,Math.min(1,(phase-.12)/.76));return t*t*(3-2*t);
}
export async function transitionVideo(a:HTMLCanvasElement,b:HTMLCanvasElement,seconds:number,bounce:boolean,signal:AbortSignal,onProgress:(percent:number)=>void):Promise<Blob>{
 if(typeof MediaRecorder==='undefined')throw Error('Dieser Android WebView unterstützt keinen Videoexport. GIF ist weiterhin verfügbar.');
 const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
 if(!mime)throw Error('Kein Videoformat verfügbar. Bitte nutze GIF.');
 const canvas=document.createElement('canvas');canvas.width=Math.max(2,a.width-a.width%2);canvas.height=Math.max(2,a.height-a.height%2);const ctx=canvas.getContext('2d')!;
 ctx.drawImage(a,0,0,canvas.width,canvas.height);const stream=canvas.captureStream(30),parts:Blob[]=[];
 return new Promise((resolve,reject)=>{
  let recorder:MediaRecorder,frame=0,start=0,settled=false,finishTimer:ReturnType<typeof setTimeout>|undefined;
  const watchdog=setTimeout(()=>fail(Error('Videoexport hat zu lange gedauert. Bitte erneut versuchen oder GIF wählen.')),(seconds+15)*1000);
  function cleanup(){clearTimeout(watchdog);cancelAnimationFrame(frame);if(finishTimer)clearTimeout(finishTimer);stream.getTracks().forEach(track=>track.stop());signal.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('zeitblick-pause',abort);}
  function fail(error:Error){if(settled)return;settled=true;cleanup();try{if(recorder?.state!=='inactive')recorder.stop();}catch{}reject(error);}
  function abort(){fail(new DOMException('Videoexport abgebrochen. Bitte während des Exports in der App bleiben.','AbortError'));}
  function hidden(){if(document.hidden)abort();}
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3500000});}catch{cleanup();reject(Error('Videoaufnahme konnte nicht vorbereitet werden. Bitte GIF verwenden.'));return;}
  recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
  recorder.onerror=()=>fail(Error('Video konnte nicht codiert werden.'));
  recorder.onstop=()=>{if(settled)return;settled=true;cleanup();const blob=new Blob(parts,{type:recorder.mimeType.split(';')[0]});if(blob.size)resolve(blob);else reject(Error('Das Video ist leer. Bitte erneut versuchen.'));};
  signal.addEventListener('abort',abort,{once:true});document.addEventListener('visibilitychange',hidden);window.addEventListener('zeitblick-pause',abort);
  if(signal.aborted){abort();return;}
  function draw(now:number){if(settled)return;if(!start)start=now;const p=Math.min(1,(now-start)/(seconds*1000));ctx.globalAlpha=1;ctx.drawImage(a,0,0,canvas.width,canvas.height);ctx.globalAlpha=transition(p,bounce);ctx.drawImage(b,0,0,canvas.width,canvas.height);ctx.globalAlpha=1;onProgress(Math.round(p*100));
   if(p<1)frame=requestAnimationFrame(draw);else finishTimer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},100);
  }
  try{recorder.start(250);frame=requestAnimationFrame(draw);}catch{fail(Error('Videoaufnahme konnte nicht gestartet werden. Bitte GIF verwenden.'));}
 });
}
