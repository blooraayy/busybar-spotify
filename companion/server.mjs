import { createChangeFeed } from './change-feed.mjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { volumeFrame } from './volume-frame.mjs';
import { coverXpm } from './cover.mjs';
import { createTimeline } from './timeline.mjs';
import { createSettingsService } from './settings-service.mjs';
import { createSettingsHandler } from './settings-http.mjs';
import { playbackCommand, adjustVolume, parseVolumeRequest, startVolumeWorker, stopVolumeWorker } from './control.mjs';

if (process.platform !== 'win32') throw new Error('This companion requires Windows 10/11.');
startVolumeWorker();
const port = Number(process.env.BUSYBAR_SPOTIFY_PORT || 8765);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid bridge port.');
const settingsHandler = createSettingsHandler({
  service: createSettingsService({ root: fileURLToPath(new URL('../', import.meta.url)) }), port,
  publicRoot: fileURLToPath(new URL('./public/', import.meta.url)),
});
let latest = { state: 'error', title: '', artist: '' };
let updated = 0;
let revision = 0;
const timeline = createTimeline();
const feed = createChangeFeed(() => {
  const fresh = Date.now() - updated < 40000;
  return { tag: fresh ? `"${revision}"` : '"stale"', data: fresh ? {...latest, ...timeline.snapshot()} : {state:'error',title:'',artist:''} };
});
function publish(next, timing) {
  const seek = timing ? timeline.update(timing, next.state) : (timeline.setState(next.state), false);
  const changed = seek || next.state !== latest.state || next.title !== latest.title || next.artist !== latest.artist || next.cover !== latest.cover;
  if (changed) revision++;
  latest = next;
  updated = Date.now();
  if (changed) feed.notify();
}
let lastRgb = ''; let cover = '';
let control = null;
const reader = spawn('powershell.exe', [
  '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-File', fileURLToPath(new URL('./read-media.ps1', import.meta.url)),
], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const lines = createInterface({ input: reader.stdout });
lines.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if (!['playing', 'paused', 'idle', 'error'].includes(data.state)) return;
    const rgb = typeof data.cover_rgb === 'string' && data.cover_rgb.length === 1536 ? data.cover_rgb : '';
    if (rgb !== lastRgb) { cover = coverXpm(rgb); lastRgb = rgb; }
    publish({ state: data.state, title: String(data.title || '').slice(0, 120), artist: String(data.artist || '').slice(0, 120), cover }, data);
    updated = Date.now();
  } catch { console.error('busybar-spotify: invalid Windows media response'); }
});
reader.stderr.on('data', (data) => process.stderr.write(data));
const server = createServer((req, res) => {
  if (settingsHandler(req, res)) return;
  if (req.method === 'POST' && req.url === '/playback/cancel-wait') {
    if (req.headers.origin || req.headers['x-busybar-control'] !== '1') { res.writeHead(403).end(); return; }
    feed.cancel(req.headers['x-busybar-client']);
    res.writeHead(204, {Connection:'close'}).end(); return;
  }
  const volume = parseVolumeRequest(req.url);
  if (req.method === 'POST' && (volume || req.url === '/playback/toggle' || req.url === '/playback/next')) {
    // Browsers cannot submit controls with a cross-origin form or simple fetch.
    if (req.headers.origin || req.headers['x-busybar-control'] !== '1') { res.writeHead(403).end(); return; }
    if (control) { res.writeHead(409).end(); return; }
    control = new AbortController();
    const operation = volume ? adjustVolume(volume.steps, control.signal, volume.stepPercent) : playbackCommand(req.url === '/playback/next' ? 'next' : 'toggle', control.signal);
    void operation.then(state => {
      if (state === 'playing' || state === 'paused') publish({ ...latest, state });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(volume ? { ok: true, volume: state, frame: volumeFrame(state) } : { ok: true }));
    }).catch(() => {
      console.error('busybar-spotify: playback control failed');
      if (!res.destroyed) res.writeHead(503).end();
    }).finally(() => { control = null; });
    return;
  }
  if (req.method !== 'GET' || req.url !== '/now-playing') { res.writeHead(404).end(); return; }
  feed.get(req, res);
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.maxConnections = 8;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  control?.abort();
  stopVolumeWorker();
  feed.close();
  process.exitCode = code;
  lines.close();
  reader.kill();
  server.close();
  server.closeAllConnections();
}
reader.on('error', (error) => { console.error(`busybar-spotify: ${error.message}`); stop(1); });
reader.on('exit', () => { if (!stopping) { console.error('busybar-spotify: Windows media reader stopped'); stop(1); } });
server.on('error', (error) => { console.error(`busybar-spotify: ${error.message}`); stop(1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
server.listen(port, '0.0.0.0', () => {
  console.log('Spotify bridge running. Keep this terminal open; Ctrl+C stops it.');
  console.log('Set Bridge URL in the BUSY Bar app settings to a LAN address:');
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`  http://${address.address}:${port}/now-playing`);
    }
  }
});
