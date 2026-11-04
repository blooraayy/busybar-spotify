import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createVolumeWorker} from '../companion/volume-worker.mjs';
function fakeProcess(){
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.requests=[];child.killed=0;
 child.stdin.on('data',line=>child.requests.push(JSON.parse(line.toString())));
 child.kill=()=>{child.killed++;child.emit('exit',0);};
 child.reply=data=>child.stdout.write(JSON.stringify(data)+'\n');return child;
}
function fixture(options={}) {
 const children=[];const worker=createVolumeWorker({...options,spawnProcess:()=>{const child=fakeProcess();children.push(child);return child;}});
 return {worker,children};
}

test('the warmed worker serves repeated volume adjustments without spawning again',async t=>{
 const {worker,children}=fixture();t.after(()=>worker.close());
 const first=worker.adjust(-1,5);assert.equal(children[0].requests.length,0);
 children[0].reply({ready:true});assert.deepEqual(children[0].requests[0],{id:1,steps:-1,stepPercent:5});
 children[0].reply({id:1,ok:true,volume:95});assert.equal(await first,95);
 const second=worker.adjust(-1,10);children[0].reply({id:2,ok:true,volume:85});assert.equal(await second,85);assert.equal(children.length,1);
});
test('only one request is pending and Spotify errors do not kill the warmed worker',async t=>{
 const {worker,children}=fixture();t.after(()=>worker.close());children[0].reply({ready:true});
 const pending=worker.adjust(1,5);const rejected=assert.rejects(pending,/control failed/);
 await assert.rejects(worker.adjust(1,5),/busy/);children[0].reply({id:1,ok:false});await rejected;
 const next=worker.adjust(-1,5);children[0].reply({id:2,ok:true,volume:20});assert.equal(await next,20);assert.equal(children.length,1);
});
test('timeouts kill the uncertain worker and never replay an old command',async t=>{
 let now=0;const {worker,children}=fixture({timeoutMs:15,now:()=>now});t.after(()=>worker.close());children[0].reply({ready:true});
 await assert.rejects(worker.adjust(1,5),/timed out/);assert.equal(children[0].killed,1);
 await assert.rejects(worker.adjust(1,5),/unavailable/);now=1001;
 const next=worker.adjust(-1,3);children[1].reply({ready:true});assert.deepEqual(children[1].requests,[{id:2,steps:-1,stepPercent:3}]);
 children[1].reply({id:2,ok:true,volume:17});assert.equal(await next,17);
});
test('abort holds the slot until confirmation, and close releases pending work',async()=>{
 const {worker,children}=fixture();children[0].reply({ready:true});const controller=new AbortController();
 const pending=worker.adjust(1,5,controller.signal);const rejected=assert.rejects(pending,/aborted/);controller.abort();await rejected;
 await assert.rejects(worker.adjust(1,5),/busy/);children[0].reply({id:1,ok:true,volume:50});
 const next=worker.adjust(1,5);const stopped=assert.rejects(next,/stopped/);worker.close();await stopped;assert.equal(children[0].killed,1);
});
