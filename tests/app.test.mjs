import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { bridgeUrl, playbackLines, playbackCover, displayText } from '../shared/now-playing.js';
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));
function launch({ wifi = 'connected', fail = false, configured = true, pending = null } = {}) {
  const timers = new Map(); let next = 0; let handler; let unbound = 0; let fetches = 0;
  const frames = []; const clears = []; const delays = []; let track = { state: 'playing', title: 'Song', artist: 'Artist' };
  const context = { manifest: { id: 'app.test' }, bridgeUrl, playbackLines, playbackCover,
    loadValues: async () => ({ bridge_url: configured ? 'http://192.168.1.10:8765/now-playing' : '' }),
    row: (_, children) => children, column: (_, children) => children, render: value => value.flat(Infinity),
    device: { WifiStatusGet: async () => ({ state: wifi }), DisplayDraw: async frame => frames.push(frame.elements), DisplayClear: async frame => clears.push(frame.element_ids) },
    fetch: async () => { fetches++; if (pending) return pending; if (fail) throw Error('offline'); return { ok: true, json: async () => track }; },
    listen: (_, fn) => { handler = fn; return () => unbound++; },
    setTimeout: (fn, delay) => { const id = ++next; timers.set(id, fn); delays.push(delay); return id; },
    clearTimeout: id => timers.delete(id), console: { error() {} },
  };
  vm.runInNewContext(source, context);
  return { timers, frames, clears, delays, setTrack: value => { track = value; }, fetches: () => fetches, unbound: () => unbound,
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

test('cover updates independently, disappears once, and leaves text at x=18', async () => {
 const { coverXpm } = await import('../companion/cover.mjs');
 const cover = coverXpm('ff0000'.repeat(256));
 assert.equal(playbackCover({state:'playing', cover}), cover);
 assert.equal(playbackCover({state:'playing', cover:cover.replace('16 16 1 1','72 16 1 1')}), '');
 assert.equal(playbackCover({state:'idle', cover}), '');
 const app = launch(); await flush();
 assert.ok(app.frames[0].every(element => element.x === 18 && element.width === 54));
 app.setTrack({state:'playing',title:'Song',artist:'Artist',cover}); await app.tick();
 assert.equal(app.frames[1].length,1); assert.equal(app.frames[1][0].id,'cover');
 await app.tick(); assert.equal(app.frames.length,2);
 app.setTrack({state:'playing',title:'Song',artist:'Artist'}); await app.tick();
 assert.deepEqual(Array.from(app.clears[0]), ['cover']); assert.equal(app.frames.length,2);
 await app.tick(); assert.equal(app.clears.length,1);
});

test('thumbnail quantization stays within firmware palette and payload limits', async () => {
 const { coverXpm } = await import('../companion/cover.mjs');
 assert.equal(coverXpm('bad'), '');
 const rgb = Array.from({length:768}, (_,i) => (i % 256).toString(16).padStart(2,'0')).join('');
 const cover = coverXpm(rgb);
 assert.ok(cover.length < 900); assert.equal(playbackCover({state:'paused', cover}), cover);
});
