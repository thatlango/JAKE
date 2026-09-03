'use strict';
const express=require('express');
const {momentumAuth}=require('./momentum-auth');

const cache={snapshot:null,fetchedAt:0,error:null};
const TTL_MS=Number(process.env.ESTATE_CACHE_TTL_MS||60000);

function config(){
  const base=String(process.env.TUKU_CORE_URL||'').replace(/\/$/,'');
  const secret=String(process.env.TUKU_ESTATE_INSIGHTS_SECRET||'');
  return{base,secret,configured:!!(base&&secret)};
}

async function fetchEstateSnapshot({force=false}={}){
  const now=Date.now(),cfg=config();
  if(!cfg.configured){
    return{configured:false,available:false,stale:!!cache.snapshot,snapshot:cache.snapshot,lastSuccessfulAt:cache.fetchedAt?new Date(cache.fetchedAt).toISOString():null,error:'Tuku Core estate insights are not configured'};
  }
  if(!force&&cache.snapshot&&now-cache.fetchedAt<TTL_MS){
    return{configured:true,available:true,stale:false,snapshot:cache.snapshot,lastSuccessfulAt:new Date(cache.fetchedAt).toISOString(),source:'cache'};
  }
  try{
    const response=await fetch(`${cfg.base}/api/v1/internal/estate-insights/snapshot`,{
      headers:{'x-tuku-insights-key':cfg.secret,'accept':'application/json'},
      signal:AbortSignal.timeout(8000)
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload?.message||payload?.error?.message||`Tuku Core returned ${response.status}`);
    // Tuku Core wraps controller responses in { success, data, ... }.
    const snapshot=payload?.data||payload;
    if(!snapshot||!Array.isArray(snapshot.products))throw new Error('Tuku Core returned an invalid estate snapshot');
    cache.snapshot=snapshot;cache.fetchedAt=Date.now();cache.error=null;
    return{configured:true,available:true,stale:false,snapshot,lastSuccessfulAt:new Date(cache.fetchedAt).toISOString(),source:'tuku-core'};
  }catch(error){
    cache.error=error.message;
    return{configured:true,available:!!cache.snapshot,stale:!!cache.snapshot,snapshot:cache.snapshot,lastSuccessfulAt:cache.fetchedAt?new Date(cache.fetchedAt).toISOString():null,error:error.message};
  }
}

function compactEstate(snapshot){
  if(!snapshot)return null;
  return{
    products:snapshot.products||[],
    usageTrend:snapshot.usageTrend||[],
    commerce:snapshot.commerce||[],
    totals:snapshot.totals||{},
    measurement:snapshot.measurement||{},
    generatedAt:snapshot.generatedAt||null
  };
}

const estateRouter=express.Router();
estateRouter.get('/',async(req,res)=>{
  const result=await fetchEstateSnapshot({force:req.query.refresh==='1'});
  res.status(result.available?200:503).json({...result,snapshot:compactEstate(result.snapshot)});
});
estateRouter.get('/health',async(_,res)=>{
  const result=await fetchEstateSnapshot();
  res.status(result.available?200:503).json({configured:result.configured,available:result.available,stale:result.stale,lastSuccessfulAt:result.lastSuccessfulAt,error:result.error||null});
});

const momentumEstateRouter=express.Router();
momentumEstateRouter.use(momentumAuth());
momentumEstateRouter.get('/',async(req,res)=>{
  const result=await fetchEstateSnapshot({force:req.query.refresh==='1'});
  res.status(result.available?200:503).json({...result,snapshot:compactEstate(result.snapshot)});
});

module.exports={estateRouter,momentumEstateRouter,fetchEstateSnapshot,compactEstate};
