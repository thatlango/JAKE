'use strict';
const express=require('express');
const {momentumAuth}=require('./momentum-auth');

const cache={snapshot:null,fetchedAt:0,error:null,products:new Map()};
const TTL_MS=Number(process.env.ESTATE_CACHE_TTL_MS||60000);

function config(){
  const base=String(process.env.TUKU_CORE_URL||'').replace(/\/$/,'');
  const secret=String(process.env.TUKU_ESTATE_INSIGHTS_SECRET||'');
  return{base,secret,configured:!!(base&&secret)};
}

async function coreGet(pathname){
  const cfg=config();
  if(!cfg.configured)throw new Error('Tuku Core estate insights are not configured');
  const response=await fetch(`${cfg.base}/api/v1/internal/estate-insights/${pathname}`,{
    headers:{'x-tuku-insights-key':cfg.secret,'accept':'application/json'},
    signal:AbortSignal.timeout(8000)
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.message||payload?.error?.message||`Tuku Core returned ${response.status}`);
  return payload?.data||payload;
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
    const snapshot=await coreGet('snapshot');
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
    telemetry:snapshot.telemetry||[],
    totals:snapshot.totals||{},
    measurement:snapshot.measurement||{},
    generatedAt:snapshot.generatedAt||null
  };
}

function fallbackProductDetail(snapshot,productCode){
  if(!snapshot)return null;
  const code=String(productCode||'').trim().toLowerCase();
  const product=(snapshot.products||[]).find(row=>String(row.code||'').toLowerCase()===code);
  if(!product)return null;
  return{
    product,
    usageTrend:(snapshot.usageTrend||[]).filter(row=>String(row.productCode||'').toLowerCase()===code),
    commerce:(snapshot.commerce||[]).filter(row=>String(row.productCode||'').toLowerCase()===code),
    telemetry:(snapshot.telemetry||[]).find(row=>String(row.productCode||'').toLowerCase()===code)||null,
    operations:{eventTypes:[],sourceTables:[]},
    measurement:snapshot.measurement||{},
    generatedAt:snapshot.generatedAt||null,
    degraded:true
  };
}

async function fetchProductSnapshot(productCode,{force=false}={}){
  const code=String(productCode||'').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,80);
  if(!code)return{configured:config().configured,available:false,stale:false,detail:null,error:'Product code is required'};
  const cached=cache.products.get(code),now=Date.now();
  if(!force&&cached&&now-cached.fetchedAt<TTL_MS){
    return{configured:true,available:true,stale:false,detail:cached.detail,lastSuccessfulAt:new Date(cached.fetchedAt).toISOString(),source:'cache'};
  }
  try{
    const detail=await coreGet(`products/${encodeURIComponent(code)}`);
    if(!detail?.product)throw new Error('Tuku Core returned an invalid product telemetry snapshot');
    const fetchedAt=Date.now();cache.products.set(code,{detail,fetchedAt});
    return{configured:true,available:true,stale:false,detail,lastSuccessfulAt:new Date(fetchedAt).toISOString(),source:'tuku-core'};
  }catch(error){
    if(cached)return{configured:true,available:true,stale:true,detail:cached.detail,lastSuccessfulAt:new Date(cached.fetchedAt).toISOString(),error:error.message,source:'cache'};
    const estate=await fetchEstateSnapshot({force});
    const detail=fallbackProductDetail(estate.snapshot,code);
    return{configured:estate.configured,available:!!detail,stale:true,detail,lastSuccessfulAt:estate.lastSuccessfulAt,error:error.message,source:detail?'estate-fallback':null};
  }
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
estateRouter.get('/products/:productCode',async(req,res)=>{
  const result=await fetchProductSnapshot(req.params.productCode,{force:req.query.refresh==='1'});
  res.status(result.available?200:result.configured?404:503).json(result);
});

const momentumEstateRouter=express.Router();
momentumEstateRouter.use(momentumAuth());
momentumEstateRouter.get('/',async(req,res)=>{
  const result=await fetchEstateSnapshot({force:req.query.refresh==='1'});
  res.status(result.available?200:503).json({...result,snapshot:compactEstate(result.snapshot)});
});
momentumEstateRouter.get('/products/:productCode',async(req,res)=>{
  const result=await fetchProductSnapshot(req.params.productCode,{force:req.query.refresh==='1'});
  res.status(result.available?200:result.configured?404:503).json(result);
});

module.exports={estateRouter,momentumEstateRouter,fetchEstateSnapshot,fetchProductSnapshot,compactEstate};
