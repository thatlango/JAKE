'use strict';
const express=require('express');

const CACHE_TTL_MS=Math.max(30000,Number(process.env.SEARCH_CONSOLE_CACHE_TTL_MS||300000));
const cache={value:null,fetchedAt:0};

function config(){
  const base=String(process.env.TUKU_CORE_INTERNAL_URL||process.env.TUKU_CORE_URL||'').replace(/\/$/,'');
  const key=String(process.env.TUKU_CORE_SEARCH_CONSOLE_KEY||'');
  return{base,key,configured:!!(base&&key&&key.length>=24)};
}

function messageFrom(payload,status){
  if(typeof payload?.error==='string')return payload.error;
  if(typeof payload?.error?.message==='string')return payload.error.message;
  if(typeof payload?.message==='string')return payload.message;
  return 'Tuku Core Search Console returned '+status;
}

async function coreRequest(pathname,{fetcher=global.fetch}={}){
  const cfg=config();
  if(!cfg.configured)throw new Error('JakeOS Search Console bridge is not configured');
  const response=await fetcher(cfg.base+'/api/v1/internal/search-console/'+pathname,{
    headers:{'x-tuku-search-key':cfg.key,'accept':'application/json'},
    signal:AbortSignal.timeout(10000)
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(messageFrom(payload,response.status));
  return payload?.data||payload;
}

function deriveSearchConsoleAlerts({bridgeConfigured,available,coreHealth,summary,error}){
  const alerts=[];
  if(!bridgeConfigured){
    alerts.push({code:'search_console_bridge_not_configured',severity:'warning',title:'Search Console bridge not configured',summary:'JakeOS does not have its dedicated Tuku Core Search Console key.'});
    return alerts;
  }
  if(!available){
    alerts.push({code:'search_console_core_unavailable',severity:'critical',title:'Search Console health unavailable',summary:error||'JakeOS could not reach the Tuku Core Search Console service.'});
    return alerts;
  }
  if(!coreHealth?.credentialsConfigured)alerts.push({code:'google_search_console_credentials_missing',severity:'warning',title:'Google Search Console credentials missing',summary:'Tuku Core is ready, but the Google service-account credential has not been provisioned.'});
  if(coreHealth?.enabled===false)alerts.push({code:'google_search_console_disabled',severity:'warning',title:'Search Console integration disabled',summary:'Tuku Core has Search Console disabled. Enable it only after Google credentials and property access are verified.'});
  if(Number(coreHealth?.productsConfigured||0)===0)alerts.push({code:'search_console_product_mappings_missing',severity:'warning',title:'No Search Console product mappings',summary:'No estate products are mapped to an approved Search Console property and URL scope.'});
  const unavailable=(summary?.products||[]).filter(product=>product?.available===false);
  if(unavailable.length){
    const names=unavailable.slice(0,6).map(product=>product.productCode).filter(Boolean);
    alerts.push({code:'search_console_product_feed_unavailable',severity:'warning',title:unavailable.length+' Search Console product feed'+(unavailable.length===1?' is':'s are')+' unavailable',summary:names.join(', ')+(unavailable.length>names.length?' and others':'')+' need attention.'});
  }
  return alerts;
}

function compactSummary(summary){
  if(!summary)return null;
  return{
    days:Number(summary.days||28),
    products:Array.isArray(summary.products)?summary.products.map(product=>({
      productCode:product.productCode,siteUrl:product.siteUrl,urlPrefix:product.urlPrefix,
      available:product.available!==false,totals:product.totals||null,error:product.error||null
    })):[],
    generatedAt:summary.generatedAt||null
  };
}

async function fetchSearchConsoleStatus({days=28,force=false,fetcher=global.fetch}={}){
  const now=Date.now();
  if(!force&&fetcher===global.fetch&&cache.value&&now-cache.fetchedAt<CACHE_TTL_MS)return{...cache.value,source:'cache'};
  const cfg=config();
  if(!cfg.configured){
    const value={bridgeConfigured:false,available:false,searchConsoleConfigured:false,productsConfigured:0,coreHealth:null,summary:null,error:'JakeOS Search Console bridge is not configured',generatedAt:new Date().toISOString()};
    value.alerts=deriveSearchConsoleAlerts(value);
    if(fetcher===global.fetch){cache.value=value;cache.fetchedAt=Date.now();}
    return value;
  }
  try{
    const coreHealth=await coreRequest('health',{fetcher});
    let summary=null;
    if(coreHealth?.configured===true)summary=await coreRequest('estate-summary?days='+Math.max(1,Math.min(480,Number(days)||28)),{fetcher});
    const value={bridgeConfigured:true,available:true,searchConsoleConfigured:coreHealth?.configured===true,productsConfigured:Number(coreHealth?.productsConfigured||0),coreHealth,summary:compactSummary(summary),error:null,generatedAt:new Date().toISOString()};
    value.alerts=deriveSearchConsoleAlerts({...value,summary});
    if(fetcher===global.fetch){cache.value=value;cache.fetchedAt=Date.now();}
    return value;
  }catch(error){
    const value={bridgeConfigured:true,available:false,searchConsoleConfigured:false,productsConfigured:0,coreHealth:null,summary:null,error:error.message,generatedAt:new Date().toISOString()};
    value.alerts=deriveSearchConsoleAlerts(value);
    if(fetcher===global.fetch){cache.value=value;cache.fetchedAt=Date.now();}
    return value;
  }
}

function resetSearchConsoleCache(){cache.value=null;cache.fetchedAt=0;}

const searchConsoleRouter=express.Router();
searchConsoleRouter.get('/health',async(req,res)=>{
  const status=await fetchSearchConsoleStatus({force:req.query.refresh==='1'});
  res.status(status.available||!status.bridgeConfigured?200:503).json(status);
});
searchConsoleRouter.get('/summary',async(req,res)=>{
  const status=await fetchSearchConsoleStatus({days:req.query.days,force:req.query.refresh==='1'});
  res.status(status.available||!status.bridgeConfigured?200:503).json(status);
});

module.exports={searchConsoleRouter,fetchSearchConsoleStatus,deriveSearchConsoleAlerts,resetSearchConsoleCache};
