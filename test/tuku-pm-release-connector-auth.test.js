'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const original=Module._load;
const router=()=>({get(){},post(){},patch(){},delete(){},put(){}});
Module._load=function(request,parent,...rest){
  if(parent?.filename?.endsWith('/server/agent-control.js')){
    if(request==='express')return{Router:router};
    if(request==='./db')return {};
  }
  return original.call(this,request,parent,...rest);
};
let auth;
try{auth=require('../server/agent-control').authenticateAgentConnector;}
finally{Module._load=original;}
const e={
  JAKEOS_AGENT_CONNECTOR_TOKEN:'synthetic-primary-1234567890',
  TUKU_PM_CONNECTOR_TOKEN:'synthetic-observer-1234567890',
  TUKU_PM_RELEASE_CONNECTOR_TOKEN:'synthetic-release-1234567890'
};
function evaluate(token,method,path){
  const previous={};
  for(const [k,v]of Object.entries(e)){previous[k]=process.env[k];process.env[k]=v;}
  let answer={};
  const req={method,path,headers:{authorization:'Bearer '+token},get(name){return this.headers[name.toLowerCase()]}};
  const res={status(code){answer.status=code;return this;},json(data){answer.data=data;return this;}};
  let forwarded=false;
  try{auth(req,res,()=>{forwarded=true;});return{forwarded,principal:req.agentPrincipal,status:answer.status,data:answer.data};}
  finally{for(const [k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
test('release bearer permits verified acceptance route only',()=>{
  const r=evaluate(e.TUKU_PM_RELEASE_CONNECTOR_TOKEN,'POST','/work/dispatch_123/accept-verified');
  assert.equal(r.forwarded,true);
  assert.equal(r.principal.id,'tuku-pm-release');
  assert.deepEqual(r.principal.scopes,['agents:work:accept-verified']);
  for(const [method,path] of [['GET','/work'],['POST','/work/dispatch_123/claim'],['POST','/runs'],['POST','/work/dispatch_123/result']]){
    const denied=evaluate(e.TUKU_PM_RELEASE_CONNECTOR_TOKEN,method,path);
    assert.equal(denied.status,403);
    assert.equal(denied.forwarded,false);
  }
});
test('observer bearer is unable to accept release, and invalid bearer fails',()=>{
  const denial=evaluate(e.TUKU_PM_CONNECTOR_TOKEN,'POST','/work/dispatch_123/accept-verified');
  assert.equal(denial.status,403);
  const observer=evaluate(e.TUKU_PM_CONNECTOR_TOKEN,'GET','/work');
  assert.equal(observer.forwarded,true);
  assert.equal(observer.principal.id,'tuku-pm-ovh');
  assert.equal(evaluate('unrecognised-token','POST','/work/dispatch_123/accept-verified').status,401);
});
test('legacy primary connector remains operational',()=>{
  const allowed=evaluate(e.JAKEOS_AGENT_CONNECTOR_TOKEN,'GET','/work');
  assert.equal(allowed.forwarded,true);
  assert.equal(allowed.principal.id,'tuku-agent-os');
});
