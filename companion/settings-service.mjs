import { cp, mkdir, mkdtemp, readFile, writeFile, rename, symlink, rm, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { bridgeUrl } from '../shared/now-playing.js';

const execute = promisify(execFile);
const KEYS = ['bridge_url', 'bridge_url_2'];
const APP = 'app.blooraayy.busybar-spotify';
const DEVICE = 'http://10.0.4.20';

export function normalizeAddress(value) {
  if (typeof value !== 'string' || value.length > 200) throw new Error('La dirección es demasiado larga.');
  let text = value.trim();
  if (!text) return '';
  if (!text.includes('://')) text = `http://${text}`;
  let parsed;
  try { parsed = new URL(text); } catch { throw new Error('La dirección no es válida.'); }
  if (!parsed.port) parsed.port = '8765';
  if (parsed.pathname === '/') parsed.pathname = '/now-playing';
  const url = bridgeUrl(parsed.href);
  if (!url) throw new Error('Usa una IP o una URL HTTP del puente, sin contraseña ni parámetros.');
  return url;
}

export function validateConfiguration(input) {
  if (!input || !Array.isArray(input.devices) || input.devices.length !== 2 || !['1','2'].includes(input.active)) {
    throw new Error('Selecciona uno de los dos puentes.');
  }
  const devices=input.devices.map((entry,index)=>{
    if (!entry || typeof entry.name !== 'string' || entry.name.trim().length > 24 || /[\x00-\x1f\x7f]/.test(entry.name)) {
      throw new Error('El nombre del puente no es válido.');
    }
    return {name:entry.name.trim() || 'Puente '+(index+1),url:normalizeAddress(entry.url)};
  });
  if (new Set(devices.map(entry=>entry.name.toLowerCase())).size !== 2) throw new Error('Elige nombres distintos para los puentes.');
  if (!devices[Number(input.active)-1].url) throw new Error('Añade una dirección al puente seleccionado.');
  return {devices,active:input.active};
}

export function namedSchema(schema, configuration) {
  const copy=structuredClone(schema);
  configuration.devices.forEach((device,index)=>{
    copy.fields[KEYS[index]].label='Dirección · '+device.name;
  });
  copy.fields.bridge_selection.label='Puente activo';
  copy.fields.bridge_selection.options=configuration.devices.map((device,index)=>({value:String(index+1),label:device.name}));
  return copy;
}

export function createSettingsService({ root, request = deviceRequest, run = runNode, install = installPackage } = {}) {
  const schemaPath = join(root, 'src/appmeta/settings.json');
  const cache = join(root, '.busybar-config');
  let job = { state: 'idle', message: 'Listo para configurar.' };
  const snapshot = () => ({ ...job });
  const schema = async () => JSON.parse(await readFile(schemaPath, 'utf8'));

  async function read() {
    let source=await schema(),settings,connected=true,message='';
    try {
      settings=await request('/api/apps/settings?app_id='+APP);
      try {
        const path='/ext/user_assets/'+APP+'/appmeta/settings.json';
        const installed=await request('/api/storage/read?path='+encodeURIComponent(path));
        if(installed?.fields?.bridge_selection?.options)source=installed;
      } catch { message='Barra conectada. No se pudieron leer los nombres instalados; se muestran los de este proyecto.'; }
    } catch {
      connected=false;message='No se puede leer la barra. Conéctala por USB y pulsa Recargar.';
      try { settings=JSON.parse(await readFile(join(cache,'last-settings.json'),'utf8')); } catch { settings={values:{}}; }
    }
    const values=settings.values||{};
    const active=['1','2'].includes(values.bridge_selection)?values.bridge_selection:'1';
    const devices=KEYS.map((key,index)=>{
      const option=source.fields.bridge_selection.options.find(item=>item.value===String(index+1));
      return {name:option?.label||'Puente '+(index+1),url};
    });
    return {connected,message,devices,active};
  }



  function apply(input) {
    if (job.state === 'running') throw new Error('Ya hay una actualización en curso.');
    const configuration = validateConfiguration(input);
    job = { state: 'running', message: 'Comprobando la barra conectada por USB…' };
    // Keep deployment alive if the browser closes. Only one job can run at once.
    void deploy(configuration).catch(error => {
      job = { state: 'error', message: error.message };
    });
    return snapshot();
  }

  async function deploy(configuration) {
    let stage;
    let installed = false;
    try {
      await request('/api/version');
      const saved = await request(`/api/apps/settings?app_id=${APP}`);
      if (saved.version !== 1 || !saved.values || !Number.isInteger(saved.values.volume_step)) throw new Error('La configuración de Spotify en la barra no es compatible.');
      const source = await schema();
      const updated = namedSchema(source, configuration);
      await mkdir(cache, { recursive: true });
      // Save the complete previous document before any device changes.
      await writeFile(join(cache, 'previous-settings.json'), JSON.stringify(saved, null, 2));
      stage = await mkdtemp(join(cache, 'build-'));
      for (const file of ['src', 'shared', 'types', 'package.json', 'jsconfig.json', 'tsconfig.json']) {
        await cp(join(root, file), join(stage, file), { recursive: true });
      }
      await symlink(resolve(root, 'node_modules'), join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      await writeFile(join(stage, 'src/appmeta/settings.json'), JSON.stringify(updated, null, 2) + '\n');
      job.message = 'Comprobando y compilando los nuevos ajustes…';
      await run(join(root, 'node_modules/typescript/bin/tsc'), ['--project', 'jsconfig.json'], stage);
      await run(join(root, 'node_modules/@busy-app/cli/dist/index.js'), ['build'], stage);
      // Re-read immediately before install so edits made in the native UI while building are preserved.
      const current = await request(`/api/apps/settings?app_id=${APP}`);
      const next = { version: current.version, values: { ...current.values, bridge_selection: configuration.active } };
      KEYS.forEach((key,index) => { next.values[key] = configuration.devices[index].url; });
      for (const key of Object.keys(next.values)) {
        if (/^bridge_[123]_(ssid|url)_[12]$/.test(key) || key === 'bridge_url_3' || key === 'bridge_wifi_ssid') delete next.values[key];
      }
      await writeFile(join(cache, 'previous-settings.json'), JSON.stringify(current, null, 2));
      job.message = 'Instalando en BUSY Bar. La música de Spotify seguirá sonando…';
      await install(join(stage, 'dist', `${APP}.tgz`), request);
      installed = true;
      job.message = 'Guardando direcciones y selección…';
      await request(`/api/apps/settings?app_id=${APP}`, 'PUT', next);
      const verified = await request(`/api/apps/settings?app_id=${APP}`);
      if (JSON.stringify(verified.values) !== JSON.stringify(next.values)) {
        // Firmware may reorder fields. Compare values by key.
        if (Object.keys(next.values).some(key => verified.values[key] !== next.values[key])) throw new Error('La barra no ha confirmado todos los ajustes.');
      }
      await writeFile(schemaPath + '.tmp', JSON.stringify(updated, null, 2) + '\n');
      await rename(schemaPath + '.tmp', schemaPath);
      await writeFile(join(cache, 'last-settings.json'), JSON.stringify(verified, null, 2));
      await request(`/api/apps/launch?app_id=${APP}`, 'POST');
      job = { state: 'success', message: 'Aplicado. Los nombres ya aparecen en los ajustes nativos de BUSY Bar.' };
    } catch (error) {
      const detail = installed ? 'La app ya se instaló, pero falta completar la configuración. Vuelve a aplicar. ' : 'No se ha completado la actualización. ';
      throw new Error(detail + error.message);
    } finally {
      if (stage && resolve(stage).startsWith(resolve(cache) + (process.platform === 'win32' ? '\\' : '/'))) {
        // Unlink the dependency junction first; never traverse the real node_modules.
        await unlink(join(stage, 'node_modules')).catch(() => {});
        await rm(stage, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
  return { read, apply, snapshot };
}

async function deviceRequest(path, method = 'GET', document) {
  const response = await fetch(DEVICE + path, { method, signal: AbortSignal.timeout(60000),
    ...(document ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(document) } : {}) });
  if (!response.ok) throw new Error(`BUSY Bar respondió HTTP ${response.status}. Comprueba el USB y vuelve a intentarlo.`);
  return response.json();
}

async function runNode(script, args, cwd) {
  try { await execute(process.execPath, [script, ...args], { cwd, windowsHide: true, timeout: 120000, maxBuffer: 128 * 1024 }); }
  catch (error) { throw new Error('La compilación falló. Revisa las dependencias y el proyecto. ' + String(error.stderr || error.stdout || error.message).slice(-500)); }
}

async function installPackage(path, request) {
  const response = await fetch(DEVICE + '/api/apps/stage', { method: 'POST', body: await readFile(path),
    headers: { 'Content-Type': 'application/octet-stream' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`No se pudo enviar la app (HTTP ${response.status}).`);
  const staged = await response.json();
  if (!Number.isInteger(staged.install_key)) throw new Error('La barra no devolvió una clave de instalación válida.');
  await request(`/api/apps/install?install_key=${staged.install_key}`, 'POST');
}
