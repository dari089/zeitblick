import {createRoot} from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';
if(!crypto.randomUUID) Object.defineProperty(crypto,'randomUUID',{value:()=> 'test-'+Date.now()+'-'+Math.random()});
const report = (value: object) => parent.postMessage(value,location.origin);
const lenses=[{id:'main',label:'Hauptkamera · 24 mm',equivalent:24,facing:'environment'},{id:'tele',label:'Telekamera · 70 mm',equivalent:70,facing:'environment'},{id:'front',label:'Frontkamera',facing:'user'}];
let generation=0;
Object.assign(window,{ZeitblickAndroid:{
 startCamera(lens:string,quality:string,id:string){const current=++generation;report({start:lens||'main',quality});setTimeout(()=>{if(current!==generation)return;window.dispatchEvent(new CustomEvent('zeitblick-cameras',{detail:{cameras:lenses}}));window.dispatchEvent(new CustomEvent('zeitblick-camera-result',{detail:{requestId:id,id:lens||'main',width:1440,height:1920,facing:lens==='front'?'user':'environment',zoomMin:.6,zoomMax:10,zoom:1,exposureMin:-6,exposureMax:6,exposureStep:1/3}}));},30);},
 stopCamera(){generation++;report({stop:true});},
 setPreviewBounds(x:number,y:number,width:number,height:number,density:number){report({bounds:{x,y,width,height,density}});},
 setZoom(value:number){report({zoom:value});window.dispatchEvent(new CustomEvent('zeitblick-zoom',{detail:{zoom:value}}));},
 setExposure(value:number){report({exposure:value});},
 savePhotos(){},
}});
createRoot(document.getElementById('root')!).render(<Home />);
