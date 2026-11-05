import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTimeline} from '../companion/timeline.mjs';
import {playbackProgress, progressPixels} from '../shared/progress.js';

test('timeline extrapolates from the Windows update time and freezes on pause',()=>{
 let now=10000;const timeline=createTimeline(()=>now);
 assert.equal(timeline.update({position_ms:2000,duration_ms:100000,timeline_at:9000},'playing'),true);
 assert.equal(timeline.snapshot().position_ms,3000);now+=5000;assert.equal(timeline.snapshot().position_ms,8000);
 timeline.setState('paused');now+=10000;assert.equal(timeline.snapshot().position_ms,8000);
 timeline.setState('playing');now+=1000;assert.equal(timeline.snapshot().position_ms,9000);
 timeline.setState('idle');assert.equal(timeline.snapshot().duration_ms,0);
});
test('normal timeline ticks do not notify clients, while seeks and new durations do',()=>{
 let now=10000;const timeline=createTimeline(()=>now);
 timeline.update({position_ms:0,duration_ms:100000,timeline_at:now},'playing');
 now+=1000;assert.equal(timeline.update({position_ms:1000,duration_ms:100000,timeline_at:now},'playing'),false);
 now+=1000;assert.equal(timeline.update({position_ms:50000,duration_ms:100000,timeline_at:now},'playing'),true);
 assert.equal(timeline.update({position_ms:0,duration_ms:200000,timeline_at:now},'playing'),true);
 assert.equal(timeline.update({},'playing'),true);assert.equal(timeline.snapshot().duration_ms,0);
});
test('invalid progress is hidden, positions clamp, and paused pixels do not advance',()=>{
 for(const data of [null,{}, {state:'idle',position_ms:1,duration_ms:100}, {state:'playing',position_ms:1,duration_ms:0}, {state:'playing',position_ms:NaN,duration_ms:100}]) assert.equal(playbackProgress(data),null);
 const paused=playbackProgress({state:'paused',position_ms:500,duration_ms:1000});
 assert.equal(progressPixels(paused,10000),27);
 assert.equal(progressPixels({...paused,playing:true},10000),54);
 assert.equal(playbackProgress({state:'playing',position_ms:-10,duration_ms:1000}).position,0);
});
