import type {NativeLens} from './android';

/** Pick an optical base near the photo's 35-mm-equivalent focal length. */
export function matchReferenceLens(lenses:NativeLens[],focal35:number):{id:string;zoom:number;equivalent:number}|null{
 if(!Number.isFinite(focal35)||focal35<5||focal35>400)return null;
 const candidates=lenses.filter(l=>l.facing==='environment'&&Number.isFinite(l.equivalent)&&Number(l.equivalent)>0);
 if(!candidates.length)return null;
 const ranked=candidates.map(l=>{
  const equivalent=Number(l.equivalent),zoom=Math.max(1,focal35/equivalent);
  // A lens wider than the requested view can zoom in; one that is too narrow cannot zoom out.
  const score=Math.abs(Math.log(focal35/equivalent))+(equivalent>focal35?2:0)+(l.id.includes('/')?.08:0);
  return {id:l.id,zoom,equivalent,score};
 }).sort((a,b)=>a.score-b.score);
 const {id,zoom,equivalent}=ranked[0];return {id,zoom,equivalent};
}
