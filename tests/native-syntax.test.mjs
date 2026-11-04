import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('Windows companion PowerShell scripts parse successfully',{skip:process.platform!=='win32'},()=>{
 execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./parse-powershell.ps1',import.meta.url)),'-Root',fileURLToPath(new URL('../companion',import.meta.url))],{windowsHide:true});
});
