import {scrollSync,SCROLL_RATE,SCROLL_START} from '../src/scroll-sync.js';
import {registerFontMaps} from '../node_modules/@busy-app/busy-lib/dist/Utils/font/index.js';
import {playbackProgress, progressPixels, PROGRESS_WIDTH} from '../shared/progress.js';
import {progressElements,PROGRESS_IDS} from '../src/progress-display.js';
import { volumeFrame } from '../companion/volume-frame.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { bridgeUrl, selectedBridgeUrl, hasBridgeNetworks, playbackLines, playbackCover, displayText } from '../shared/now-playing.js';
for(const name of ['small','tiny'])registerFontMaps(JSON.parse(readFileSync(new URL('../node_modules/@busy-app/busy-lib/dist/Utils/font/maps/'+name+'.json',import.meta.url))));
const volumeSource = readFileSync(new URL('../src/volume-display.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const volumeContext = { row: (_, children) => children, render: value => Array.isArray(value) ? value.flat(Infinity) : [value], stack: (_, children) => children };
vm.runInNewContext(volumeSource + '\nglobalThis.volumeTools = { volumeElements, localVolumeElements, sliderElements, VOLUME_IDS };', volumeContext);
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));
function launch({ wifi='connected', configured=true, volumeStep=5, fail=false, failControl=false, holdControl=false, addresses=null, failHosts=[] }={}) {
 let now=0, next=0, handler, revision=0, unbound=0, pendingWatch=null, controlFinish=null, watchReject=null;
 let track={state:'playing',title:'Song',artist:'Artist'};
 let holdDraw=false, drawFinish=null, inDisplay=0, maxDisplay=0;
 const timers=new Map(), frames=[], clears=[], requests=[], commands=[], cancellations=[];
 const response=(data=track,status=200,tag=`"${revision}"`)=>({ok:status>=200&&status<300,status,headers:{get:name=>name==='ETag'?tag:name==='X-Busybar-Events'?'1':null},json:async()=>data});
 function push(data) {track=data;revision++;if(pendingWatch){const resolve=pendingWatch;pendingWatch=null;resolve(response());}}
 async function display(work) {inDisplay++;maxDisplay=Math.max(maxDisplay,inDisplay);work();if(holdDraw){holdDraw=false;await new Promise(resolve=>drawFinish=resolve);}inDisplay--;}
 const context={...volumeContext.volumeTools, manifest:{id:'app.test'},scrollSync,SCROLL_RATE,SCROLL_START,playbackProgress,progressPixels,PROGRESS_WIDTH,progressElements,PROGRESS_IDS,bridgeUrl,selectedBridgeUrl,hasBridgeNetworks,playbackLines,playbackCover,
  volumeFrame, Date:class extends Date {static now(){return now;}},
  loadValues:async()=>({bridge_url:configured?'http://192.168.1.10:8765/now-playing':'',volume_step:volumeStep,...addresses}),
  row:(_,children)=>children,column:(_,children)=>children,render:value=>Array.isArray(value)?value.flat(Infinity):[value],
  device:{WifiStatusGet:async()=>({state:wifi,ssid:'ignored'}),DisplayDraw:async frame=>display(()=>frames.push(frame.elements)),DisplayClear:async frame=>display(()=>clears.push(frame.element_ids))},
  fetch:async(url,options)=>{
   if(options?.method==='POST') {
    if(url.endsWith('/cancel-wait')){cancellations.push(url);if(pendingWatch){pendingWatch(response({},204));pendingWatch=null;}return response({},204);}
    if(url.includes('volume?steps=0&'))return response({ok:true,volume:60,frame:volumeFrame(60)});
    commands.push({url,options,at:now});
    if(holdControl)return new Promise(resolve=>controlFinish=resolve);
    if(failControl)return response({},503);
    if(url.includes('/volume?'))return response({ok:true,volume:65,frame:volumeFrame(65)});
    push({...track,state:track.state==='playing'?'paused':'playing',title:url.endsWith('/next')?'Next song':track.title});
    return response({ok:true});
   }
   requests.push({url,options});if(fail || failHosts.some(host=>url.includes(host)))throw Error('offline');
   if(options?.headers?.['If-None-Match']===`"${revision}"`)return new Promise((resolve,reject)=>{pendingWatch=resolve;watchReject=reject;});
   return response();
  },
  listen:(_,fn)=>{handler=fn;return()=>unbound++;},
  setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,due:now+delay,delay});return id;},clearTimeout:id=>timers.delete(id),console:{error(){}},
 };
 vm.runInNewContext(source,context);
 return {frames,clears,requests,commands,cancellations,timers,push,input:event=>handler(event),unbound:()=>unbound,maxDisplay:()=>maxDisplay,
  setFail:value=>{fail=value;},failWatch:()=>{watchReject(Error('Inactivity timeout'));pendingWatch=null;},holdNextDraw:()=>{holdDraw=true;},releaseDraw:()=>drawFinish(),finishControl:result=>controlFinish(response(result)),
  async advance(ms){const until=now+ms;for(let i=0;i<50;i++){const item=[...timers].sort((a,b)=>a[1].due-b[1].due).find(([,t])=>t.due<=until);if(!item)break;now=item[1].due;timers.delete(item[0]);item[1].fn();await flush();}now=until;await flush();},
 };
}

test('metadata, paused, idle, malformed and bounded ASCII text', () => {
 assert.deepEqual(playbackLines({ state: 'playing', title: 'Song', artist: 'Artist' }), ['Song','Artist']);
 assert.deepEqual(playbackLines({ state: 'paused', title: 'Song' }), ['Song','Paused']);
 assert.deepEqual(playbackLines({ state: 'idle' }), ['Spotify','No music']);
 assert.throws(() => playbackLines({ state: 'bad' }));
 assert.equal(displayText('a'.repeat(200)).length, 120);
 assert.equal(bridgeUrl('https://example.com/now-playing'), '');
 assert.equal(bridgeUrl('http://user:pass@host/now-playing'), '');
});
test('PC renders bounded volume frames with the confirmed level', () => {
 for(const value of [0,1,50,65,99,100]) {
  const frame=volumeFrame(value);
  const elements=volumeContext.volumeTools.volumeElements(value,frame);
  assert.equal(elements.length,1); assert.equal(elements[0].id,'volume');
  assert.ok(frame.length<1700); assert.equal(frame.split('\n').length,37);
  const palette=frame.split('\n').slice(2,21).map(line=>line[0]);
  assert.equal(new Set(palette).size,19,'Gradient and disabled arrows must use distinct palette symbols');
  assert.ok(!frame.split('\n').slice(-16)[0].includes('Z'),'No gray stripe in the gradient');
  assert.ok(frame.split('\n').slice(-16).every(row=>row.length===72));
 }
 assert.notEqual(volumeFrame(60),volumeFrame(65));
});

test('the bridge accepts valid step percentages and rejects malformed controls', async () => {
 const {parseVolumeRequest,adjustVolume}=await import('../companion/control.mjs');
 assert.deepEqual(parseVolumeRequest('/playback/volume?steps=-3&step_percent=10'),{steps:-3,stepPercent:10});
 assert.deepEqual(parseVolumeRequest('/playback/volume?steps=1'),{steps:1,stepPercent:5});
 for(const suffix of ['0','101','1.5','-1','abc']) assert.equal(parseVolumeRequest('/playback/volume?steps=1&step_percent='+suffix),null);
 await assert.rejects(adjustVolume(1,undefined,101),/Invalid volume percentage/);
});


test('one pending watch wakes on metadata changes without periodic polling',async()=>{
 const app=launch();await flush();assert.equal(app.frames.length,1);
 await app.advance(100);assert.equal(app.requests.length,2);
 await app.advance(5000);assert.equal(app.requests.length,2);
 app.push({state:'playing',title:'New song',artist:'New artist'});await flush();
 assert.equal(app.frames.at(-1)[0].text,'New song');
 await app.advance(100);assert.equal(app.requests.length,3);
});

test('buttons work while the change request is waiting; press and long are ignored',async()=>{
 const app=launch();await flush();await app.advance(100);
 app.input({key:'start',action:'press'});app.input({key:'ok',action:'long'});assert.equal(app.commands.length,0);
 app.input({key:'start',action:'short'});await flush();assert.ok(app.commands[0].url.endsWith('/toggle'));
 await app.advance(100);app.input({key:'ok',action:'short'});await flush();assert.ok(app.commands[1].url.endsWith('/next'));
});

test('wheel changes are batched, bounded, configured, and independent from the watch',async()=>{
 const app=launch({volumeStep:10});await flush();await app.advance(100);
 for(let i=0;i<30;i++)app.input({key:'encoder',action:'clockwise',delta:1});
 await app.advance(200);assert.equal(app.commands.length,1);
 assert.ok(app.commands[0].url.endsWith('volume?steps=10&step_percent=10'));
 assert.equal(app.requests.length,2);assert.equal(app.frames.at(-1).find(e=>e.id==='volume-value').text,'65%');
 await app.advance(1500);assert.ok(app.clears.some(ids=>ids.includes('volume')));assert.equal(app.requests.length,2);
});

test('display work is serialized and metadata coalesces to the latest state',async()=>{
 const app=launch();await flush();await app.advance(100);app.holdNextDraw();
 app.push({state:'playing',title:'Second',artist:'Artist'});await flush();
 await app.advance(100);app.push({state:'playing',title:'Third',artist:'Artist'});await flush();
 await app.advance(100);app.push({state:'playing',title:'Latest',artist:'Artist'});await flush();
 assert.equal(app.maxDisplay(),1);app.releaseDraw();await flush();
 assert.equal(app.frames.at(-1)[0].text,'Latest');assert.equal(app.maxDisplay(),1);
});

test('Back cancels the waiting request, clears timers, and unbinds after callback',async()=>{
 const app=launch();await flush();await app.advance(100);
 app.input({key:'encoder',action:'clockwise',delta:1});await app.advance(200);
 app.input({key:'back',action:'short'});assert.equal(app.unbound(),0);await app.advance(0);
 assert.equal(app.cancellations.length,1);assert.equal(app.unbound(),1);assert.equal(app.timers.size,0);
 const frames=app.frames.length;await app.advance(30000);assert.equal(app.frames.length,frames);
});

test('exit while a control is pending prevents late redraws and retries',async()=>{
 const app=launch({holdControl:true});await flush();await app.advance(100);
 app.input({key:'start',action:'short'});await flush();app.input({key:'start',action:'short'});assert.equal(app.commands.length,1);
 app.input({key:'back',action:'short'});await app.advance(0);const frames=app.frames.length;
 app.finishControl({ok:true});await flush();await app.advance(30000);assert.equal(app.frames.length,frames);assert.equal(app.timers.size,0);
});

test('offline watches back off; missing settings and disconnected Wi-Fi do not send controls',async()=>{
 const failed=launch({fail:true});await flush();assert.equal(failed.requests.length,1);
 await failed.advance(1999);assert.equal(failed.requests.length,1);await failed.advance(1);assert.equal(failed.requests.length,2);
 await failed.advance(4000);assert.equal(failed.requests.length,3);
 const offline=launch({wifi:'disconnected'});await flush();offline.input({key:'ok',action:'short'});await flush();assert.equal(offline.requests.length,0);assert.equal(offline.commands.length,0);
 const unset=launch({configured:false});await flush();assert.equal(unset.frames[0][1].text,'Set PC URL');assert.equal(unset.requests.length,0);
});

test('failed controls are never retried automatically',async()=>{
 const app=launch({failControl:true});await flush();await app.advance(100);app.input({key:'ok',action:'short'});await flush();
 await app.advance(60000);assert.equal(app.commands.length,1);
});

test('continuous turning sends its first step immediately and keeps updating without waiting for release',async()=>{
 const app=launch();await flush();await app.advance(100);
 app.input({key:'encoder',action:'clockwise',delta:1});await app.advance(0);
 assert.equal(app.commands.length,1);assert.equal(app.commands[0].at,100);
 for(let i=0;i<10;i++){await app.advance(40);app.input({key:'encoder',action:'clockwise',delta:1});}
 assert.equal(app.commands.length,5);
 for(let i=1;i<app.commands.length;i++)assert.equal(app.commands[i].at-app.commands[i-1].at,100);
});

test('slow drawing coalesces visual updates without blocking volume commands',async()=>{
 const app=launch();await flush();await app.advance(100);app.holdNextDraw();
 app.input({key:'encoder',delta:1});await app.advance(0);
 assert.equal(app.commands.length,1);
 for(let i=0;i<6;i++){app.input({key:'encoder',delta:1});await app.advance(100);}
 assert.ok(app.commands.length>1);
 app.releaseDraw();await flush();await app.advance(0);
 assert.equal(app.maxDisplay(),1);
 app.input({key:'back',action:'short'});await app.advance(0);
 assert.equal(app.timers.size,0);
});


test('each wheel step draws immediately while the PC has not replied',async()=>{
 const app=launch({holdControl:true,volumeStep:5});await flush();await app.advance(100);
 app.input({key:'encoder',delta:1});await flush();
 assert.equal(app.frames.at(-1).find(e=>e.id==='volume-value').text,'65%');
 await app.advance(0);
 app.input({key:'encoder',delta:1});await flush();
 assert.equal(app.frames.at(-1).find(e=>e.id==='volume-value').text,'70%');
 app.finishControl({ok:true,volume:65,frame:volumeFrame(65)});await flush();
 assert.equal(app.frames.at(-1).find(e=>e.id==='volume-value').text,'70%');
 app.input({key:'encoder',delta:-1});await flush();
 assert.equal(app.frames.at(-1).find(e=>e.id==='volume-value').text,'65%');
 app.input({key:'back',action:'short'});await app.advance(0);
});


test('explicit wheel direction takes precedence over an opposite delta sign',async()=>{
 const app=launch({holdControl:true});await flush();await app.advance(100);
 app.input({key:'encoder',action:'clockwise',delta:-1});await flush();
 assert.equal(app.frames.at(-1).find(e=>e.id==='volume-value').text,'65%');
 await app.advance(0);assert.ok(app.commands[0].url.includes('steps=1&'));
 app.input({key:'encoder',action:'counterclockwise',delta:1});await flush();
 assert.equal(app.frames.at(-1).find(e=>e.id==='volume-value').text,'60%');
 app.input({key:'back',action:'short'});await app.advance(0);
 app.finishControl({ok:true,volume:65});await flush();
});


test('track changes wait behind the volume popup and draw only the latest on hide',async()=>{
 const app=launch();await flush();await app.advance(100);
 app.input({key:'encoder',delta:1});await app.advance(0);
 const count=app.frames.length;
 app.push({state:'playing',title:'Hidden one',artist:'Artist'});await flush();
 await app.advance(100);app.push({state:'playing',title:'Hidden latest',artist:'Artist'});await flush();
 assert.equal(app.frames.length,count);
 await app.advance(1500);
 assert.equal(app.frames.at(-1)[0].text,'Hidden latest');
 assert.equal(app.maxDisplay(),1);
 app.input({key:'back',action:'short'});await app.advance(0);
 assert.equal(app.timers.size,0);
});


test('native slider reuses its widgets and only sends changed properties',()=>{
 const {sliderElements,VOLUME_IDS}=volumeContext.volumeTools;
 const first=sliderElements(50,-1);assert.equal(first.length,6);
 assert.deepEqual([...first.map(e=>e.id)].sort(),[...VOLUME_IDS].sort());
 const step=sliderElements(55,50);assert.deepEqual([...step.map(e=>e.id)],['volume-fill','volume-value']);
 assert.equal(step[0].width,40);assert.equal(step[0].border_width,0);
 assert.equal(sliderElements(55,55).length,0);
 const muted=sliderElements(0,5);assert.equal(muted.find(e=>e.id==='volume-fill').fill_colors[0],'#000000FF');
 assert.equal(muted.find(e=>e.id==='volume-left').color,'#808080FF');
 const max=sliderElements(100,95);assert.equal(max.find(e=>e.id==='volume-right').color,'#808080FF');
 assert.ok(max.find(e=>e.id==='volume-icon').path.includes('_100_'));
});


test('manual selection chooses one of two PCs regardless of Wi-Fi name',()=>{
 assert.equal(selectedBridgeUrl({bridge_url:'http://pc1:8765/now-playing'}),'http://pc1:8765/now-playing');
 assert.equal(selectedBridgeUrl({bridge_selection:'2',bridge_url:'http://pc1:8765/now-playing',bridge_url_2:'http://pc2:8765/now-playing'}),'http://pc2:8765/now-playing');
 assert.equal(selectedBridgeUrl({bridge_selection:'3',bridge_url_3:'http://pc3:8765/now-playing'}),'');
 for(const selection of ['2','3','bad'])assert.equal(selectedBridgeUrl({bridge_selection:selection,bridge_url:'http://pc1:8765/now-playing'}),'');
 assert.equal(selectedBridgeUrl(null),'');
});
test('selected bridge receives metadata, controls and cancellation',async()=>{
 const app=launch({addresses:{bridge_selection:'2',bridge_url_2:'http://pc2:8765/now-playing'}});
 await flush();await app.advance(100);assert.ok(app.requests.every(r=>r.url.includes('pc2')));
 app.input({key:'ok',action:'short'});await flush();assert.ok(app.commands[0].url.includes('pc2'));
 await app.advance(100);app.input({key:'back',action:'short'});await app.advance(0);
 assert.ok(app.cancellations[0].includes('pc2'));assert.equal(app.timers.size,0);
});
test('unavailable selected bridge retries itself and never contacts other saved PCs',async()=>{
 const app=launch({addresses:{bridge_selection:'2',bridge_url_2:'http://pc2:8765/now-playing',bridge_url_3:'http://pc3:8765/now-playing'},fail:true});
 await flush();await app.advance(2000);await app.advance(4000);await app.advance(8000);
 assert.equal(app.requests.length,4);assert.ok(app.requests.every(r=>r.url.includes('pc2')));
 app.input({key:'back',action:'short'});await app.advance(0);await app.advance(60000);assert.equal(app.requests.length,4);
});
test('empty selected slot shows setup message without contacting another PC',async()=>{
 const app=launch({addresses:{bridge_selection:'3'}});await flush();
 assert.equal(app.requests.length,0);assert.equal(app.frames[0][1].text,'Set PC URL');
});

test('a transient watch timeout preserves the track and recovers after two seconds',async()=>{
 const app=launch();await flush();await app.advance(100);const frames=app.frames.length;
 app.failWatch();await flush();assert.equal(app.frames.length,frames);
 await app.advance(1999);assert.equal(app.requests.length,2);
 await app.advance(1);assert.equal(app.requests.length,3);assert.equal(app.frames.length,frames);
 app.input({key:'back',action:'short'});await app.advance(0);assert.equal(app.timers.size,0);
});
test('persistent bridge failures eventually show offline and recover without a relaunch',async()=>{
 const app=launch();await flush();await app.advance(100);app.setFail(true);app.failWatch();await flush();
 await app.advance(14000);assert.equal(app.frames[0][0].text,'Song');
 assert.ok(!app.frames.some(frame=>frame.some(e=>e.text==='PC offline')));
 await app.advance(16000);assert.ok(app.frames.some(frame=>frame.some(e=>e.text==='PC offline')));
 app.setFail(false);await app.advance(30000);
 assert.ok(app.frames.at(-1).some(e=>e.text==='Song'));
 app.input({key:'back',action:'short'});await app.advance(0);assert.equal(app.timers.size,0);
});


test('a timeout on the selected bridge preserves metadata but gates controls until recovery',async()=>{
 const app=launch({addresses:{bridge_selection:'2',bridge_url_2:'http://pc2:8765/now-playing',bridge_url_3:'http://pc3:8765/now-playing'}});
 await flush();await app.advance(100);const count=app.frames.length;
 app.failWatch();await flush();
 app.input({key:'ok',action:'short'});app.input({key:'encoder',action:'clockwise',delta:1});await flush();
 assert.equal(app.commands.length,0);assert.equal(app.frames.length,count);
 await app.advance(2000);
 app.input({key:'ok',action:'short'});await flush();assert.equal(app.commands.length,1);
 assert.ok(app.commands[0].url.includes('pc2'));assert.ok(app.requests.every(r=>r.url.includes('pc2')));
 app.input({key:'back',action:'short'});await app.advance(0);assert.equal(app.timers.size,0);
});


test('progress advances only at pixel boundaries with no extra metadata requests',async()=>{
 const app=launch();await flush();await app.advance(100);
 app.push({state:'playing',title:'Timed song',artist:'Artist',position_ms:0,duration_ms:520000});await flush();
 const bar=app.frames.at(-1);assert.equal(bar[0].id,'progress-bg');assert.equal(bar[0].y,15);
 assert.equal(bar[0].x,18);assert.equal(bar[0].height,1);assert.equal(bar[1].fill_colors[0],'#000000FF');
 await app.advance(100);const count=app.frames.length, requests=app.requests.length;
 await app.advance(9899);assert.equal(app.frames.length,count);
 await app.advance(1);assert.equal(app.frames.length,count+1);assert.equal(app.frames.at(-1).length,2);
 assert.equal(app.requests.length,requests);assert.equal(app.maxDisplay(),1);
 app.input({key:'back',action:'short'});await app.advance(0);assert.equal(app.timers.size,0);
});
test('pause, seek, missing duration and the volume popup update progress without queues',async()=>{
 const app=launch();await flush();await app.advance(100);
 app.push({state:'paused',title:'Timed song',artist:'Artist',position_ms:260000,duration_ms:520000});await flush();
 assert.equal(app.frames.at(-1).find(e=>e.id==='progress-fill').width,26);
 const count=app.frames.length;await app.advance(30000);assert.equal(app.frames.length,count);
 app.push({state:'playing',title:'Timed song',artist:'Artist',position_ms:400000,duration_ms:520000});await flush();
 assert.equal(app.frames.at(-1).find(e=>e.id==='progress-fill').width,40);
 app.input({key:'encoder',delta:1});await app.advance(0);const covered=app.frames.length;
 await app.advance(1000);assert.equal(app.frames.length,covered);
 await app.advance(1000);app.push({state:'playing',title:'No timeline',artist:'Artist'});await flush();
 assert.ok(app.clears.some(ids=>ids.includes('progress-bg')));
 app.input({key:'back',action:'short'});await app.advance(0);assert.equal(app.timers.size,0);
});


test('native text layout reserves exactly one blank row after descenders',async()=>{
 const app=launch();await flush();await app.advance(100);
 app.push({state:'playing',title:'Agjpqy',artist:'Agjpqy',position_ms:1000,duration_ms:520000});await flush();
 const elements=app.frames.flat();
 const title=elements.findLast(e=>e.id==='title'), artist=elements.findLast(e=>e.id==='status');
 // Native firmware 1.3.1 measurements for these glyphs, independently captured
 // from /screen: small ink 2..8, tiny ink 1..5, relative to their label y.
 const ink={small:{top:2,bottom:8},tiny:{top:1,bottom:5}};
 assert.equal(artist.y+ink[artist.font].top-(title.y+ink[title.font].bottom)-1,1);
 const progress=elements.findLast(e=>e.id==='progress-bg');
 assert.equal(progress.y-(artist.y+ink[artist.font].bottom)-1,1);
 assert.ok(title.y+ink[title.font].top>=0);
 app.input({key:'back',action:'short'});await app.advance(0);assert.equal(app.timers.size,0);
});


test('two scrolling rows restart together when only one metadata row changes',async()=>{
 const app=launch();await flush();await app.advance(100);
 const title='A'.repeat(35), artist='B'.repeat(25);
 app.push({state:'playing',title,artist});await flush();
 let frame=app.frames.at(-1);assert.equal(frame.length,2);
 assert.equal(frame[0].scroll_start_delay,frame[1].scroll_start_delay);
 const previous=app.clears.length;await app.advance(100);
 app.push({state:'playing',title:'C'.repeat(40),artist});await flush();
 assert.ok(app.clears.slice(previous).some(ids=>ids.includes('title')&&ids.includes('status')));
 frame=app.frames.at(-1);assert.deepEqual([...frame.map(e=>e.id)],['title','status']);
 assert.equal(frame[1].text,artist);assert.equal(frame[0].scroll_rate,frame[1].scroll_rate);
 const count=app.frames.length,clears=app.clears.length;
 await app.advance(100);app.push({state:'playing',title:'C'.repeat(40),artist});await flush();
 assert.equal(app.frames.length,count);assert.equal(app.clears.length,clears);
 app.input({key:'back',action:'short'});await app.advance(0);assert.equal(app.timers.size,0);
});

const mappedAddresses={
 bridge_selection:'2',bridge_url:'http://pc1:8765/now-playing',
 bridge_url_2:'http://pc2:8765/now-playing',
};
test('Wi-Fi name changes do not block the selected PC bridge',async()=>{
 const app=launch({addresses:mappedAddresses});await flush();await app.advance(100);
 assert.ok(app.requests.every(r=>r.url.includes('pc2')));
 const count=app.requests.length;
 assert.ok(count>0);
 app.input({key:'back',action:'short'});await app.advance(0);assert.equal(app.timers.size,0);
});