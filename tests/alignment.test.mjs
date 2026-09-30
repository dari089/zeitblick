import assert from 'node:assert/strict';
import {test} from 'node:test';
import {homography,project,mapping,warp,IDENTITY} from '../lib/alignment.ts';
const corners=[{x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.05,y:.95},{x:.4,y:.35},{x:.6,y:.7}];
const h=[.84,.12,.07,-.08,.91,.08,.13,-.06,1];
test('four and overdetermined point pairs recover perspective including skew and stretch',()=>{
 for(const points of [corners.slice(0,4),corners]){
  const fit=homography(points.map(a=>({a,b:project(h,a)})));
  for(const a of corners){const actual=project(fit,a),expected=project(h,a);assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y)<1e-8);}
 }
});
test('degenerate and reversed point assignments are rejected instead of distorting a photo',()=>{
 assert.throws(()=>homography(corners.slice(0,3).map(a=>({a,b:a}))));
 assert.throws(()=>homography([0,.25,.5,.75].map(x=>({a:{x,y:x},b:{x,y:x}}))));
 assert.throws(()=>homography(corners.map(a=>({a,b:{x:1-a.x,y:a.y}}))));
});
test('local warp moves one region and keeps chosen neighboring anchors fixed',()=>{
 const pairs=corners.map(a=>({a,b:{...a}}));pairs[4].b={x:.49,y:.39};
 const map=mapping(IDENTITY,pairs,true);
 for(const {a,b} of pairs){const got=map(a);assert.ok(Math.hypot(got.x-b.x,got.y-b.y)<.0001);}
 const center=map(pairs[4].a);assert.ok(center.x-pairs[4].a.x>.08);
});
test('identity warp preserves pixels and leaves source bytes unchanged',()=>{
 const source={width:19,height:13,data:Uint8ClampedArray.from({length:19*13*4},(_,i)=>(i*37)%256)},copy=source.data.slice();
 const result=warp(source,19,13,IDENTITY,[],false);
 assert.deepEqual(result.data,copy);assert.deepEqual(source.data,copy);
});
test('missing source areas stay transparent, never fabricated or wrapped',()=>{
 const source={width:4,height:4,data:new Uint8ClampedArray(64).fill(255)};
 const result=warp(source,4,4,[1,0,2,0,1,0,0,0,1],[],false);
 assert.ok(result.data.every(v=>v===0));
});
