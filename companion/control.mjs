import { createVolumeWorker } from './volume-worker.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
export async function playbackCommand(command, signal) {
  if (command !== "toggle" && command !== "next") throw new Error("Unknown playback command");
  const { stdout } = await run('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', fileURLToPath(new URL('./read-media.ps1', import.meta.url)),
    '-Once', command === 'next' ? '-SkipNext' : '-TogglePlayPause',
  ], { windowsHide: true, timeout: 15000, maxBuffer: 2048, signal });
  const result = JSON.parse(stdout);
  if (result.ok !== true) throw new Error('Spotify playback control failed');
  return result.state;
}

export function parseVolumeRequest(url) {
  const match = /^\/playback\/volume\?steps=(-?(?:[0-9]|10))(?:&step_percent=([1-9][0-9]?|100))?$/.exec(url || '');
  return match ? {steps:Number(match[1]), stepPercent:match[2] ? Number(match[2]) : 5} : null;
}

let volumeWorker = null;
export function startVolumeWorker() { if (!volumeWorker) volumeWorker = createVolumeWorker(); }
export function stopVolumeWorker() { volumeWorker?.close(); volumeWorker = null; }

export async function adjustVolume(steps, signal, stepPercent = 5) {
  if (!Number.isInteger(stepPercent) || stepPercent < 1 || stepPercent > 100) throw new Error('Invalid volume percentage');
  if (!Number.isInteger(steps) || Math.abs(steps) > 10) throw new Error('Invalid volume steps');
  startVolumeWorker();
  return volumeWorker.adjust(steps, stepPercent, signal);
}
