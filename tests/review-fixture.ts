import { canvasBlob, type PhotoCapture } from '../lib/photo-types';
// Development-only known geometry for checking comparison, zoom and both exports.
export async function reviewFixture(): Promise<PhotoCapture> {
  const raw = document.createElement('canvas'); raw.width = 1200; raw.height = 1600;
  const ctx = raw.getContext('2d')!;
  const colors=['#214967','#6e8752','#c99a63','#655277'];
  for(let i=0;i<4;i++){ctx.fillStyle=colors[i];ctx.fillRect((i%2)*600,Math.floor(i/2)*800,600,800);}
  ctx.strokeStyle='white';ctx.lineWidth=6;for(let x=0;x<=1200;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1600);ctx.stroke();}for(let y=0;y<=1600;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1200,y);ctx.stroke();}
  const layer = document.createElement('canvas'); layer.width=1200;layer.height=1600;const l=layer.getContext('2d')!;l.fillStyle='#f13a3a';l.fillRect(500,0,200,1600);l.fillRect(0,700,1200,200);
  const blob=await canvasBlob(raw);
  return {id:'testaufnahme',raw,layer,blob,url:URL.createObjectURL(blob),width:1200,height:1600,opacity:50,filename:'zeitblick-testaufnahme'};
}
