import {GIFEncoder,quantize,applyPalette} from '../vendor/gifenc.js';
import {transition} from './alignment-export';
import type {Pixels} from './alignment';
export function encodeTransitionGif(a:Pixels,b:Pixels,seconds:number,bounce:boolean){
 if(a.width!==b.width||a.height!==b.height)throw Error('GIF-Bildgrößen stimmen nicht überein.');
 // Include intermediate blend colors: endpoint-only palettes can turn a fade into a hard cut.
 const count=Math.min(16384,a.width*a.height),steps=17,sample=new Uint8ClampedArray(count*steps*4);
 for(let step=0;step<steps;step++)for(let pixel=0;pixel<count;pixel++){
  const source=Math.floor(pixel*(a.width*a.height-1)/Math.max(1,count-1))*4,target=(step*count+pixel)*4,alpha=step/(steps-1);
  for(let channel=0;channel<3;channel++)sample[target+channel]=a.data[source+channel]*(1-alpha)+b.data[source+channel]*alpha;
  sample[target+3]=255;
 }
 const palette=quantize(sample,256),encoder=GIFEncoder(),rgba=new Uint8ClampedArray(a.data.length),frames=Math.round(seconds*12),delay=Math.round(seconds*1000/frames);
 for(let f=0;f<frames;f++){
  const alpha=transition(f/(frames-1),bounce);
  for(let i=0;i<rgba.length;i+=4){for(let c=0;c<3;c++)rgba[i+c]=a.data[i+c]*(1-alpha)+b.data[i+c]*alpha;rgba[i+3]=255;}
  encoder.writeFrame(applyPalette(rgba,palette),a.width,a.height,{palette:f===0?palette:undefined,delay,repeat:0});
 }
 encoder.finish();return encoder.bytes();
}
