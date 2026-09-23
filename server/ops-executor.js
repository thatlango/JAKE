'use strict';

function config(){
  const base=String(process.env.JAKEOS_OPS_EXECUTOR_URL||'').trim().replace(/\/$/,'');
  const token=String(process.env.JAKEOS_OPS_EXECUTOR_TOKEN||'').trim();
  return{base,token,configured:Boolean(base&&token)};
}
async function requestAction(action,params={}){
  const cfg=config();
  if(!cfg.configured)throw Object.assign(new Error('Ops executor is not configured'),{status:503});
  const r=await fetch(cfg.base+'/v1/actions',{method:'POST',headers:{Authorization:`Bearer ${cfg.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:String(action||'').slice(0,120),params}),signal:AbortSignal.timeout(30000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d.error||`Ops executor returned HTTP ${r.status}`),{status:r.status});
  return d;
}
module.exports={config,requestAction};
