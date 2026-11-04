import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Windows thumbnail resizing preserves solid colors at all edges', {skip:process.platform!=='win32'},()=>{
 execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./thumbnail-edges.ps1',import.meta.url))],{windowsHide:true,timeout:15000});
});
