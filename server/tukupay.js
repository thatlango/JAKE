'use strict';
const express=require('express');

function config(){
  const base=String(process.env.TUKUPAY_BASE_URL||'').trim().replace(/\/$/,'');
  const token=String(process.env.TUKUPAY_TOKEN||'').trim();
  return{base,token,configured:Boolean(base&&token)};
}

async function tukuPay(path,{method='GET'}={}){
  const cfg=config();
  if(!cfg.configured){
    const error=new Error('TukuPay is not configured for JakeOS');
    error.status=503;
    throw error;
  }
  const response=await fetch(`${cfg.base}${path}`,{
    method,
    headers:{Authorization:`Bearer ${cfg.token}`,Accept:'application/json'},
    signal:AbortSignal.timeout(10000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(payload?.error?.message||`TukuPay returned HTTP ${response.status}`);
    error.status=response.status;
    error.code=payload?.error?.code;
    throw error;
  }
  return payload;
}

const tukuPayRouter=express.Router();

tukuPayRouter.get('/summary',async(_,res)=>{
  try{
    const cfg=config();
    if(!cfg.configured)return res.status(503).json({configured:false,error:'TukuPay is not connected to JakeOS yet.'});
    const [health,summary]=await Promise.all([
      fetch(`${cfg.base}/health`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)})
        .then(r=>r.json()).catch(()=>({status:'unknown'})),
      tukuPay('/v1/ops/summary'),
    ]);
    res.json({configured:true,health,ops:summary.ops??summary});
  }catch(error){
    res.status(error.status||502).json({configured:true,error:error.message||'TukuPay operations unavailable',code:error.code});
  }
});

module.exports={tukuPayRouter};
