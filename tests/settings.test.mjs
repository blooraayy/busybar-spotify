import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createSettingsService, normalizeAddress, validateConfiguration, namedSchema } from '../companion/settings-service.mjs';
import { createSettingsHandler } from '../companion/settings-http.mjs';

const configuration = () => ({ active: '2', devices: [{name:'Casa',url:'192.168.1.200'}, {name:'Mi portátil',url:'172.20.10.3'}] });
const originalSchema = JSON.parse(await readFile(new URL('../src/appmeta/settings.json',import.meta.url),'utf8'));
test('friendly addresses normalize, invalid selections and unsafe URLs are rejected',()=>{
  assert.equal(normalizeAddress(' 172.20.10.3 '),'http://172.20.10.3:8765/now-playing');
  assert.equal(normalizeAddress('http://pc:9000/now-playing'),'http://pc:9000/now-playing');
  for(const url of ['https://pc','http://user:pass@pc','http://pc/other','http://pc?token=x'])assert.throws(()=>normalizeAddress(url));
  for(const update of [{active:'4'}, {active:'3'}, {devices:[{name:'Only',url:'pc'}]}])assert.throws(()=>validateConfiguration({...configuration(),...update}));
  const input=configuration(); input.devices[1].name='Casa'; assert.throws(()=>validateConfiguration(input),/distinto/);
  const data=validateConfiguration(configuration()); const schema=namedSchema(originalSchema,data);
  assert.equal(schema.fields.bridge_wifi_ssid,undefined);
  assert.equal(schema.fields.bridge_selection.options[1].label,'Mi portátil');
  assert.equal(schema.version,originalSchema.version);
  assert.notEqual(originalSchema.fields.bridge_selection.options[1].label,'Mi portátil');
});

async function fixture(t,{failBuild=false,failInstall=false,failSave=false,gate=null}={}) {
  const root=await mkdtemp(join(tmpdir(),'busybar-settings-test-'));
  // root is created directly in the OS temporary directory for this test only.
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const directory of ['src/appmeta','shared','types','node_modules'])await mkdir(join(root,directory),{recursive:true});
  await writeFile(join(root,'src/appmeta/settings.json'),JSON.stringify(originalSchema));
  for(const file of ['package.json','jsconfig.json','tsconfig.json'])await writeFile(join(root,file),'{}');
  let settings={version:1,values:{bridge_url:'http://old:8765/now-playing',bridge_url_2:'',bridge_url_3:'',bridge_selection:'1',volume_step:17}};
  const events=[], schemas=[];
  const request=async(path,method='GET',body)=>{
    events.push({path,method,body});
    if(path==='/api/version')return {api_semver:'27.14.0'};
    if(method==='PUT') { if(failSave)throw new Error('USB lost'); settings=structuredClone(body); }
    return structuredClone(settings);
  };
  const service=createSettingsService({root,request,run:async(script,args,cwd)=>{
    if(gate)await gate;
    if(failBuild)throw new Error('Build failed');
    schemas.push(JSON.parse(await readFile(join(cwd,'src/appmeta/settings.json'),'utf8')));
  },install:async()=>{events.push({path:'install'});if(failInstall)throw new Error('Install failed');}});
  async function finish(){for(let i=0;i<500&&service.snapshot().state==='running';i++)await new Promise(resolve=>setTimeout(resolve,5));assert.notEqual(service.snapshot().state,'running');return service.snapshot();}
  return {root,service,events,schemas,finish};
}
test('apply compiles names, preserves native volume, verifies settings and launches',async t=>{
  const f=await fixture(t);f.service.apply(configuration());const job=await f.finish();assert.equal(job.state,'success',job.message);
  const put=f.events.find(event=>event.method==='PUT');assert.equal(put.body.values.volume_step,17);assert.equal(put.body.values.bridge_selection,'2');
  assert.equal(put.body.values.bridge_url_2,'http://172.20.10.3:8765/now-playing');
  assert.equal(f.schemas[0].fields.bridge_selection.options[1].label,'Mi portátil');
  const current=await f.service.read();assert.equal(current.devices[1].name,'Mi portátil');assert.equal(current.active,'2');
  assert.ok(f.events.some(event=>event.path.includes('/launch') && event.method === 'POST'));
  const backup=JSON.parse(await readFile(join(f.root,'.busybar-config/previous-settings.json'),'utf8'));assert.equal(backup.values.bridge_selection,'1');
});
test('compile or install failure never writes device settings or source schema',async t=>{
  for(const options of [{failBuild:true},{failInstall:true}]){
    const f=await fixture(t,options);f.service.apply(configuration());assert.equal((await f.finish()).state,'error');
    assert.ok(!f.events.some(event=>event.method==='PUT'));
    assert.deepEqual(JSON.parse(await readFile(join(f.root,'src/appmeta/settings.json'),'utf8')),originalSchema);
  }
});
test('partial deployment reports recovery and single-job lock prevents parallel installs',async t=>{
  const failed=await fixture(t,{failSave:true});failed.service.apply(configuration());assert.match((await failed.finish()).message,/ya se instaló/);
  let release;const gate=new Promise(resolve=>release=resolve);
  const f=await fixture(t,{gate});f.service.apply(configuration());assert.throws(()=>f.service.apply(configuration()),/curso/);release();assert.equal((await f.finish()).state,'success');
});
test('settings HTTP requires local host, same origin and token before applying',async t=>{
  let applied=0, handler;
  const server=createServer((req,res)=>handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;const base=`http://127.0.0.1:${port}`;
  handler=createSettingsHandler({port,publicRoot:fileURLToPath(new URL('../companion/public',import.meta.url)),service:{read:async()=>({devices:[]}),snapshot:()=>({state:'idle'}),apply:()=>{applied++;return {state:'running'};}}});
  const html=await fetch(base+'/settings');assert.equal(html.status,200);assert.match(await html.text(),/type="module"/);
  const data=await (await fetch(base+'/settings/data')).json();
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
  assert.equal((await fetch(base+'/settings/apply',options)).status,403);
  options.headers['X-Busybar-Settings']=data.token;options.headers.Origin='https://untrusted.example';
  assert.equal((await fetch(base+'/settings/apply',options)).status,403);delete options.headers.Origin;
  assert.equal((await fetch(base+'/settings/apply',options)).status,202);assert.equal(applied,1);
  let rejectedHost=0;
  handler({url:'/settings/data',headers:{host:'untrusted.example'},socket:{remoteAddress:'127.0.0.1'}},{writeHead(status){rejectedHost=status;},end(){}});
  assert.equal(rejectedHost,403);
  const fake={url:'/settings',headers:{host:`localhost:${port}`},socket:{remoteAddress:'172.20.10.7'}};
  let code=0;handler(fake,{writeHead(status){code=status;},end(){}});assert.equal(code,403);
});

test('a different PC reads names from the installed bar instead of its own checkout',async t=>{
  const root=await mkdtemp(join(tmpdir(),'busybar-roaming-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src/appmeta'),{recursive:true});await writeFile(join(root,'src/appmeta/settings.json'),JSON.stringify(originalSchema));
  const installed=namedSchema(originalSchema,validateConfiguration(configuration()));
  const service=createSettingsService({root,request:async path=>path.includes('/storage/read')?installed:{values:{bridge_selection:'2',bridge_url_2:'http://pc:8765/now-playing'}}});
  const data=await service.read();assert.equal(data.devices[1].name,'Mi portátil');assert.equal(data.active,'2');assert.equal(data.connected,true);
});

test('configuration requires two valid bridge addresses',()=>{
 const data=configuration();const valid=validateConfiguration(data);assert.equal(valid.active,'2');
 const tooMany={...data,devices:[...data.devices,{name:'Otro',url:'pc'}]};assert.throws(()=>validateConfiguration(tooMany));
 const missing={...data,devices:[data.devices[0],{...data.devices[1],url:''}]};assert.throws(()=>validateConfiguration(missing));
});
test('deployment stores bridge URLs while preserving volume',async t=>{
 const f=await fixture(t);f.service.apply(configuration());const job=await f.finish();assert.equal(job.state,'success',job.message);
 const saved=f.events.find(event=>event.method==='PUT').body.values;
 assert.equal(saved.bridge_wifi_ssid,undefined);assert.equal(saved.bridge_url_2,'http://172.20.10.3:8765/now-playing');
 assert.equal(saved.bridge_url_3,undefined);assert.equal(saved.bridge_2_ssid_1,undefined);assert.equal(saved.volume_step,17);
 assert.equal(f.schemas[0].fields.bridge_selection.options.length,2);
 assert.equal(f.schemas[0].fields.bridge_wifi_ssid,undefined);
});
