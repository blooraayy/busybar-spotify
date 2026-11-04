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
