import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function createSettingsHandler({ service, port, publicRoot }) {
  const token = randomBytes(24).toString('hex');
  const assets = { '/settings': ['settings.html', 'text/html; charset=utf-8'], '/settings.js': ['settings.js', 'text/javascript; charset=utf-8'], '/settings.css': ['settings.css', 'text/css; charset=utf-8'] };
  const send = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' });
    res.end(JSON.stringify(value));
  };
  return function handle(req, res) {
    if (!Object.hasOwn(assets, req.url) && !['/settings/data','/settings/apply','/settings/job'].includes(req.url)) return false;
    const host = req.headers.host;
    const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const allowedHost = [`localhost:${port}`,`127.0.0.1:${port}`,`[::1]:${port}`].includes(host);
    if (!local || !allowedHost || (req.headers.origin && req.headers.origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') {
      send(res, 403, { error: 'Abre esta página desde http://localhost:' + port + '/settings en este PC.' }); return true;
    }
    void (async () => {
      if (req.method === 'GET' && Object.hasOwn(assets, req.url)) {
        const [name, type] = assets[req.url];
        const data = await readFile(join(publicRoot, name));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", Connection: 'close' });
        res.end(data); return;
      }
      if (req.method === 'GET' && req.url === '/settings/data') { send(res, 200, { ...await service.read(), token }); return; }
      if (req.method === 'GET' && req.url === '/settings/job') { send(res, 200, service.snapshot()); return; }
      if (req.method === 'POST' && req.url === '/settings/apply') {
        const provided = Buffer.from(req.headers['x-busybar-settings'] || '');
        if (provided.length !== token.length || !timingSafeEqual(provided, Buffer.from(token))) { send(res,403,{error:'Recarga la página antes de aplicar.'}); return; }
        if (!req.headers['content-type']?.startsWith('application/json')) { send(res,415,{error:'Se requiere JSON.'}); return; }
        if (service.snapshot().state === 'running') { send(res,409,{error:'Ya hay una actualización en curso.'}); return; }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4096) { send(res,413,{error:'La configuración es demasiado grande.'}); return; }
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { send(res,400,{error:'La configuración no es válida.'}); return; }
        try { send(res,202,service.apply(input)); }
        catch (error) { send(res,400,{error:error.message}); }
        return;
      }
      send(res,405,{error:'Método no permitido.'});
    })().catch(error => {
      console.error('busybar-spotify settings: ' + error.message);
      if (!res.headersSent) send(res,500,{error:'No se pudo cargar la configuración. Comprueba el proyecto y el USB.'});
      else res.destroy();
    });
    return true;
  };
}
