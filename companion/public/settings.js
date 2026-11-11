const form=document.querySelector('#settings-form');
const fields=document.querySelector('#fields');
const active=document.querySelector('#active');
const connection=document.querySelector('#connection');
const progress=document.querySelector('#progress');
const progressLabel=document.querySelector('#progress-label');
const submit=document.querySelector('#submit');
const reload=document.querySelector('#reload');
let token='',busy=false,polling=false;
const names=[],addresses=[],cards=[];

for(let i=0;i<2;i++){
  const card=document.createElement('article');card.className='card';cards.push(card);
  const slot=document.createElement('p');slot.className='slot';slot.textContent='PUENTE 0'+(i+1);card.append(slot);
  for(const [kind,label,placeholder,list] of [
    ['name','Nombre','Ej. PC del salón',names],['address','Dirección del PC','Ej. 192.168.1.20',addresses],
  ]){
    const id=kind+'-'+i;
    const caption=document.createElement('label');caption.htmlFor=id;caption.textContent=label;
    const input=document.createElement('input');input.id=id;input.type='text';input.maxLength=kind==='name'?24:200;input.placeholder=placeholder;input.autocomplete='off';input.spellcheck=false;
    list.push(input);card.append(caption,input);
  }
  const hint=document.createElement('p');hint.className='hint';hint.textContent='IP, nombre de equipo o URL HTTP. Puerto 8765 por defecto.';card.append(hint);
  names[i].addEventListener('input',updateSelection);
  document.querySelector('#devices').append(card);
  const option=document.createElement('option');option.value=String(i+1);active.append(option);
}
function updateSelection(){
  for(let i=0;i<2;i++){
    active.options[i].textContent=names[i].value.trim()||'Puente '+(i+1);
    cards[i].classList.toggle('active',active.value===String(i+1));
  }
}
active.addEventListener('change',updateSelection);
function setBusy(value){busy=value;fields.disabled=value;submit.disabled=value||!token;reload.disabled=value;}
function show(message,error=false){progress.hidden=false;progress.classList.toggle('error',error);progressLabel.textContent=message;}
async function api(path,options){
  const response=await fetch(path,options),data=await response.json();
  if(!response.ok)throw new Error(data.error||'No se pudo completar la solicitud.');
  return data;
}
async function load(){
  setBusy(true);
  try{
    const data=await api('/settings/data');token=data.token;
    data.devices.forEach((entry,i)=>{names[i].value=entry.name;addresses[i].value=entry.url;});
    active.value=data.active;updateSelection();
    connection.textContent=data.message||'● Barra detectada por USB · Configuración cargada';
    connection.classList.toggle('offline',!data.connected);
  }catch(error){show(error.message,true);}
  finally{setBusy(false);}
}
async function poll(){
  if(polling)return;polling=true;
  try{
    while(true){
      const job=await api('/settings/job');
      if(job.state==='idle'){setBusy(false);break;}
      show(job.message,job.state==='error');setBusy(job.state==='running');
      if(job.state!=='running'){if(job.state==='success')await load();break;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
  }catch{show('Se ha perdido la conexión con el puente. Recarga la página para consultar el resultado; no vuelvas a aplicar todavía.',true);setBusy(false);}
  finally{polling=false;}
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  setBusy(true);show('Preparando la actualización…');
  try{
    const devices=names.map((input,i)=>({name:input.value,url:addresses[i].value}));
    await api('/settings/apply',{method:'POST',headers:{'Content-Type':'application/json','X-Busybar-Settings':token},body:JSON.stringify({devices,active:active.value})});
    await poll();
  }catch(error){show(error.message,true);setBusy(false);}
});
reload.addEventListener('click',async()=>{await load();await poll();});
await load();await poll();
