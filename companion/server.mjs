import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { volumeFrame } from './volume-frame.mjs';
import { coverXpm } from './cover.mjs';
import { playbackCommand, adjustVolume } from './control.mjs';

if (process.platform !== 'win32') throw new Error('This companion requires Windows 10/11.');
const port = Number(process.env.BUSYBAR_SPOTIFY_PORT || 8765);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid bridge port.');
let latest = { state: 'error', title: '', artist: '' };
let updated = 0;
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
    latest = { state: data.state, title: String(data.title || '').slice(0, 120), artist: String(data.artist || '').slice(0, 120), cover };
    updated = Date.now();
  } catch { console.error('busybar-spotify: invalid Windows media response'); }
});
reader.stderr.on('data', (data) => process.stderr.write(data));
const server = createServer((req, res) => {
  const volume = /^\/playback\/volume\?steps=(-?(?:[1-9]|10))$/.exec(req.url || '');
  if (req.method === 'POST' && (volume || req.url === '/playback/toggle' || req.url === '/playback/next')) {
    // Browsers cannot submit controls with a cross-origin form or simple fetch.
    if (req.headers.origin || req.headers['x-busybar-control'] !== '1') { res.writeHead(403).end(); return; }
    if (control) { res.writeHead(409).end(); return; }
    control = new AbortController();
    const operation = volume ? adjustVolume(Number(volume[1]), control.signal) : playbackCommand(req.url === '/playback/next' ? 'next' : 'toggle', control.signal);
    void operation.then(state => {
      if (state === 'playing' || state === 'paused') latest = { ...latest, state };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(volume ? { ok: true, volume: state, frame: volumeFrame(state) } : { ok: true }));
    }).catch(() => {
      console.error('busybar-spotify: playback control failed');
      if (!res.destroyed) res.writeHead(503).end();
    }).finally(() => { control = null; });
    return;
  }
  if (req.method !== 'GET' || req.url !== '/now-playing') { res.writeHead(404).end(); return; }
  const current = Date.now() - updated < 20000 ? latest : { state: 'error', title: '', artist: '' };
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(current));
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.maxConnections = 8;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  control?.abort();
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
