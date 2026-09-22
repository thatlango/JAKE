'use strict';
const crypto=require('crypto');
const db=require('./db');
const {sendAlert}=require('./alerts');
const {fetchSearchConsoleStatus}=require('./search-console');

function statusFingerprint(status){
  const material={
    bridgeConfigured:status.bridgeConfigured,
    available:status.available,
    searchConsoleConfigured:status.searchConsoleConfigured,
    productsConfigured:status.productsConfigured,
    alerts:(status.alerts||[]).map(alert=>({code:alert.code,severity:alert.severity,summary:alert.summary}))
  };
  return crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex');
}

async function readPreviousState(){
  const row=await db.get('settings',{eq:{key:'search_console_health_state'}});
  if(!row?.value)return null;
  try{return JSON.parse(row.value);}catch{return null;}
}

async function persistState(state){
  await db.insert('settings',{
    key:'search_console_health_state',
    value:JSON.stringify(state),
    updated_at:new Date().toISOString()
  },true);
}

async function checkSearchConsoleHealth({notify=true}={}){
  const status=await fetchSearchConsoleStatus({force:true});
  const nextFingerprint=statusFingerprint(status);
  const previous=await readPreviousState();
  const alertCount=(status.alerts||[]).length;
  const changed=previous?.fingerprint!==nextFingerprint;
  let notified=false;

  if(changed&&notify){
    if(alertCount){
      const lines=[
        'Search Console health changed','',
        ...status.alerts.map(alert=>(alert.severity==='critical'?'CRITICAL':'WARNING')+': '+alert.title+' — '+alert.summary),
        '',
        'Configured estate products: '+Number(status.productsConfigured||0),
        'Open JakeOS → Tuku Estate for the current state.'
      ];
      await sendAlert({message:lines.join('\n'),subject:'JakeOS — Search Console health',channels:['telegram','email']});
      notified=true;
    }else if(previous&&Number(previous.alertCount||0)>0){
      await sendAlert({
        message:'Search Console recovered. The estate health check is clear across '+Number(status.productsConfigured||0)+' configured products.',
        subject:'JakeOS — Search Console recovered',
        channels:['telegram','email']
      });
      notified=true;
    }
  }

  await persistState({fingerprint:nextFingerprint,alertCount,checkedAt:new Date().toISOString()});
  return{...status,changed,notified};
}

module.exports={checkSearchConsoleHealth,statusFingerprint};
