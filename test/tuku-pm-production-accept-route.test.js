'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const crypto=require('node:crypto');
const key='synthetic-independent-release-signer-min32';
const dispatch={
  id:'dispatch_accept01',work_item_id:'work_accept01',run_id:'run_accept01',
  requested_agent_id:'tuku-pm',requested_agent_name:'Tuku-PM',deliverable_type:'implementation',
  request_text:'Tuku-PM fix product=bds: clarify advisor review inbox',state:'review',
  result_content:JSON.stringify({draft_pr:'https://github.com/thatlango/TukuBDS/pull/83',source_sha:'a'.repeat(40)})
};
const ledger=[];
const updates=[];
const db={
  async query(sql,values){return db.perform(sql,values);},
  async withTransaction(fn){return fn({query:(sql,values)=>db.perform(sql,values)});},
  async perform(sql,values){
    ledger.push(String(sql).slice(0,100));
    if(sql.startsWith('SELECT * FROM agent_work_dispatches WHERE work_item_id='))return{rows:[{...dispatch}]};
    if(sql.startsWith('UPDATE agent_work_dispatches')){updates.push('dispatch');return{rows:[{...dispatch,state:'completed'}]};}
    if(sql.startsWith('UPDATE work_items')){updates.push('work');return{rows:[]};}
    if(sql.startsWith('UPDATE agent_runs')){updates.push('run');return{rows:[]};}
    if(sql.startsWith('SELECT wi.*'))return{rows:[{id:dispatch.work_item_id,status:'done',title:'Test'}]};
    if(sql.startsWith('INSERT INTO agent_events'))return{rows:[{id:'evt_1',run_id:dispatch.run_id,agent_id:'tuku-pm'}]};
    return{rows:[]};
  }
};
const paths={};
const router=()=>({
  get(path,fn){paths['GET '+path]=fn;},
  post(path,fn){paths['POST '+path]=fn;},
  patch(path,fn){paths['PATCH '+path]=fn;},
  put(path,fn){paths['PUT '+path]=fn;},
  delete(path,fn){paths['DELETE '+path]=fn;}
});
const original=Module._load;
Module._load=function(request,parent,...rest){
  if(parent?.filename?.endsWith('/server/agent-work.js')){
    if(request==='express')return{Router:router};
    if(request==='./db')return db;
    if(request==='./ai')return {};
    if(request==='./agent-control')return{broadcastAgentEvent(){}};
  }
  return original.call(this,request,parent,...rest);
};
try{require('../server/agent-work');}finally{Module._load=original;}
const handler=paths['POST /work/items/:id/agent/accept'];
function receipt(){
  const source='a'.repeat(40),release='b'.repeat(40),image='sha256:'+'c'.repeat(64);
  return{
    schema_version:1,dispatch_id:dispatch.id,work_item_id:dispatch.work_item_id,
    repository:'thatlango/TukuBDS',pull_request_url:'https://github.com/thatlango/TukuBDS/pull/83',
    base_sha:source,release_sha:release,
    build:{status:'passed',commit_sha:release,build_url:'https://console.cloud.google.com/builds/123',artifact_type:'static_bundle',artifact_digest:image},
    deployment:{status:'live',commit_sha:release,artifact_type:'static_bundle',artifact_digest:image,static_mount:'/opt/tuku/apps/tukubds/dist',rollback_digest:'sha256:'+'d'.repeat(64),
      production_url:'https://bds.tukutuku.org/',deployed_at:'2026-10-21T15:36:00Z'},
    checks:{ci:'passed',security:'passed',browser_e2e:'passed',permissions:'passed',live_health:'passed',live_user_journey:'passed',telemetry:'passed',rollback_ready:'passed'},
    release_authority:'A3-approved',release_approval_ref:'release_operator_acceptance',verifier_id:'sre-independent',
    verified_at:'2026-10-21T15:47:00Z'
  };
}
async function call(body){
  return new Promise((resolve,reject)=>{
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(data){resolve({status:this.statusCode,data});}};
    Promise.resolve(handler({params:{id:dispatch.work_item_id},body},res)).catch(reject);
  });
}
test('real acceptance route refuses draft PR without independent production receipt',async()=>{
  assert.equal(typeof handler,'function');
  const before=updates.length;
  const result=await call({});
  assert.equal(result.status,409);
  assert.match(result.data.error,/production/i);
  assert.equal(updates.length,before);
});
test('real acceptance route refuses a forged receipt without signature',async()=>{
  const before=updates.length;
  const result=await call({production_receipt:receipt(),production_signature:'0'.repeat(64)});
  assert.equal(result.status,409);
  assert.equal(updates.length,before);
});
test('valid separately signed receipt permits the existing completion transaction',async()=>{
  const saved=process.env.TUKU_PM_RELEASE_ATTESTATION_KEY;
  const now=Date;
  process.env.TUKU_PM_RELEASE_ATTESTATION_KEY=key;
  // Receipt verifier checks its timestamp against wall clock; use current time
  // while preserving the causality between deployment and verification.
  const r=receipt();
  r.verified_at=new Date(Date.now()-60000).toISOString();
  r.deployment.deployed_at=new Date(Date.now()-120000).toISOString();
  const sig=crypto.createHmac('sha256',key).update(JSON.stringify(r)).digest('hex');
  try{
    const before=updates.length;
    const result=await call({production_receipt:r,production_signature:sig});
    assert.equal(result.status,200,JSON.stringify(result.data));
    assert.deepEqual(updates.slice(before),['dispatch','work','run']);
  }finally{
    if(saved===undefined)delete process.env.TUKU_PM_RELEASE_ATTESTATION_KEY;
    else process.env.TUKU_PM_RELEASE_ATTESTATION_KEY=saved;
  }
});
