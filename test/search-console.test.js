'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  fetchSearchConsoleStatus,
  deriveSearchConsoleAlerts,
  resetSearchConsoleCache
}=require('../server/search-console');

const original={
  base:process.env.TUKU_CORE_INTERNAL_URL,
  url:process.env.TUKU_CORE_URL,
  key:process.env.TUKU_CORE_SEARCH_CONSOLE_KEY
};

function restore(){
  for(const [name,value] of [
    ['TUKU_CORE_INTERNAL_URL',original.base],
    ['TUKU_CORE_URL',original.url],
    ['TUKU_CORE_SEARCH_CONSOLE_KEY',original.key]
  ]){
    if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
  resetSearchConsoleCache();
}

test.afterEach(restore);

test('Search Console status fails closed without the dedicated Core key',async()=>{
  process.env.TUKU_CORE_INTERNAL_URL='http://tuku-core-api:3000';
  delete process.env.TUKU_CORE_SEARCH_CONSOLE_KEY;
  let called=false;
  const status=await fetchSearchConsoleStatus({force:true,fetcher:async()=>{called=true;throw new Error('must not call Core');}});
  assert.equal(called,false);
  assert.equal(status.bridgeConfigured,false);
  assert.equal(status.available,false);
  assert.equal(status.alerts[0].code,'search_console_bridge_not_configured');
});

test('Search Console status reports Core readiness without inventing Google data',async()=>{
  process.env.TUKU_CORE_INTERNAL_URL='http://tuku-core-api:3000';
  process.env.TUKU_CORE_SEARCH_CONSOLE_KEY='search-console-test-key-1234567890';
  const calls=[];
  const fetcher=async(url,init)=>{
    calls.push({url:String(url),headers:init?.headers});
    return {
      ok:true,status:200,
      async json(){return{data:{
        configured:false,
        enabled:false,
        mutationsEnabled:false,
        credentialsConfigured:false,
        productsConfigured:19,
        products:[{productCode:'impactos',siteUrl:'sc-domain:tukutuku.org',urlPrefix:'https://impactos.tukutuku.org/'}]
      }};}
    };
  };
  const status=await fetchSearchConsoleStatus({force:true,fetcher});
  assert.equal(status.bridgeConfigured,true);
  assert.equal(status.available,true);
  assert.equal(status.searchConsoleConfigured,false);
  assert.equal(status.productsConfigured,19);
  assert.equal(calls.length,1);
  assert.equal(calls[0].headers['x-tuku-search-key'],'search-console-test-key-1234567890');
  assert.ok(status.alerts.some(alert=>alert.code==='google_search_console_credentials_missing'));
});

test('Search Console alerts flag only unavailable product feeds when Core is configured',()=>{
  const alerts=deriveSearchConsoleAlerts({
    bridgeConfigured:true,
    available:true,
    coreHealth:{configured:true,enabled:true,credentialsConfigured:true,productsConfigured:3},
    summary:{
      products:[
        {productCode:'impactos',available:true},
        {productCode:'bds',available:false,error:'upstream denied'},
        {productCode:'ops',available:true}
      ]
    }
  });
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].code,'search_console_product_feed_unavailable');
  assert.match(alerts[0].summary,/bds/);
});
