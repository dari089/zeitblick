"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ImagePlus,LoaderCircle,RotateCcw,Sparkles,Trash2} from 'lucide-react';
import {androidBridge,saveToAndroid} from '@/lib/android';
import {alignmentJob} from '@/lib/alignment-jobs';
import {homography,IDENTITY,type Pair,type Point,type Matrix,type Pixels} from '@/lib/alignment';
import {loadDraft,saveDraft} from '@/lib/alignment-store';
import {AlignmentCrop} from './alignment-crop';
import {FULL_CROP,cropCanvas,cropBounds,transitionVideo,type Crop} from '@/lib/alignment-export';
import {AlignmentImage,type EditorImage} from './alignment-image';
import {canvasBlob} from '@/lib/photo-types';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {toast,Toaster} from 'sonner';
type State={pairs:Pair[];base:Matrix;local:boolean};
const initial=():State=>({pairs:[],base:[...IDENTITY],local:false});
function pixels(canvas:HTMLCanvasElement,max=1100):Pixels{
 const scale=Math.min(1,max/Math.max(canvas.width,canvas.height)),c=document.createElement('canvas');c.width=Math.max(2,Math.round(canvas.width*scale));c.height=Math.max(2,Math.round(canvas.height*scale));const ctx=c.getContext('2d')!;ctx.drawImage(canvas,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height);
}
async function decode(url:string,name:string):Promise<EditorImage>{
 const img=new Image();img.src=url;await img.decode();
 const scale=Math.min(1,3072/Math.max(img.naturalWidth,img.naturalHeight),Math.sqrt(6000000/(img.naturalWidth*img.naturalHeight)));
 const canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.floor(img.naturalWidth*scale));canvas.height=Math.max(2,Math.floor(img.naturalHeight*scale));canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
 const blob=await canvasBlob(canvas);return{canvas,blob,url:URL.createObjectURL(blob),name};
}
function canvasFrom(p:Pixels){const canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data),p.width,p.height),0,0);return canvas;}
function PreviewCanvas({canvas,opacity=1}:{canvas:HTMLCanvasElement;opacity?:number}){const host=useRef<HTMLDivElement>(null);useEffect(()=>{const el=host.current!;el.appendChild(canvas);return()=>{if(canvas.parentNode===el)el.removeChild(canvas);};},[canvas]);return <div className="align-preview-layer" ref={host} style={{opacity}}/>;}
export function AlignmentEditor({onBack}:{onBack:()=>void}){
 const [outputOpen,setOutputOpen]=useState(false),[sideBySide,setSideBySide]=useState(false),[appliedKey,setAppliedKey]=useState(''),[renderVersion,setRenderVersion]=useState(0);
 const [a,setA]=useState<EditorImage|null>(null),[b,setB]=useState<EditorImage|null>(null);
 const [state,setState]=useState<State>(initial),[undo,setUndo]=useState<State[]>([]);
 const [activeSide,setActiveSide]=useState<'a'|'b'>('a'),[pointTool,setPointTool]=useState<'browse'|'add'|'edit'|'region'>('browse');
 const [regions,setRegions]=useState<{a:Crop;b:Crop}>({a:{x:.15,y:.15,w:.7,h:.7},b:{x:.15,y:.15,w:.7,h:.7}});
 const [selected,setSelected]=useState<number|null>(null),[pending,setPending]=useState<Point|null>(null);
 const [crop,setCrop]=useState<Crop>({...FULL_CROP}),[cropping,setCropping]=useState(false),[exportKind,setExportKind]=useState<'blend'|'current'|'gif'|'video'>('blend'),[seconds,setSeconds]=useState(4),[bounce,setBounce]=useState(false);
 const [tab,setTab]=useState<'points'|'preview'>('points'),[compare,setCompare]=useState<'fade'|'wipe'>('fade'),[opacity,setOpacity]=useState(50);
 const [warped,setWarped]=useState<HTMLCanvasElement|null>(null),[rendering,setRendering]=useState(false),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState('');
 const [hydrated,setHydrated]=useState(false);
 const file=useRef<HTMLInputElement>(null),pick=useRef<{side:'a'|'b';id:string}|null>(null),job=useRef<AbortController|null>(null),live=useRef(true),request=useRef(0),draftQueue=useRef(Promise.resolve());
 const stateRef=useRef(state);stateRef.current=state;
 const geometry=useMemo(()=>{if(state.pairs.length<4)return{h:IDENTITY,error:''};try{return{h:state.local?state.base:homography(state.pairs),error:''};}catch(e){return{h:IDENTITY,error:(e as Error).message};}},[state]);
 const stateKey=JSON.stringify(state),dirty=stateKey!==appliedKey;
 const ready=Boolean(a&&b&&state.pairs.length>=4&&!geometry.error);
 useEffect(()=>()=>{live.current=false;job.current?.abort();},[]);
 useEffect(()=>()=>{if(a)URL.revokeObjectURL(a.url);},[a]);useEffect(()=>()=>{if(b)URL.revokeObjectURL(b.url);},[b]);
 useEffect(()=>{
  let active=true;
  void loadDraft().then(async d=>{
   if(!d||d.version!==1)return;
   const ua=URL.createObjectURL(d.a),ub=URL.createObjectURL(d.b);
   try{const [ia,ib]=await Promise.all([decode(ua,d.names[0]),decode(ub,d.names[1])]);if(active){setA(ia);setB(ib);setState({pairs:d.pairs,base:d.h,local:d.local});setCrop(d.crop||{...FULL_CROP});setOpacity(d.opacity??50);setSaved('Letzten Entwurf geladen');}else{URL.revokeObjectURL(ia.url);URL.revokeObjectURL(ib.url);}}
   finally{URL.revokeObjectURL(ua);URL.revokeObjectURL(ub);}
  }).catch(()=>{if(active)setSaved('Lokaler Entwurf konnte nicht geladen werden.');}).finally(()=>{if(active)setHydrated(true);});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  if(!hydrated||!a||!b)return;
  setSaved('Entwurf wird gesichert …');
  const timer=setTimeout(()=>{
   const draft={version:1 as const,crop,opacity,a:a.blob,b:b.blob,names:[a.name,b.name] as [string,string],pairs:state.pairs,h:state.base,local:state.local};
   draftQueue.current=draftQueue.current.catch(()=>{}).then(()=>saveDraft(draft)).then(()=>{if(live.current)setSaved('Entwurf lokal gesichert');},()=>{if(live.current)setSaved('Entwurf nicht gesichert – Gerätespeicher prüfen.');});
  },400);return()=>clearTimeout(timer);
 },[a,b,state,hydrated,crop,opacity]);
 useEffect(()=>{
  setError('');setWarped(null);
  if(!ready||dirty||!a||!b){setRendering(false);return;}
  const controller=new AbortController();setRendering(true);
  const timer=setTimeout(()=>{const target=pixels(a.canvas,1100);void alignmentJob<Pixels>({kind:'warp',source:pixels(b.canvas,1600),width:target.width,height:target.height,h:geometry.h,pairs:state.pairs,local:state.local},controller.signal).then(result=>{if(!controller.signal.aborted)setWarped(canvasFrom(result));}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setRendering(false);});},180);
  return()=>{clearTimeout(timer);controller.abort();};
 },[a,b,ready,geometry,state,dirty,renderVersion]);
 function checkpoint(){setUndo(h=>[...h.slice(-29),structuredClone(stateRef.current)]);}
 function change(next:State){checkpoint();setState(next);setMessage('Punkte geändert · Zum Übernehmen auf Ausrichten tippen.');}
 function applyAlignment(){
  if(!ready){toast.error(geometry.error||'Mindestens vier verteilte Punktpaare benötigt.');return;}
  setPointTool('browse');setPending(null);setError('');setAppliedKey(stateKey);setRenderVersion(v=>v+1);setTab('preview');
  const manual=state.pairs.filter(p=>p.source==='manual').length;
  const feedback=state.pairs.length+' Punktpaare angewendet'+(manual?' · davon '+manual+' manuell':'')+'.';
  setMessage(feedback);toast.success(feedback);
 }
 function selectPoint(i:number){if(busy||i>=state.pairs.length)return;checkpoint();setSelected(i);setPending(null);setPointTool('edit');toast.info('Paar '+(i+1)+' ausgewählt. Markierten Punkt ziehen oder neue Stelle antippen.');}
 function clearPoints(){change(initial());setSelected(null);setPending(null);setPointTool('browse');setAppliedKey('');setTab('points');setMessage('Alle Punkte entfernt. Rückgängig ist möglich.');toast.success('Alle Punkte entfernt.');}

 async function importImage(url:string,name:string,side:'a'|'b',id:number){
  setBusy('Bild wird vorbereitet …');
  try{const image=await decode(url,name);if(!live.current||id!==request.current){URL.revokeObjectURL(image.url);return;}
   if(side==='a')setA(image);else setB(image);setState(initial());setAppliedKey('');setCrop({...FULL_CROP});setCropping(false);setUndo([]);setPending(null);setSelected(null);setMessage('');setTab('points');setPointTool('browse');setActiveSide('a');
  }catch{if(live.current)toast.error('Das Bild konnte nicht geöffnet werden.');}
  finally{if(live.current&&id===request.current)setBusy('');}
 }
 useEffect(()=>{
  const result=(event:Event)=>{
   const d=(event as CustomEvent).detail;if(!String(d?.requestId).startsWith('align-'))return;
   const target=pick.current;
   if(!target||target.id!==d.requestId){if(d?.url)androidBridge()?.releaseReference?.(d.url);return;}
   pick.current=null;
   if(d.cancelled||d.error){setBusy('');if(d.error)toast.error(d.error);return;}
   if(typeof d.url!=='string'||!d.url.startsWith('https://appassets.androidplatform.net/reference/')){setBusy('');return;}
   void importImage(d.url,d.name||'Foto',target.side,++request.current).finally(()=>androidBridge()?.releaseReference?.(d.url));
  };
  window.addEventListener('zeitblick-reference-result',result);return()=>window.removeEventListener('zeitblick-reference-result',result);
 },[]);
 function choose(side:'a'|'b'){
  const id='align-'+crypto.randomUUID();pick.current={side,id};
  if(androidBridge()?.pickReference){setBusy('Bild auswählen …');androidBridge()!.pickReference!(id);}else file.current?.click();
 }
 function add(side:'a'|'b',p:Point){
  if(busy)return;
  if(pointTool==='edit'&&selected!==null&&state.pairs[selected]){const pairs=state.pairs.map((q,i)=>i===selected?{...q,[side]:p,source:'manual' as const}:q);change({...state,pairs});return;}
  if(pointTool!=='add')return;
  if(side==='a'){setPending(p);setActiveSide('b');return;}
  if(!pending){setMessage('Tippe zuerst den Punkt im historischen Bild an.');return;}
  if(state.pairs.length>=64){toast.info('Maximal 64 Punktpaare. Verschiebe vorhandene Punkte oder lösche ein Paar.');return;}
  if(state.pairs.some(q=>Math.hypot(q.a.x-pending.x,q.a.y-pending.y)<.008||Math.hypot(q.b.x-p.x,q.b.y-p.y)<.008)){toast.info('Dieser Punkt liegt zu nah an einem vorhandenen Punkt.');return;}
  change({...state,pairs:[...state.pairs,{a:pending,b:p,source:'manual'}]});setPending(null);setActiveSide('a');
 }
 function move(side:'a'|'b',i:number,p:Point){if(busy||pointTool!=='edit')return;if(i>=state.pairs.length){if(side==='a')setPending(p);return;}setState(s=>({...s,pairs:s.pairs.map((q,j)=>i===j?{...q,[side]:p,source:'manual' as const}:q)}));}
 async function automatic(regional=false){
  if(!a||!b)return;job.current?.abort();const controller=new AbortController();job.current=controller;setBusy('Gemeinsame Details werden gesucht …');setMessage('');setError('');
  try{
   const prepare=(image:EditorImage,region:Crop)=>{const bounds=cropBounds(image.canvas.width,image.canvas.height,region),canvas=cropCanvas(image.canvas,region,1600);return {data:pixels(canvas,1600),bounds};};
   const ra=regional?prepare(a,regions.a):null,rb=regional?prepare(b,regions.b):null;
   const result=await alignmentJob<{h:Matrix;pairs:Pair[];matches:number;total:number}>({kind:'auto',regional,a:ra?.data||pixels(a.canvas,1100),b:rb?.data||pixels(b.canvas,1100)},controller.signal);
   if(controller.signal.aborted)return;
   if(regional&&ra&&rb){
    const restore=(p:Point,bounds:ReturnType<typeof cropBounds>,image:EditorImage)=>({x:(bounds.x+p.x*(bounds.width-1))/(image.canvas.width-1),y:(bounds.y+p.y*(bounds.height-1))/(image.canvas.height-1)});
    const pairs=[...state.pairs];
    for(const pair of result.pairs){const p:Pair={a:restore(pair.a,ra.bounds,a),b:restore(pair.b,rb.bounds,b),source:'auto'};
     if(pairs.length<64&&!pairs.some(q=>Math.hypot(q.a.x-p.a.x,q.a.y-p.a.y)<.008||Math.hypot(q.b.x-p.b.x,q.b.y-p.b.y)<.008))pairs.push(p);
    }
    const added=pairs.length-state.pairs.length;
    if(!added)throw Error(state.pairs.length>=64?'64 Punktpaare erreicht. Lösche zuerst ein nicht benötigtes Paar.':'Keine zusätzlichen, ausreichend entfernten Punkte gefunden. Wähle einen anderen Bereich.');
    if(!state.local)homography(pairs);
    change({...state,pairs});setSelected(null);setPending(null);setPointTool('browse');setMessage(added+' zusätzliche Punktpaare gefunden. Jetzt Ausrichten drücken.');toast.success(added+' zusätzliche Punktpaare gefunden.');return;
   }
   const pairs=[...state.pairs];
   for(const pair of result.pairs)if(pairs.length<64&&!pairs.some(q=>Math.hypot(q.a.x-pair.a.x,q.a.y-pair.a.y)<.008||Math.hypot(q.b.x-pair.b.x,q.b.y-pair.b.y)<.008))pairs.push({...pair,source:'auto'});
   const added=pairs.length-state.pairs.length;if(!added)throw Error('Keine neuen Punkte gefunden. Die vorhandenen Punkte kannst du mit Ausrichten anwenden.');
   change({...state,pairs,base:state.pairs.length?state.base:result.h});setPointTool('browse');setSelected(null);setPending(null);setMessage(added+' automatische Punktpaare ergänzt. Jetzt Ausrichten drücken.');toast.success(added+' automatische Punktpaare ergänzt.');
  }catch(e){if(!controller.signal.aborted){setError((e as Error).message);toast.error((e as Error).message);}}
  finally{if(!controller.signal.aborted)setBusy('');}
 }
 async function exportOutput(){
  if(!a||!b||!ready||dirty)return;job.current?.abort();const controller=new AbortController();job.current=controller;setBusy('Ausschnitt wird berechnet …');
  let full:HTMLCanvasElement|null=null,old:HTMLCanvasElement|null=null,current:HTMLCanvasElement|null=null;
  try{
   const animated=exportKind==='gif'||exportKind==='video';
   const edge=exportKind==='gif'?512:exportKind==='video'?1280:3072;
   // Render at full working resolution before cropping; all output formats share the same coordinates.
   const output=await alignmentJob<Pixels>({kind:'warp',source:pixels(b.canvas,3072),width:a.canvas.width,height:a.canvas.height,h:geometry.h,pairs:state.pairs,local:state.local},controller.signal);
   if(controller.signal.aborted)return;
   full=canvasFrom(output);old=cropCanvas(a.canvas,crop,edge);current=cropCanvas(full,crop,edge);
   let blob:Blob,extension='jpg';
   if(exportKind==='gif'){
    setBusy('GIF wird erstellt …');
    const bytes=await alignmentJob<Uint8Array>({kind:'gif',a:pixels(old,512),b:pixels(current,512),seconds,bounce},controller.signal);
    blob=new Blob([new Uint8Array(bytes)],{type:'image/gif'});extension='gif';
   }else if(exportKind==='video'){
    blob=await transitionVideo(old,current,seconds,bounce,controller.signal,p=>setBusy('Video wird erstellt · '+p+' %'));
    extension=blob.type.includes('mp4')?'mp4':'webm';
   }else{
    const flat=document.createElement('canvas');flat.width=old.width;flat.height=old.height;const ctx=flat.getContext('2d')!;
    ctx.drawImage(exportKind==='blend'?old:current,0,0);
    if(exportKind==='blend'){ctx.globalAlpha=opacity/100;ctx.drawImage(current,0,0);}
    blob=await canvasBlob(flat);flat.width=0;
   }
   if(controller.signal.aborted)return;
   setBusy('Wird gespeichert …');
   const name='zeitblick-ausrichtung-'+Date.now()+'-'+exportKind+'.'+extension,outputFile=new File([blob],name,{type:blob.type});
   if(androidBridge())await saveToAndroid([outputFile]);else{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
   setOutputOpen(false);toast.success(animated?'Übergang gespeichert.':'Ausschnitt gespeichert. Originale bleiben unverändert.');
  }catch(e){if(!controller.signal.aborted)toast.error((e as Error).message);}
  finally{if(full)full.width=0;if(old)old.width=0;if(current)current.width=0;if(!controller.signal.aborted)setBusy('');}
 }
 async function back(){
  if(busy)return;
  if(outputOpen){setOutputOpen(false);return;}
  if(a&&b){try{await draftQueue.current.catch(()=>{});await saveDraft({version:1,crop,opacity,a:a.blob,b:b.blob,names:[a.name,b.name],pairs:state.pairs,h:state.base,local:state.local});}catch{toast.error('Entwurf konnte nicht gesichert werden. Bitte zuerst dein Ergebnis speichern.');return;}}
  onBack();
 }
 const shownCrop=cropping?FULL_CROP:crop;
 const smallA=useMemo(()=>a?cropCanvas(a.canvas,shownCrop,1100):null,[a,shownCrop]);
 const smallB=useMemo(()=>warped?cropCanvas(warped,shownCrop,1100):null,[warped,shownCrop]);
 const exportBounds=a?cropBounds(a.canvas.width,a.canvas.height,crop):{width:0,height:0};
 function preset(ratio:number){if(!a)return;const imageRatio=a.canvas.width/a.canvas.height;const w=Math.min(1,ratio/imageRatio),h=Math.min(1,imageRatio/ratio);setCrop({x:(1-w)/2,y:(1-h)/2,w,h});setCropping(true);}
 return <div className="alignment-editor" role="dialog" aria-label="Bilder ausrichten">
  <Toaster position="top-center" theme="dark" richColors/>
  <input ref={file} type="file" accept="image/*" className="sr-only" onChange={e=>{const selectedFile=e.target.files?.[0],target=pick.current;e.target.value='';if(!selectedFile||!target)return;pick.current=null;const url=URL.createObjectURL(selectedFile);void importImage(url,selectedFile.name,target.side,++request.current).finally(()=>URL.revokeObjectURL(url));}}/>
  <header className="align-header"><button className="back-button" aria-label="Zur Kamera" disabled={!!busy} onClick={()=>void back()}><ArrowLeft size={22}/></button><div><h1>Bilder ausrichten</h1><p>Damals bleibt fest. Heute passt sich an.</p></div></header>
  {a&&b&&<div className="align-pinned" inert={!!busy}>
   {tab==='points'?<><button className={!sideBySide&&activeSide==='a'?'active':''} onClick={()=>{setSideBySide(false);setActiveSide('a');}}>Alt{pending?' ✓':''}</button><button className={!sideBySide&&activeSide==='b'?'active':''} onClick={()=>{setSideBySide(false);setActiveSide('b');}}>Neu{pending?' · setzen':''}</button><button className={sideBySide?'active':''} onClick={()=>setSideBySide(!sideBySide)}>Nebeneinander</button></>:<><button onClick={()=>setOpacity(0)}>Alt</button><button onClick={()=>setOpacity(50)}>Überlagern</button><button onClick={()=>setOpacity(100)}>Neu</button></>}
  </div>}
  <main className="align-work" inert={!!busy}>
  <div className="align-imports">{(['a','b'] as const).map(side=><button key={side} onClick={()=>choose(side)} disabled={!hydrated||!!busy}><ImagePlus size={18}/><span>{side==='a'?'Historisches Bild':'Aktuelles Bild'}<small>{(side==='a'?a:b)?'Bild wechseln':'Auswählen · auch HEIC'}</small></span></button>)}</div>
   {(!a||!b)&&<div className="align-welcome"><div className="align-symbol">↗ ⊞ ↙</div><h2>Zwei Zeiten. Eine Perspektive.</h2><p>Wähle beide Fotos. Lass passende Details automatisch suchen oder markiere dieselben Gebäudeecken in beiden Bildern.</p><p>Alles wird auf deinem Handy berechnet. Die Originaldateien bleiben erhalten.</p></div>}
   {a&&b&&<>
    <div className="align-tabs"><button className={tab==='points'?'active':''} onClick={()=>setTab('points')}>Punkte · {state.pairs.length}</button><button className={tab==='preview'?'active':''} disabled={!ready} onClick={applyAlignment}>Vergleichen</button></div>
    {tab==='points'?<>
     <div className="point-search"><button disabled={state.pairs.length>=64} onClick={()=>void automatic()}><Sparkles size={16}/> Automatische Punkte ergänzen</button></div>
     <div className="point-tools">
      <button className={pointTool==='add'?'active':''} onClick={()=>{setPointTool(pointTool==='add'?'browse':'add');setSelected(null);setPending(null);setActiveSide('a');}}>+ Punktpaar</button>
      <button className={pointTool==='edit'?'active':''} onClick={()=>{if(pointTool==='edit'){setPointTool('browse');setSelected(null);}else if(selected!==null)selectPoint(selected);else toast.info('Tippe eine nummerierte Markierung im Bild an. Danach kannst du sie ziehen.');}}>{pointTool==='edit'?'Bearbeiten fertig':'Punkt bearbeiten'}</button>
      <button className={pointTool==='region'?'active':''} onClick={()=>{setPointTool(pointTool==='region'?'browse':'region');setPending(null);setActiveSide('a');}}>Bereiche suchen</button>
     </div>

     <p className="align-instruction">{pointTool==='region'?'Rahmen in Alt und Neu auf denselben Bereich ziehen. Du kannst auch einen neuen Rahmen aufziehen.':pointTool==='edit'?'Paar '+((selected??0)+1)+': markierten Punkt ziehen oder neue Stelle antippen.':pointTool==='add'?(pending?'Tippe dieselbe Stelle im aktuellen Bild an.':'Tippe eine markante Ecke im historischen Bild an.'):'Punkt antippen zum Bearbeiten. Wischen bewegt nur die Ansicht.'}</p>
     <div className={sideBySide?"align-pictures side-by-side":"align-pictures"}>
      {(['a','b'] as const).map(side=><div key={side} hidden={!sideBySide&&activeSide!==side}>
       <AlignmentImage image={side==='a'?a:b} label={side==='a'?'Historisches Bild':'Aktuelles Bild'} points={[...state.pairs.map(p=>p[side]),...(side==='a'&&pending?[pending]:[])]} selected={selected} editable={pointTool==='edit'} region={pointTool==='region'?regions[side]:undefined} onRegion={value=>setRegions(r=>({...r,[side]:value}))} onPick={p=>add(side,p)} onSelect={selectPoint} onMove={(i,p)=>move(side,i,p)}/>
      </div>)}
     </div>
     {pointTool==='region'?<div className="region-actions"><button className="primary-button" disabled={state.pairs.length>=64} onClick={()=>void automatic(true)}><Sparkles size={17}/> Zusätzliche Punkte suchen</button><p>Beide Rahmen grenzen nur die Suche ein. Deine Fotos und der Exportausschnitt bleiben unverändert.</p></div>:<div className="align-pairs">{state.pairs.map((_,i)=><button key={i} className={selected===i?'active':''} onClick={()=>selectPoint(i)} aria-label={'Punktpaar '+(i+1)}>{i+1}</button>)}<button disabled={selected===null||!!busy} aria-label="Ausgewähltes Punktpaar löschen" onClick={()=>{change({...state,pairs:state.pairs.filter((_,i)=>i!==selected)});setSelected(null);setPointTool('browse');}}><Trash2 size={16}/></button></div>}
     {state.pairs.length>0&&<button className="clear-points" onClick={clearPoints}>Alle Punkte löschen</button>}
    </>:<>
     <div className="align-comparison-options"><button className={compare==='fade'?'active':''} onClick={()=>setCompare('fade')}>Überlagern</button><button className={compare==='wipe'?'active':''} onClick={()=>setCompare('wipe')}>Vorher / Nachher</button></div>
     <div className="align-crop-tools"><button onClick={()=>setCropping(!cropping)}>{cropping?'Ausschnitt übernehmen':'Ausschnitt wählen'}</button><button onClick={()=>setCrop({...FULL_CROP})}>Ganzes Bild</button></div>
     {cropping&&<div className="align-crop-presets"><span>Rahmen ziehen · Ecken anpassen</span><button onClick={()=>preset(1)}>1:1</button><button onClick={()=>preset(4/3)}>4:3</button><button onClick={()=>preset(3/4)}>3:4</button><button onClick={()=>preset(16/9)}>16:9</button><button onClick={()=>preset(9/16)}>9:16</button></div>}
     <div className="align-preview" style={{aspectRatio:smallA?smallA.width+'/'+smallA.height:a.canvas.width+'/'+a.canvas.height}}>
      {smallA&&<PreviewCanvas canvas={smallA}/>}
      {smallB&&<div className="align-warp-layer" style={{opacity:compare==='fade'?opacity/100:1,clipPath:compare==='wipe'?'inset(0 '+(100-opacity)+'% 0 0)':undefined}}><PreviewCanvas canvas={smallB}/></div>}
      {compare==='wipe'&&<span className="align-divider" style={{left:opacity+'%'}}/>}
      {cropping&&<AlignmentCrop crop={crop} onChange={setCrop}/> }
      {rendering&&<div className="align-rendering"><LoaderCircle className="spin" size={18}/> Vorschau …</div>}
     </div>
     <label className="align-range">{compare==='fade'?'Aktuelles Bild · Deckkraft':'Aktuell links · Historisch rechts'} <output>{opacity} %</output><input aria-label="Durchsichtigkeit des aktuellen Bildes" type="range" min="0" max="100" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label>
     <p className="align-caption">Historisches Bild unverändert · {exportBounds.width} × {exportBounds.height} px als JPG</p>
    </>}
    <div className="align-method"><label><input type="checkbox" checked={state.local} disabled={!ready||!!busy} onChange={e=>change({...state,local:e.target.checked,base:[...geometry.h]})}/> Lokal verformen</label><p>{state.local?'Zusätzliche Punktpaare ziehen einzelne Bereiche passend. Vorhandene Paare halten andere Stellen fest. Prüfe gerade Gebäudekanten.':'Perspektive anpassen: strecken, stauchen und schräg ausrichten. Gerade Linien bleiben gerade.'}</p></div>
   </>}
   {(error||geometry.error)&&<p role="alert" className="align-error">{error||geometry.error}</p>}
   {message&&<p className="align-message" role="status">{message}</p>}
  </main>
  <footer className="align-footer compact-footer">
   {busy?<div className="align-busy" role="status"><LoaderCircle className="spin" size={18}/><span>{busy}</span>{!busy.startsWith('Bild')&&!busy.includes('gespeichert')&&<button onClick={()=>{job.current?.abort();setBusy('');}}>Abbrechen</button>}</div>:<>
    <div className="align-actions"><button className="primary-button" disabled={!ready} onClick={applyAlignment}>Ausrichten · {state.pairs.length}</button><button className="output-button" disabled={!ready||dirty||rendering||!!error} onClick={()=>setOutputOpen(true)}>Exportieren</button><button className="icon-button" aria-label="Letzte Änderung rückgängig" disabled={!undo.length} onClick={()=>{setState(undo[undo.length-1]);setUndo(h=>h.slice(0,-1));setSelected(null);setPending(null);setPointTool('browse');setTab('points');}}><RotateCcw size={19}/></button></div>
    <small role="status">{error||geometry.error||(pointTool==='edit'?'Paar '+((selected??0)+1)+' bearbeiten · Punkt ziehen oder neue Stelle antippen.':state.pairs.length<4?'Mindestens 4 Punktpaare setzen oder automatisch suchen.':dirty?'Punkte geändert · Ausrichten drücken.':rendering?'Vorschau wird berechnet …':message||'Ausrichtung angewendet.')}</small>
   </>}
  </footer>
  <Dialog open={outputOpen} onOpenChange={open=>{if(!busy)setOutputOpen(open);}}><DialogContent className="alignment-output" showCloseButton={!busy} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>{if(busy)e.preventDefault();}}>
   <DialogTitle>Ergebnis speichern</DialogTitle><DialogDescription>Gewählten Ausschnitt als Bild oder Übergang exportieren.</DialogDescription>
   <div className="align-export-options" inert={!!busy}>
     <label>Speichern als<select aria-label="Exportformat" value={exportKind} onChange={e=>setExportKind(e.target.value as typeof exportKind)}><option value="blend">JPG · Mischbild mit {opacity} % aktuell</option><option value="current">JPG · nur aktuelles Bild</option><option value="gif">GIF · Alt → Neu</option><option value="video">Video · Alt → Neu</option></select></label>
     {(exportKind==='gif'||exportKind==='video')&&<div className="align-animation-options"><label>Dauer<select aria-label="Dauer des Übergangs" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}><option value={4}>4 Sekunden</option><option value={6}>6 Sekunden</option><option value={8}>8 Sekunden</option></select></label><label><input type="checkbox" checked={bounce} onChange={e=>setBounce(e.target.checked)}/> Zurück zu Alt</label><small>{exportKind==='gif'?'GIF · Schleife · bis 512 px':'Video ohne Ton · bis 1280 px · MP4 oder WebM je nach Gerät. Beim Export in der App bleiben.'}</small></div>}
     <button className="primary-button" disabled={rendering||!!error} onClick={()=>void exportOutput()}>Ausschnitt speichern</button>
   </div>
   {busy&&<div className="align-busy" role="status"><span>{busy}</span>{!busy.includes('gespeichert')&&<button onClick={()=>{job.current?.abort();setBusy('');}}>Abbrechen</button>}</div>}
  </DialogContent></Dialog>
 </div>;
}
