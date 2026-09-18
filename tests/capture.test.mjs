import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverCrop, overlayPlacement, composePhoto } from '../lib/capture.ts';

const camera = { name: 'camera-pixels' };
const reference = { image: { name: 'reference-pixels' }, width: 1000, height: 750 };
const pose = { x: 0.1, y: -0.1, scale: 1.5, rotation: 30 };
function context() {
  const calls = [];
  return { calls, globalAlpha: 1, drawImage(...args) { calls.push({type:'draw', args, alpha: this.globalAlpha}); }, save() {}, restore() { this.globalAlpha=1; }, translate(x,y) { calls.push({type:'translate', x, y}); }, rotate(angle) { calls.push({type:'rotate', angle}); } };
}

test('default export has camera pixels only, even with a fully opaque reference', () => {
  const ctx=context(); composePhoto(ctx,camera,coverCrop(1920,1080,4/3),reference,false,100,pose);
  assert.equal(ctx.calls.length,1); assert.equal(ctx.calls[0].args[0],camera); assert.equal(ctx.calls[0].alpha,1);
});
test('opt-in export applies reference opacity and transform, and zero opacity stays clean', () => {
  const ctx=context(); composePhoto(ctx,camera,coverCrop(1920,1080,4/3),reference,true,37,pose);
  const draws=ctx.calls.filter(x=>x.type==='draw'); assert.equal(draws.length,2); assert.equal(draws[1].args[0],reference.image); assert.equal(draws[1].alpha,.37); assert.equal(ctx.globalAlpha,1);
  assert.ok(ctx.calls.some(x=>x.type==='rotate'&&Math.abs(x.angle-Math.PI/6)<1e-10));
  const clean=context(); composePhoto(clean,camera,coverCrop(1920,1080,4/3),reference,true,0,pose); assert.equal(clean.calls.length,1);
  const absent=context(); composePhoto(absent,camera,coverCrop(1920,1080,4/3),null,true,100,pose); assert.equal(absent.calls.length,1);
});
test('landscape and portrait exports match the centered preview crop without stretching', () => {
  assert.deepEqual(coverCrop(1920,1080,4/3),{x:240,y:0,width:1440,height:1080});
  assert.deepEqual(coverCrop(1920,1080,3/4),{x:555,y:0,width:810,height:1080});
  assert.deepEqual(coverCrop(1080,1920,3/4),{x:0,y:240,width:1080,height:1440});
  assert.throws(()=>coverCrop(0,1080,1));
});
test('reference placement is identical at preview size and full export resolution', () => {
  const preview=overlayPlacement(400,300,1000,750,pose); const full=overlayPlacement(1600,1200,1000,750,pose);
  for(const key of Object.keys(preview)) assert.ok(Math.abs(full[key]-preview[key]*4)<1e-9);
});
