import {homography,mapping,project,type Matrix,type Pair,type Point} from './alignment.ts';

/** Keep descriptor matches near the perspective indicated by the user's anchors. */
export function guidedMatches(candidates:Pair[],anchors:Pair[],local:boolean,base?:Matrix):Pair[]{
 const manual=anchors.filter(p=>p.source==='manual');
 if(manual.length<4)return candidates;
 const h=local&&base?base:homography(manual),predict=local?mapping(h,manual,true):(p:Point)=>project(h,p);
 return candidates.filter(p=>{
  const expected=predict(p.a);
  return Number.isFinite(expected.x)&&Number.isFinite(expected.y)&&
   Math.hypot(expected.x-p.b.x,expected.y-p.b.y)<.055;
 });
}
