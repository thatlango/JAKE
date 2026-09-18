'use strict';
const express=require('express');

function config(){
  const base=String(process.env.TUKU_CORE_INTERNAL_URL||process.env.TUKU_CORE_URL||'http://tuku-core-api:3000').replace(/\/$/,'');
  const secret=String(process.env.TUKU_ESTATE_INSIGHTS_SECRET||'');
  return{base,secret,configured:!!(base&&secret)};
}

async function coreGet(pathname,params){
  const cfg=config();
  if(!cfg.configured)throw Object.assign(new Error('Tuku Core account directory is not configured'),{status:503});
  const url=new URL(`${cfg.base}/api/v1/internal/jakeos/accounts${pathname}`);
  for(const[key,value]of Object.entries(params||{}))if(value!==undefined&&value!==null&&String(value)!=='')url.searchParams.set(key,String(value));
  const response=await fetch(url,{headers:{'x-tuku-insights-key':cfg.secret,accept:'application/json'},signal:AbortSignal.timeout(10000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=body?.message||body?.error?.message||body?.error||`Tuku Core returned ${response.status}`;
    throw Object.assign(new Error(String(message)),{status:response.status});
  }
  return body?.data||body;
}

const accountsRouter=express.Router();
accountsRouter.get('/',async(req,res)=>{
  try{
    const params={
      search:String(req.query.search||'').slice(0,120),
      status:String(req.query.status||'').slice(0,24),
      product:String(req.query.product||'').slice(0,80),
      role:String(req.query.role||'').slice(0,80),
      activity:String(req.query.activity||'').slice(0,24),
      limit:Math.max(1,Math.min(250,Number.parseInt(req.query.limit,10)||100)),
      offset:Math.max(0,Number.parseInt(req.query.offset,10)||0),
    };
    res.set('Cache-Control','no-store').json(await coreGet('',params));
  }catch(error){res.status(error.status||502).json({error:error.message||'Account directory unavailable'});}
});
accountsRouter.get('/reconciliation',async(req,res)=>{
  try{res.set('Cache-Control','no-store').json(await coreGet('/reconciliation'));}
  catch(error){res.status(error.status||502).json({error:error.message||'Access reconciliation unavailable'});}
});

accountsRouter.get('/:coreUserId',async(req,res)=>{
  const id=String(req.params.coreUserId||'').slice(0,64);
  try{res.set('Cache-Control','no-store').json(await coreGet(`/${encodeURIComponent(id)}`));}
  catch(error){res.status(error.status||502).json({error:error.message||'Account detail unavailable'});}
});

module.exports={accountsRouter};
