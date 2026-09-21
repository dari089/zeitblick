"use client";
import {useRef} from 'react';
import type {Crop} from '@/lib/alignment-export';
export function AlignmentCrop({crop,onChange}:{crop:Crop;onChange:(crop:Crop)=>void}){
 const drag=useRef<{x:number;y:number;crop:Crop;handle:string}|null>(null);
 return <div className="align-crop-surface" aria-label="Ausschnitt ziehen und an den Ecken anpassen" onPointerDown={e=>{
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
  const handle=(e.target as HTMLElement).dataset.handle||'move';
  drag.current={x:e.clientX,y:e.clientY,crop:{...crop},handle};
 }} onPointerMove={e=>{
  const g=drag.current;if(!g)return;const rect=e.currentTarget.getBoundingClientRect(),dx=(e.clientX-g.x)/rect.width,dy=(e.clientY-g.y)/rect.height;
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
   <span className="crop-center">Ausschnitt</span>
  </div>
 </div>;
}
