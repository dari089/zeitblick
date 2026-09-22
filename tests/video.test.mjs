import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitMedia} from '../lib/video-tools.ts';
test('video preview preserves portrait and landscape proportions without stretching',()=>{
 for(const [sw,sh,w,h] of [[1920,1080,720,1280],[1080,1920,640,1280],[1080,1920,720,1280]]){
  const fit=fitMedia(sw,sh,w,h);assert.ok(Math.abs(fit.width/fit.height-sw/sh)<1e-10);assert.ok(fit.x>=0&&fit.y>=0&&fit.width<=w&&fit.height<=h);assert.ok(Math.abs(fit.x*2+fit.width-w)<1e-8);assert.ok(Math.abs(fit.y*2+fit.height-h)<1e-8);
 }
});
