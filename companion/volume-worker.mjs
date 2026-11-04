import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export function createVolumeWorker({ spawnProcess = spawn, timeoutMs = 5000, now = Date.now } = {}) {
  let child = null, lines = null, ready = false, stopped = false, nextStart = 0, serial = 0, pending = null;
  function settle(error, value) {
    if (!pending) return;
    const request = pending;
    pending = null;
    clearTimeout(request.timer);
    request.signal?.removeEventListener('abort', request.abort);
    if (error) request.reject(error); else request.resolve(value);
  }
  function send() {
    if (!ready || !pending || pending.sent) return;
    pending.sent = true;
    child.stdin.write(JSON.stringify({ id: pending.id, steps: pending.steps, stepPercent: pending.stepPercent }) + '\n');
  }
  function start() {
    if (stopped || child || now() < nextStart) return;
    const process = spawnProcess('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', fileURLToPath(new URL('./volume.ps1', import.meta.url)), '-Worker',
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child = process;
    lines = createInterface({ input: process.stdout });
    lines.on('line', line => {
      if (child !== process || stopped) return;
      try {
        const result = JSON.parse(line);
        if (result.ready === true) { ready = true; send(); return; }
        if (!pending || result.id !== pending.id) return;
        if (result.ok !== true || !Number.isInteger(result.volume) || result.volume < 0 || result.volume > 100) {
          settle(new Error('Spotify volume control failed')); return;
        }
        settle(null, result.volume);
      } catch { settle(new Error('Invalid volume worker response')); }
    });
    process.stderr.on('data', () => {});
    const fail = () => {
      if (child !== process) return;
      lines.close(); child = null; ready = false; nextStart = now() + 1000;
      process.kill();
      settle(new Error('Spotify volume worker stopped'));
    };
    process.on('error', fail);
    process.on('exit', fail);
    process.stdin.on('error', fail);
  }
  function adjust(steps, stepPercent, signal) {
    if (!Number.isInteger(steps) || Math.abs(steps) > 10 || !Number.isInteger(stepPercent) || stepPercent < 1 || stepPercent > 100) return Promise.reject(new Error('Invalid volume request'));
    if (stopped || signal?.aborted) return Promise.reject(new Error('Volume worker stopped'));
    if (pending) return Promise.reject(new Error('Volume worker busy'));
    start();
    if (!child) return Promise.reject(new Error('Volume worker unavailable'));
    return new Promise((resolve, reject) => {
      const abort = () => {
        // Do not accept another request until the already-sent one settles.
        reject(new Error('Volume command aborted'));
      };
      const timer = setTimeout(() => {
        // An uncertain command is never replayed on a new worker.
        const failed = child;
        lines?.close(); child = null; ready = false; nextStart = now() + 1000;
        settle(new Error('Volume command timed out'));
        failed?.kill();
      }, timeoutMs);
      pending = { id: ++serial, steps, stepPercent, signal, abort, timer, resolve, reject, sent: false };
      signal?.addEventListener('abort', abort, { once: true });
      send();
    });
  }
  function close() {
    stopped = true;
    settle(new Error('Volume worker stopped'));
    lines?.close();
    const process = child;
    child = null; ready = false;
    process?.kill();
  }
  start();
  return { adjust, close };
}
