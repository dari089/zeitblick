import {createRoot} from 'react-dom/client';
import {AlignmentEditor} from '../components/alignment-editor';
import {saveDraft} from '../lib/alignment-store';
import {warp,IDENTITY,project} from '../lib/alignment';
import {canvasBlob} from '../lib/photo-types';
import '../app/globals.css';
if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=> 'test-'+Date.now()+'-'+Math.random()});
async function save(payload:string){
 const value=JSON.parse(payload),checks=[];
 for(const file of value.images){
  const bytes=Uint8Array.from(atob(file.data),(c:string)=>c.charCodeAt(0)),mime=file.mime||'image/jpeg',blob=new Blob([bytes],{type:mime});
  const check:{name:string;mime:string;bytes:number;width?:number;height?:number;duration?:number;magic:string}={name:file.name,mime,bytes:bytes.length,magic:Array.from(bytes.slice(0,12)).join(',')};
  if(mime.startsWith('image/')){const bitmap=await createImageBitmap(blob);check.width=bitmap.width;check.height=bitmap.height;bitmap.close();}
  else{const video=document.createElement('video'),url=URL.createObjectURL(blob);video.src=url;await new Promise<void>((resolve,reject)=>{video.onloadedmetadata=()=>resolve();video.onerror=()=>reject(Error('Video invalid'));});check.width=video.videoWidth;check.height=video.videoHeight;check.duration=video.duration;URL.revokeObjectURL(url);}
  checks.push(check);
 }
 parent.postMessage({test:'export',checks},location.origin);
 window.dispatchEvent(new CustomEvent('zeitblick-save-result',{detail:{id:value.id,success:true}}));
}
Object.assign(window,{ZeitblickAndroid:{savePhotos:save,saveMedia:save}});

async function main(){
 const a=document.createElement('canvas');a.width=900;a.height=700;const ctx=a.getContext('2d')!;
 ctx.fillStyle='#b4af9f';ctx.fillRect(0,0,900,700);
 let seed=8147;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<500;i++){ctx.fillStyle=['#182b29','#e5dcc9','#804b39','#4e6655','#c19759'][i%5];const x=rand()*850,y=rand()*660;ctx.fillRect(x,y,8+rand()*35,8+rand()*25);ctx.strokeStyle='#24251e';ctx.strokeRect(x,y,12+rand()*35,12+rand()*25);}
 ctx.font='bold 35px serif';ctx.fillStyle='#19211b';ctx.fillText('ZEITBLICK • ALTE FASSADE',90,330);
 const transformed=warp(ctx.getImageData(0,0,900,700),900,700,[.92,.07,.02,-.04,.91,.06,.05,-.03,1],[],false);
 const b=document.createElement('canvas');b.width=900;b.height=700;b.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(transformed.data),900,700),0,0);
 await saveDraft({version:1,a:await canvasBlob(a),b:await canvasBlob(b),names:['Historische Testfassade','Aktuelle Testfassade'],pairs:new URLSearchParams(location.search).has('seed-points')?[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}].map(b=>({a:project([.92,.07,.02,-.04,.91,.06,.05,-.03,1],b),b,source:'manual' as const})):[],h:IDENTITY,local:false});
 createRoot(document.getElementById('root')!).render(<AlignmentEditor onBack={()=>parent.postMessage({test:'back'},location.origin)}/>);
}
void main();
