import {createRoot} from 'react-dom/client';
import {VideoWorkspace} from '../components/video-workspace';
import {recordCanvas} from '../lib/video-tools';
import '../app/globals.css';
if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=> 'test-'+Date.now()+'-'+Math.random()});
function synthetic(color:string){const c=document.createElement('canvas');c.width=320;c.height=480;const ctx=c.getContext('2d')!;let tick=0;const draw=()=>{ctx.fillStyle=color;ctx.fillRect(0,0,320,480);ctx.fillStyle='white';ctx.fillRect(10+(tick++%100),20,30,30);};draw();return{c,draw};}
async function clip(color:string){return new Promise<File>((resolve,reject)=>{const {c,draw}=synthetic(color),timer=setInterval(draw,33);const r=recordCanvas(c,blob=>{clearInterval(timer);resolve(new File([blob],'test.mp4',{type:blob.type}));},reject);setTimeout(()=>r.stop(),2500);});}
async function main(){
 const clips=await Promise.all([clip('#2060cc'),clip('#c05020')]);let picks=0;
 if(!navigator.mediaDevices)Object.defineProperty(navigator,'mediaDevices',{value:{}});
 Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const {c,draw}=synthetic('#209050'),stream=c.captureStream(30),timer=setInterval(()=>{if(stream.getTracks()[0].readyState==='ended')clearInterval(timer);else draw();},33);return stream;}});
 const original=HTMLInputElement.prototype.click;
 HTMLInputElement.prototype.click=function(){if(this.type!=='file'){original.call(this);return;}const transfer=new DataTransfer();transfer.items.add(clips[(picks++)%2]);this.files=transfer.files;this.dispatchEvent(new Event('change',{bubbles:true}));};
 Object.assign(window,{ZeitblickAndroid:{saveMedia:async(payload:string)=>{const data=JSON.parse(payload),file=data.images[0],bytes=Uint8Array.from(atob(file.data),(c:string)=>c.charCodeAt(0)),blob=new Blob([bytes],{type:file.mime}),url=URL.createObjectURL(blob),video=document.createElement('video');video.muted=true;video.src=url;await new Promise<void>((resolve,reject)=>{video.onloadeddata=()=>resolve();video.onerror=()=>reject(Error('Invalid encoded video'));});await video.play();await new Promise<void>(resolve=>{video.onseeked=()=>resolve();video.currentTime=Math.min(.3,video.duration/2);});video.pause();const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;const ctx=c.getContext('2d')!;ctx.drawImage(video,0,0);const pixel=Array.from(ctx.getImageData(c.width/2,c.height/2,1,1).data);parent.postMessage({test:'video',mime:file.mime,width:c.width,height:c.height,duration:video.duration,bytes:bytes.length,pixel,left:Array.from(ctx.getImageData(c.width/4,c.height/2,1,1).data),right:Array.from(ctx.getImageData(c.width*3/4,c.height/2,1,1).data)},location.origin);URL.revokeObjectURL(url);window.dispatchEvent(new CustomEvent('zeitblick-save-result',{detail:{id:data.id,success:true}}));}}});
 createRoot(document.getElementById('root')!).render(<VideoWorkspace onBack={()=>{}}/>);
}
void main();
