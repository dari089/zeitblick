"use client";
import {useRef} from 'react';
import type {Crop} from '@/lib/alignment-export';
export function AlignmentCrop({crop,onChange,drawNew=false,label="Ausschnitt"}:{crop:Crop;onChange:(crop:Crop)=>void;drawNew?:boolean;label?:string}){
 const drag=useRef<{x:number;y:number;crop:Crop;handle:string;pointer:number}|null>(null);
 return <div className="align-crop-surface" aria-label="Ausschnitt ziehen und an den Ecken anpassen" onPointerDown={e=>{
  if(drag.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
  const target=e.target as HTMLElement,rect=e.currentTarget.getBoundingClientRect();
  const handle=target.dataset.handle||(drawNew&&!target.closest('.align-crop-box')?'draw':'move');
  const start=handle==='draw'?{x:Math.max(0,Math.min(.94,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(.94,(e.clientY-rect.top)/rect.height)),w:.06,h:.06}:{...crop};
  drag.current={x:e.clientX,y:e.clientY,crop:start,handle,pointer:e.pointerId};
  if(handle==='draw')onChange(start);
 }} onPointerMove={e=>{
  const g=drag.current;if(!g||g.pointer!==e.pointerId)return;const rect=e.currentTarget.getBoundingClientRect(),dx=(e.clientX-g.x)/rect.width,dy=(e.clientY-g.y)/rect.height;
  if(g.handle==='draw'){const x=Math.max(0,Math.min(1,g.crop.x+dx)),y=Math.max(0,Math.min(1,g.crop.y+dy));const left=Math.min(g.crop.x,x),top=Math.min(g.crop.y,y);onChange({x:left,y:top,w:Math.min(1-left,Math.max(.06,Math.abs(x-g.crop.x))),h:Math.min(1-top,Math.max(.06,Math.abs(y-g.crop.y)))});return;}
  if(g.handle==='move'){onChange({...g.crop,x:Math.max(0,Math.min(1-g.crop.w,g.crop.x+dx)),y:Math.max(0,Math.min(1-g.crop.h,g.crop.y+dy))});return;}
  let left=g.crop.x,top=g.crop.y,right=left+g.crop.w,bottom=top+g.crop.h;
  if(g.handle.includes('w'))left=Math.max(0,Math.min(right-.06,left+dx));
  if(g.handle.includes('e'))right=Math.min(1,Math.max(left+.06,right+dx));
  if(g.handle.includes('n'))top=Math.max(0,Math.min(bottom-.06,top+dy));
  if(g.handle.includes('s'))bottom=Math.min(1,Math.max(top+.06,bottom+dy));
  onChange({x:left,y:top,w:right-left,h:bottom-top});
 }} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onLostPointerCapture={()=>drag.current=null}>
  <div className="align-crop-box" style={{left:crop.x*100+'%',top:crop.y*100+'%',width:crop.w*100+'%',height:crop.h*100+'%'}}>
   {['nw','ne','sw','se'].map(handle=><span key={handle} data-handle={handle} className={'crop-handle '+handle}/>)}
   <span className="crop-center">{label}</span>
  </div>
 </div>;
}
