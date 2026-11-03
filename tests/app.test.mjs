import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { bridgeUrl, playbackLines, displayText } from '../shared/now-playing.js';
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));
function launch({ wifi = 'connected', fail = false, configured = true, pending = null } = {}) {
  const timers = new Map(); let next = 0; let handler; let unbound = 0; let fetches = 0;
  const frames = []; const delays = []; let track = { state: 'playing', title: 'Song', artist: 'Artist' };
  const context = { manifest: { id: 'app.test' }, bridgeUrl, playbackLines,
    loadValues: async () => ({ bridge_url: configured ? 'http://192.168.1.10:8765/now-playing' : '' }),
    column: (_, children) => children, render: value => value,
    device: { WifiStatusGet: async () => ({ state: wifi }), DisplayDraw: async frame => frames.push(frame.elements) },
    fetch: async () => { fetches++; if (pending) return pending; if (fail) throw Error('offline'); return { ok: true, json: async () => track }; },
    listen: (_, fn) => { handler = fn; return () => unbound++; },
    setTimeout: (fn, delay) => { const id = ++next; timers.set(id, fn); delays.push(delay); return id; },
    clearTimeout: id => timers.delete(id), console: { error() {} },
  };
  vm.runInNewContext(source, context);
  return { timers, frames, delays, setTrack: value => { track = value; }, fetches: () => fetches, unbound: () => unbound,
    input: event => handler(event), async tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); await flush(); } };
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
test('unchanged track is not redrawn; Back cancels polling and unbinds later', async () => {
 const app = launch(); await flush(); assert.equal(app.frames.length, 1);
 await app.tick(); assert.equal(app.fetches(), 2); assert.equal(app.frames.length, 1);
 app.input({ key: 'back', action: 'press' }); assert.equal(app.timers.size, 1);
 app.input({ key: 'back', action: 'short' }); assert.equal(app.unbound(), 0);
 assert.equal(app.timers.size, 1); await app.tick(); assert.equal(app.unbound(), 1); assert.equal(app.timers.size, 0);
});
test('offline Wi-Fi skips bridge requests; errors use bounded backoff', async () => {
 const offline = launch({ wifi: 'connecting' }); await flush(); assert.equal(offline.fetches(), 0); assert.equal(offline.delays.at(-1), 30000);
 const failed = launch({ fail: true }); await flush(); assert.equal(failed.delays.at(-1), 20000);
 await failed.tick(); assert.equal(failed.delays.at(-1), 40000);
 await failed.tick(); assert.equal(failed.delays.at(-1), 60000);
 await failed.tick(); assert.equal(failed.delays.at(-1), 60000);
});
test('exit during pending fetch never draws or schedules another poll', async () => {
 let finish; const pending = new Promise(resolve => finish = resolve);
 const app = launch({ pending }); await flush(); assert.equal(app.timers.size, 0);
 app.input({ key: 'back', action: 'short' }); await app.tick();
 finish({ ok: true, json: async () => ({ state: 'playing' }) }); await flush();
 assert.equal(app.frames.length, 0); assert.equal(app.timers.size, 0);
});
test('missing URL shows configuration screen without polling', async () => {
 const app = launch({ configured: false }); await flush(); assert.equal(app.fetches(), 0); assert.equal(app.timers.size, 0);
 assert.equal(app.frames[0][1].text, 'Set PC URL');
});

test('only the changed row is sent and positions remain fixed', async () => {
 const app = launch(); await flush();
 app.setTrack({ state: 'playing', title: 'New song', artist: 'Artist' });
 await app.tick(); assert.equal(app.frames[1].length, 1); assert.equal(app.frames[1][0].id, 'title'); assert.equal(app.frames[1][0].y, 0);
 app.setTrack({ state: 'playing', title: 'New song', artist: 'New artist' });
 await app.tick(); assert.equal(app.frames[2].length, 1); assert.equal(app.frames[2][0].id, 'status'); assert.equal(app.frames[2][0].y, 9);
});
