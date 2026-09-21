"use client";
import {useEffect,useRef,useState} from 'react';
import type {Point} from '@/lib/alignment';
export type EditorImage={canvas:HTMLCanvasElement;url:string;blob:Blob;name:string};
export function AlignmentImage({image,points,selected,onPick,onSelect,onMove,label}:{image:EditorImage;points:Point[];selected:number|null;onPick:(p:Point)=>void;onSelect:(index:number)=>void;onMove:(index:number,p:Point)=>void;label:string}){
 const ref=useRef<HTMLDivElement>(null),loupe=useRef<HTMLCanvasElement>(null);
 const [size,setSize]=useState({w:1,h:1}),[pose,setPose]=useState({x:0,y:0,z:1}),[focus,setFocus]=useState<Point|null>(null);
 const poseRef=useRef(pose);poseRef.current=pose;
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const gesture=useRef<{center:Point;distance:number;pose:typeof pose;marker:number;start:Point;moved:boolean}|null>(null);
 const fit=Math.min(size.w/image.canvas.width,size.h/image.canvas.height),w=image.canvas.width*fit,h=image.canvas.height*fit;
 useEffect(()=>{const node=ref.current!;const ob=new ResizeObserver(([e])=>{setSize({w:e.contentRect.width,h:e.contentRect.height});setPose({x:0,y:0,z:1});});ob.observe(node);return()=>ob.disconnect();},[]);
 useEffect(()=>setPose({x:0,y:0,z:1}),[image]);
 useEffect(()=>{if(!focus||!loupe.current)return;const c=loupe.current.getContext('2d')!;const span=Math.max(24,Math.min(image.canvas.width,image.canvas.height)/10/pose.z);c.fillStyle='#111';c.fillRect(0,0,120,120);c.drawImage(image.canvas,(focus.x*image.canvas.width)-span/2,(focus.y*image.canvas.height)-span/2,span,span,0,0,120,120);c.strokeStyle='#d4ed88';c.beginPath();c.moveTo(60,45);c.lineTo(60,75);c.moveTo(45,60);c.lineTo(75,60);c.stroke();},[focus,image,pose.z]);
 function local(e:React.PointerEvent){const r=ref.current!.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
 function norm(p:Point){const t=poseRef.current;return{x:(p.x-size.w/2-t.x)/(w*t.z)+.5,y:(p.y-size.h/2-t.y)/(h*t.z)+.5};}
 function begin(marker=-1){const p=[...pointers.current.values()];if(!p.length){gesture.current=null;return;}const center=p.length>1?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2}:p[0];gesture.current={center,distance:p.length>1?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0,pose:{...poseRef.current},marker:p.length>1?-1:marker,start:center,moved:p.length>1};}
 function update(next:typeof pose){const z=Math.max(1,Math.min(8,next.z));setPose({z,x:Math.max(-w*z/2,Math.min(w*z/2,next.x)),y:Math.max(-h*z/2,Math.min(h*z/2,next.y))});}
 function end(e:React.PointerEvent,cancel=false){const g=gesture.current;if(!cancel&&g&&!g.moved&&g.marker<0&&pointers.current.size===1){const p=norm(local(e));if(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)onPick(p);}pointers.current.delete(e.pointerId);begin();if(gesture.current)gesture.current.moved=true;setFocus(null);}
 return <div className="align-image">
  <div className="align-image-label"><strong>{label}</strong><span>{image.name}</span></div>
  <div ref={ref} className="point-viewport" role="group" aria-label={label+' – Punkte setzen, mit zwei Fingern zoomen'} onPointerDown={e=>{
   e.currentTarget.setPointerCapture(e.pointerId);const p=local(e);pointers.current.set(e.pointerId,p);
   const index=points.findIndex(q=>Math.hypot(size.w/2+pose.x+(q.x-.5)*w*pose.z-p.x,size.h/2+pose.y+(q.y-.5)*h*pose.z-p.y)<22);
   if(index>=0&&pointers.current.size===1)onSelect(index);begin(index);setFocus(norm(p));
  }} onPointerMove={e=>{
   if(!pointers.current.has(e.pointerId)||!gesture.current)return;
   const p=local(e);pointers.current.set(e.pointerId,p);const values=[...pointers.current.values()],g=gesture.current;
   if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>6)g.moved=true;
   if(values.length===1&&g.marker>=0){const q=norm(p);const bounded={x:Math.max(0,Math.min(1,q.x)),y:Math.max(0,Math.min(1,q.y))};onMove(g.marker,bounded);setFocus(bounded);return;}
   const center=values.length>1?{x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2}:p;
   const z=values.length>1&&g.distance?Math.max(1,Math.min(8,g.pose.z*Math.hypot(values[1].x-values[0].x,values[1].y-values[0].y)/g.distance)):g.pose.z;
   const factor=z/g.pose.z;
   update({z,x:center.x-size.w/2-(g.center.x-size.w/2-g.pose.x)*factor,y:center.y-size.h/2-(g.center.y-size.h/2-g.pose.y)*factor});
   setFocus(null);
  }} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>{if(pointers.current.has(e.pointerId))end(e,true);}}>
   <img src={image.url} alt={label} draggable={false} style={{width:w,height:h,transform:`translate(-50%,-50%) translate(${pose.x}px,${pose.y}px) scale(${pose.z})`}} />
   <svg width={size.w} height={size.h} aria-hidden="true">{points.map((p,i)=><g key={i} transform={`translate(${size.w/2+pose.x+(p.x-.5)*w*pose.z},${size.h/2+pose.y+(p.y-.5)*h*pose.z})`}><circle r={selected===i?15:12} fill={selected===i?'#d4ed88':'#152611'} stroke="#ecf6cf" strokeWidth="2"/><text textAnchor="middle" dy="4" fill={selected===i?'#152611':'white'} fontSize="12" fontWeight="bold">{i+1}</text></g>)}</svg>
   {focus&&<canvas ref={loupe} width={120} height={120} className="point-loupe" />}
  </div>
  <div className="point-zoom"><button onClick={()=>update({...pose,z:pose.z/1.5})} aria-label={label+' verkleinern'}>−</button><button onClick={()=>setPose({x:0,y:0,z:1})}>{pose.z.toFixed(1)}× · Ganzes Bild</button><button onClick={()=>update({...pose,z:pose.z*1.5})} aria-label={label+' vergrößern'}>+</button></div>
 </div>;
}
