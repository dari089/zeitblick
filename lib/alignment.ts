export type Point = {x:number;y:number};
export type Pair = {a:Point;b:Point;source?:'manual'|'auto'}; // a: fixed historical, b: current source
export type Matrix = number[];
export const IDENTITY:Matrix=[1,0,0,0,1,0,0,0,1];
export function project(h:Matrix,p:Point):Point {
 const d=h[6]*p.x+h[7]*p.y+h[8];
 if(Math.abs(d)<1e-9)return {x:Infinity,y:Infinity};
 return {x:(h[0]*p.x+h[1]*p.y+h[2])/d,y:(h[3]*p.x+h[4]*p.y+h[5])/d};
}
export function solve(a:number[][],b:number[]):number[] {
 const n=b.length,m=a.map((row,i)=>[...row,b[i]]);
 for(let k=0;k<n;k++){
  let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[pivot][k]))pivot=i;
  if(Math.abs(m[pivot][k])<1e-10)throw Error('Punkte weiter verteilen; sie dürfen nicht auf einer Linie liegen.');
  [m[k],m[pivot]]=[m[pivot],m[k]];
  const d=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=d;
  for(let i=0;i<n;i++)if(i!==k){const f=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=f*m[k][j];}
 }
 return m.map(row=>row[n]);
}
/** Inverse mapping: output/history coordinates -> current photograph. */
export function homography(pairs:Pair[]):Matrix {
 if(pairs.length<4)throw Error('Mindestens vier gemeinsame Punktpaare setzen.');
 const rows:number[][]=[],rhs:number[]=[];
 for(const {a:{x,y},b} of pairs){rows.push([x,y,1,0,0,0,-b.x*x,-b.x*y],[0,0,0,x,y,1,-b.y*x,-b.y*y]);rhs.push(b.x,b.y);}
 const normal=Array.from({length:8},()=>Array(8).fill(0)),v=Array(8).fill(0);
 rows.forEach((r,k)=>{for(let i=0;i<8;i++){v[i]+=r[i]*rhs[k];for(let j=0;j<8;j++)normal[i][j]+=r[i]*r[j];}});
 const h=[...solve(normal,v),1];validateHomography(h);return h;
}
export function validateHomography(h:Matrix){
 if(h.length!==9||!h.every(Number.isFinite))throw Error('Keine stabile Perspektive gefunden.');
 const ds=[h[8],h[6]+h[8],h[7]+h[8],h[6]+h[7]+h[8]];
 if(ds.some(d=>Math.abs(d)<1e-4)||ds.some(d=>Math.sign(d)!==Math.sign(ds[0])))throw Error('Diese Punkte kippen die Perspektive. Bitte die Zuordnung prüfen.');
 const p=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}].map(p=>project(h,p));
 const area=p.reduce((s,q,i)=>s+q.x*p[(i+1)%4].y-q.y*p[(i+1)%4].x,0)/2;
 if(area<.003||area>100)throw Error('Die Ausrichtung wäre gespiegelt oder zu stark verzerrt. Bitte die Punkte prüfen.');
}
const kernel=(r2:number)=>r2<1e-16?0:r2*Math.log(r2);
/** Smooth residual field over the projective mapping, with fixed border corners. */
export function mapping(h:Matrix,pairs:Pair[],local:boolean):(p:Point)=>Point {
 if(!local||!pairs.length)return p=>project(h,p);
 const controls=[...pairs];
 for(const a of [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}])
  if(!controls.some(p=>Math.hypot(p.a.x-a.x,p.a.y-a.y)<.04))controls.push({a,b:project(h,a)});
 const n=controls.length,mat=Array.from({length:n+3},()=>Array(n+3).fill(0));
 const dx=Array(n+3).fill(0),dy=Array(n+3).fill(0);
 controls.forEach(({a,b},i)=>{
  const base=project(h,a);dx[i]=b.x-base.x;dy[i]=b.y-base.y;
  controls.forEach((p,j)=>mat[i][j]=kernel((a.x-p.a.x)**2+(a.y-p.a.y)**2)+(i===j?1e-7:0));
  mat[i][n]=mat[n][i]=1;mat[i][n+1]=mat[n+1][i]=a.x;mat[i][n+2]=mat[n+2][i]=a.y;
 });
 const wx=solve(mat,dx),wy=solve(mat,dy);
 return p=>{
  const base=project(h,p);let x=wx[n]+wx[n+1]*p.x+wx[n+2]*p.y,y=wy[n]+wy[n+1]*p.x+wy[n+2]*p.y;
  controls.forEach(({a},i)=>{const k=kernel((p.x-a.x)**2+(p.y-a.y)**2);x+=wx[i]*k;y+=wy[i]*k;});
  return {x:base.x+x,y:base.y+y};
 };
}
export type Pixels={width:number;height:number;data:Uint8ClampedArray};
export function warp(source:Pixels,width:number,height:number,h:Matrix,pairs:Pair[],local:boolean):Pixels {
 const map=mapping(h,pairs,local),out=new Uint8ClampedArray(width*height*4);
 // A dense lookup grid keeps local TPS export practical on phones.
 const gw=Math.min(width,256),gh=Math.min(height,256),grid=new Float64Array((gw+1)*(gh+1)*2);
 for(let y=0;y<=gh;y++)for(let x=0;x<=gw;x++){const p=map({x:x/gw,y:y/gh}),i=(y*(gw+1)+x)*2;grid[i]=p.x;grid[i+1]=p.y;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const gx=x/Math.max(1,width-1)*gw,gy=y/Math.max(1,height-1)*gh,ix=Math.min(gw-1,Math.floor(gx)),iy=Math.min(gh-1,Math.floor(gy)),tx=gx-ix,ty=gy-iy,i=(iy*(gw+1)+ix)*2,j=i+(gw+1)*2;
  const u=(grid[i]*(1-tx)+grid[i+2]*tx)*(1-ty)+(grid[j]*(1-tx)+grid[j+2]*tx)*ty;
  const v=(grid[i+1]*(1-tx)+grid[i+3]*tx)*(1-ty)+(grid[j+1]*(1-tx)+grid[j+3]*tx)*ty;
  if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>1||v<0||v>1)continue;
  const sx=u*(source.width-1),sy=v*(source.height-1),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(source.width-1,x0+1),y1=Math.min(source.height-1,y0+1),fx=sx-x0,fy=sy-y0,di=(y*width+x)*4;
  for(let c=0;c<4;c++)out[di+c]=(source.data[(y0*source.width+x0)*4+c]*(1-fx)+source.data[(y0*source.width+x1)*4+c]*fx)*(1-fy)+(source.data[(y1*source.width+x0)*4+c]*(1-fx)+source.data[(y1*source.width+x1)*4+c]*fx)*fy;
 }
 return {width,height,data:out};
}
