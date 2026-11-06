import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerFontMaps,textWidth} from '../node_modules/@busy-app/busy-lib/dist/Utils/font/index.js';
import {scrollSync,SCROLL_RATE} from '../src/scroll-sync.js';

for(const name of ['small','tiny'])registerFontMaps(JSON.parse(readFileSync(new URL('../node_modules/@busy-app/busy-lib/dist/Utils/font/maps/'+name+'.json',import.meta.url))));
const duration=(text,font)=>Math.floor((textWidth(text,font)+3*textWidth(' ',font))*60000/SCROLL_RATE);

test('both native circular scrolls share a period; the shorter run waits longer',()=>{
 for(const [title,artist] of [['A'.repeat(40),'B'.repeat(20)],['A'.repeat(15),'B'.repeat(40)]]) {
  const sync=scrollSync(title,artist);assert.equal(sync.both,true);
  const a=duration(title,'small'),b=duration(artist,'tiny');
  assert.equal(a+sync.titleDelay,b+sync.artistDelay);
  assert.equal(Math.min(sync.titleDelay,sync.artistDelay),2500);
  assert.equal(sync.titleDelay-sync.artistDelay,b-a);
 }
});
test('a line which fits does not change the other line native pause',()=>{
 for(const [title,artist] of [['Short','B'.repeat(30)],['A'.repeat(30),'Short'],['Short','Short']]) {
  assert.deepEqual(scrollSync(title,artist),{both:false,titleDelay:2500,artistDelay:2500});
 }
});
