export type VideoPose={x:number;y:number;scale:number;angle:number};
export const DEFAULT_VIDEO_POSE:VideoPose={x:0,y:0,scale:1,angle:0};
export function fitMedia(sourceWidth:number,sourceHeight:number,width:number,height:number){const s=Math.min(width/sourceWidth,height/sourceHeight);return{x:(width-sourceWidth*s)/2,y:(height-sourceHeight*s)/2,width:sourceWidth*s,height:sourceHeight*s};}
export function paintVideo(ctx:CanvasRenderingContext2D,source:HTMLVideoElement|HTMLImageElement|null,x:number,y:number,width:number,height:number,alpha=1,pose=DEFAULT_VIDEO_POSE){
 if(!source)return;const sw=source instanceof HTMLVideoElement?source.videoWidth:source.naturalWidth,sh=source instanceof HTMLVideoElement?source.videoHeight:source.naturalHeight;if(!sw||!sh)return;
 if(source instanceof HTMLVideoElement&&source.readyState<2)return;
 const fit=fitMedia(sw,sh,width,height);ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();ctx.globalAlpha=alpha;ctx.translate(x+width/2+pose.x*width,y+height/2+pose.y*height);ctx.rotate(pose.angle*Math.PI/180);ctx.scale(pose.scale,pose.scale);ctx.drawImage(source,fit.x-width/2,fit.y-height/2,fit.width,fit.height);ctx.restore();
}
export function recordCanvas(canvas:HTMLCanvasElement,done:(blob:Blob)=>void,failed:(message:string)=>void){
 const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp8','video/webm'].find(type=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(type));
 if(!mime)throw Error('Dieser Android WebView unterstützt die Videoaufnahme nicht. Bitte Android System WebView aktualisieren.');
 const stream=canvas.captureStream(30);let recorder:MediaRecorder;
 try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3000000});}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
 let bytes=0,cancelled=false,finished=false;const chunks:Blob[]=[];
 const timer=setTimeout(stop,60000);let watchdog:ReturnType<typeof setTimeout>|undefined;
 function cleanup(){clearTimeout(timer);if(watchdog)clearTimeout(watchdog);stream.getTracks().forEach(t=>t.stop());}
 function stop(){if(recorder.state!=='inactive'){recorder.stop();watchdog=setTimeout(()=>{if(finished)return;finished=true;cleanup();if(!cancelled)failed('Video konnte nicht abgeschlossen werden. Bitte kürzer aufnehmen.');},10000);}}
 recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>=45000000)stop();}};
 recorder.onerror=()=>{if(finished)return;finished=true;cancelled=true;cleanup();try{stop();}catch{}failed('Die Videoaufnahme ist fehlgeschlagen.');};
 recorder.onstop=()=>{if(finished)return;finished=true;cleanup();if(cancelled)return;const blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});if(blob.size>100&&blob.size<=55000000)done(blob);else failed('Aufnahme zu kurz oder zu groß. Bitte erneut versuchen.');};
 try{recorder.start(500);}catch(e){cleanup();throw e;}
 return {stop,cancel(){cancelled=true;stop();cleanup();}};
}

export function waitForVideoFrame(video:HTMLVideoElement){
 return new Promise<void>((resolve,reject)=>{
  let frame=0;const timer=setTimeout(()=>{if(frame&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(frame);reject(Error('Das Video liefert noch kein Bild. Bitte erneut starten.'));},4000);
  const ready=()=>{clearTimeout(timer);resolve();};
  if(video.requestVideoFrameCallback)frame=video.requestVideoFrameCallback(ready);else if(video.readyState>=2)requestAnimationFrame(ready);else{clearTimeout(timer);reject(Error('Video noch nicht bereit.'));}
 });
}
