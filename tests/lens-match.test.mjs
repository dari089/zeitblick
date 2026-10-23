import assert from 'node:assert/strict';
import {test} from 'node:test';
import {matchReferenceLens} from '../lib/lens-match.ts';

const lenses=[
 {id:'ultra',label:'Ultra',equivalent:14,facing:'environment'},
 {id:'main',label:'Haupt',equivalent:24,facing:'environment'},
 {id:'logical/tele',label:'Tele',equivalent:67,facing:'environment'},
 {id:'front',label:'Front',equivalent:23,facing:'user'},
];
test('metadata uses an optical base and only the remaining zoom',()=>{
 assert.deepEqual(matchReferenceLens(lenses,28),{id:'main',zoom:28/24,equivalent:24});
 assert.deepEqual(matchReferenceLens(lenses,67),{id:'logical/tele',zoom:1,equivalent:67});
 assert.deepEqual(matchReferenceLens(lenses,18),{id:'ultra',zoom:18/14,equivalent:14});
});
test('bad or absent metadata does not change the camera',()=>{
 assert.equal(matchReferenceLens(lenses,0),null);
 assert.equal(matchReferenceLens(lenses,Infinity),null);
 assert.equal(matchReferenceLens([],35),null);
 assert.equal(matchReferenceLens([{id:'front',label:'Front',equivalent:24,facing:'user'}],24),null);
});
