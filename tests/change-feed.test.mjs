import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createChangeFeed} from '../companion/change-feed.mjs';
class Response extends EventEmitter {
 destroyed=false;status=0;headers={};body='';
 writeHead(status,headers){this.status=status;this.headers=headers;return this;}
 end(body){this.body=body||'';}
}
const request=(client='device',tag='"1"')=>({headers:{'x-busybar-client':client,'x-busybar-wait':'1','if-none-match':tag}});

test('a change wakes the pending response and unchanged metadata does not',()=>{
 let snapshot={tag:'"1"',data:{title:'Old'}};
 const feed=createChangeFeed(()=>snapshot);const res=new Response();feed.get(request(),res);
 assert.equal(feed.size,1);assert.equal(res.status,0);feed.notify();assert.equal(res.status,0);
 snapshot={tag:'"2"',data:{title:'New'}};feed.notify();assert.equal(res.status,200);assert.equal(JSON.parse(res.body).title,'New');assert.equal(feed.size,0);assert.equal(res.listenerCount('close'),0);feed.close();
});
test('unchanged requests time out with an empty 304 and release their timer',async()=>{
 const feed=createChangeFeed(()=>({tag:'"1"',data:{}}),{timeoutMs:20});const res=new Response();feed.get(request(),res);
 await new Promise(resolve=>setTimeout(resolve,35));assert.equal(res.status,304);assert.equal(res.body,'');assert.equal(feed.size,0);feed.close();
});
test('cancellation releases the wait and also covers cancel-before-register races',()=>{
 const feed=createChangeFeed(()=>({tag:'"1"',data:{}}));const res=new Response();feed.get(request(),res);feed.cancel('device');assert.equal(res.status,204);assert.equal(feed.size,0);
 const late=new Response();feed.get(request(),late);assert.equal(late.status,204);assert.equal(feed.size,0);feed.close();
});
test('disconnect, capacity, and shutdown do not leak subscriptions',()=>{
 const feed=createChangeFeed(()=>({tag:'"1"',data:{}}),{maxWaiters:1});const a=new Response(),b=new Response();feed.get(request('a'),a);feed.get(request('b'),b);assert.equal(b.status,503);assert.equal(feed.size,1);
 a.destroyed=true;a.emit('close');assert.equal(feed.size,0);
 const c=new Response();feed.get(request('c'),c);feed.close();assert.equal(c.status,204);assert.equal(feed.size,0);
});
