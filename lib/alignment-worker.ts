import {encodeTransitionGif} from './transition-gif';
import {warp,validateHomography,type Pixels,type Pair} from './alignment';
const scope=globalThis as unknown as {cv:any;importScripts:(url:string)=>void;onmessage:(e:MessageEvent)=>void;postMessage:(value:unknown,transfer?:Transferable[])=>void};
async function automatic(a:Pixels,b:Pixels,regional=false){
 const minimum=regional?8:12;
 scope.importScripts('/alignment/opencv.js');
 const cv=scope.cv;
 if(!cv.Mat)await new Promise<void>((resolve,reject)=>{cv.onRuntimeInitialized=()=>resolve();cv.onAbort=()=>reject(Error('Offline-Bildanalyse konnte nicht geladen werden.'));});
 const allocated:any[]=[];const own=(x:any)=>{allocated.push(x);return x;};
 try{
  const ma=own(cv.matFromImageData(a)),mb=own(cv.matFromImageData(b)),ga=own(new cv.Mat()),gb=own(new cv.Mat());
  cv.cvtColor(ma,ga,cv.COLOR_RGBA2GRAY);cv.cvtColor(mb,gb,cv.COLOR_RGBA2GRAY);
  const detector=own(new cv.AKAZE()),ka=own(new cv.KeyPointVector()),kb=own(new cv.KeyPointVector()),da=own(new cv.Mat()),db=own(new cv.Mat()),mask=own(new cv.Mat());
  detector.detectAndCompute(ga,mask,ka,da);detector.detectAndCompute(gb,mask,kb,db);
  if(da.rows<minimum||db.rows<minimum)throw Error('Zu wenige klare Bilddetails. Bitte gemeinsame Punkte manuell setzen.');
  const matcher=own(new cv.BFMatcher(cv.NORM_HAMMING,false)),matches=own(new cv.DMatchVectorVector()),reverse=own(new cv.DMatchVectorVector());
  matcher.knnMatch(da,db,matches,2);matcher.knnMatch(db,da,reverse,2);
  const back=new Map<number,number>();
  for(let i=0;i<reverse.size();i++){const row=reverse.get(i);try{if(row.size()>=2){const m=row.get(0),n=row.get(1);if(m.distance<.78*n.distance)back.set(m.queryIdx,m.trainIdx);}}finally{row.delete();}}
  const correspondences:Pair[]=[];
  for(let i=0;i<matches.size();i++){const row=matches.get(i);try{if(row.size()>=2){
   const m=row.get(0),n=row.get(1);
   if(m.distance<.78*n.distance&&back.get(m.trainIdx)===m.queryIdx){const p=ka.get(m.queryIdx).pt,q=kb.get(m.trainIdx).pt;correspondences.push({a:{x:p.x,y:p.y},b:{x:q.x,y:q.y}});}
  }}finally{row.delete();}}
  if(correspondences.length<minimum)throw Error('Keine sichere automatische Zuordnung. Setze vier oder mehr gemeinsame Gebäudepunkte.');
  const src=own(cv.matFromArray(correspondences.length,1,cv.CV_32FC2,correspondences.flatMap(p=>[p.a.x,p.a.y])));
  const dst=own(cv.matFromArray(correspondences.length,1,cv.CV_32FC2,correspondences.flatMap(p=>[p.b.x,p.b.y])));
  const inlierMask=own(new cv.Mat()),mat=own(cv.findHomography(src,dst,cv.RANSAC,3,inlierMask,2500,.995));
  if(mat.empty())throw Error('Keine stabile Perspektive gefunden. Bitte Punkte manuell setzen.');
  const inliers=correspondences.filter((_,i)=>inlierMask.data[i]).map(p=>({a:{x:p.a.x/(a.width-1),y:p.a.y/(a.height-1)},b:{x:p.b.x/(b.width-1),y:p.b.y/(b.height-1)}}));
  const coverage=(key:'a'|'b')=>{const xs=inliers.map(p=>p[key].x),ys=inliers.map(p=>p[key].y);return (Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys));};
  if(inliers.length<minimum||inliers.length/correspondences.length<.4||coverage('a')<(regional?.02:.07)||coverage('b')<(regional?.02:.07))throw Error('Die Treffer sind zu unsicher oder liegen zu eng zusammen. Bitte manuell ausrichten.');
  const m=Array.from(mat.data64F) as number[],aw=a.width-1,ah=a.height-1,bw=b.width-1,bh=b.height-1;
  const h=[m[0]*aw/bw,m[1]*ah/bw,m[2]/bw,m[3]*aw/bh,m[4]*ah/bh,m[5]/bh,m[6]*aw,m[7]*ah,m[8]].map(v=>v/m[8]);if(!regional)validateHomography(h);
  // Distribute editable anchors across the facade instead of returning a cluster.
  const selected=[inliers[0]],remaining=inliers.slice(1);
  while(selected.length<16&&remaining.length){let best=0,score=-1;remaining.forEach((p,i)=>{const d=Math.min(...selected.map(q=>(p.a.x-q.a.x)**2+(p.a.y-q.a.y)**2));if(d>score){score=d;best=i;}});selected.push(remaining.splice(best,1)[0]);}
  return {h,pairs:selected,matches:inliers.length,total:correspondences.length};
 }finally{allocated.reverse().forEach(x=>x.delete());}
}
scope.onmessage=async e=>{
 try{
  const job=e.data;
  if(job.kind==='gif'){const result=encodeTransitionGif(job.a,job.b,job.seconds,job.bounce);scope.postMessage({ok:true,result},[result.buffer]);}
  else if(job.kind==='auto'){scope.postMessage({ok:true,result:await automatic(job.a,job.b,job.regional===true)});}
  else{const result=warp(job.source,job.width,job.height,job.h,job.pairs,job.local);scope.postMessage({ok:true,result},[result.data.buffer]);}
 }catch(error){scope.postMessage({ok:false,error:error instanceof Error?error.message:'Die Bildberechnung ist fehlgeschlagen. Bitte manuell ausrichten.'});}
};
