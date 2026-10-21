'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {requiresProduction,validateReceipt}=require('../server/tuku-pm-production-gate');

const {privateKey:TEST_PRIVATE,publicKey:TEST_PUBLIC}=crypto.generateKeyPairSync('ed25519');
const KEY=TEST_PUBLIC.export({format:'pem',type:'spki'});
const moment=Date.parse('2026-10-21T16:00:00.000Z');
const baseline='a'.repeat(40);
const release='b'.repeat(40);
const image='sha256:'+'c'.repeat(64);
const rollback='sha256:'+'d'.repeat(64);
const pr='https://github.com/thatlango/TukuBDS/pull/83';
const dispatch={
  id:'dispatch_abc123',work_item_id:'work_abc123',requested_agent_id:'tuku-pm',
  request_text:'Tuku-PM fix product=bds: improve evidence inbox',
  state:'review',result_content:JSON.stringify({draft_pr:pr,source_sha:baseline,qa:'NOT_VERIFIED'})
};
function evidence(){
  return {
    schema_version:1,work_item_id:dispatch.work_item_id,dispatch_id:dispatch.id,
    repository:'thatlango/TukuBDS',pull_request_url:pr,base_sha:baseline,release_sha:release,
    build:{status:'passed',commit_sha:release,build_url:'https://console.cloud.google.com/cloud-build/builds/build123',
      artifact_type:'static_bundle',artifact_digest:image},
    deployment:{status:'live',commit_sha:release,artifact_type:'static_bundle',artifact_digest:image,static_mount:'/opt/tuku/apps/tukubds/dist',rollback_digest:rollback,
      production_url:'https://bds.tukutuku.org/',deployed_at:'2026-10-21T15:36:00.000Z'},
    checks:{ci:'passed',security:'passed',browser_e2e:'passed',permissions:'passed',
      live_health:'passed',live_user_journey:'passed',telemetry:'passed',rollback_ready:'passed'},
    release_authority:'A3-approved',release_approval_ref:'release_approved_case123',
    verifier_id:'release-verifier-ovh',verified_at:'2026-10-21T15:47:00.000Z'
  };
}
const sign=r=>crypto.sign(null,Buffer.from(JSON.stringify(r),'utf8'),TEST_PRIVATE).toString('base64url');
const validate=(r,key=KEY,d=dispatch,signature=sign(r))=>validateReceipt(d,r,signature,key,moment);
function blocked(fn,words){assert.throws(fn,error=>error.status===409&&error.code==='PRODUCTION_PROOF_REQUIRED'&&error.message.includes(words));}

test('build/fix/ship require release verification, planning and non-Tuku agents do not',()=>{
  assert.equal(requiresProduction(dispatch),true);
  for(const cmd of ['build','fix','ship','deploy','recover','resume','finish','complete','implement'])
    assert.equal(requiresProduction({...dispatch,request_text:'Tuku-PM '+cmd+' product=bds: something'}),true,cmd);
  assert.equal(requiresProduction({...dispatch,request_text:'Tuku-PM product=bds: fix the inbox'}),true);
  assert.equal(requiresProduction({...dispatch,request_text:'Tuku-PM: audit evidence and ship'}),true);
  assert.equal(requiresProduction({...dispatch,request_text:'Tuku-PM'}),true);
  assert.equal(requiresProduction({...dispatch,request_text:'Tuku-PM plan product=bds: something'}),false);
  assert.equal(requiresProduction({...dispatch,request_text:'Tuku-PM discover product=bds: something'}),false);
  assert.equal(requiresProduction({...dispatch,request_text:'Tuku-PM plan product=bds',artifact_uri:pr}),true);
  assert.equal(requiresProduction({...dispatch,request_text:'Tuku-PM plan product=bds',deliverable_type:'implementation'}),true);
  assert.equal(requiresProduction({...dispatch,requested_agent_id:'assurance-reviewer'}),false);
  assert.deepEqual(validateReceipt({...dispatch,requested_agent_id:'assurance-reviewer'},null,'',null,moment),{required:false});
});
test('missing independent verifier or absent receipt blocks Work completion',()=>{
  blocked(()=>validateReceipt(dispatch,null,'',KEY,moment),'receipt');
  blocked(()=>validate(evidence(),''),'verifier not configured');
  blocked(()=>validateReceipt(dispatch,evidence(),'','',moment),'verifier not configured');
});
test('correct signed production evidence accepted with exact immutable source',()=>{
  const r=validate(evidence());
  assert.equal(r.verified,true);
  assert.equal(r.release_sha,release);
  assert.equal(r.production_url,'https://bds.tukutuku.org/');
});
test('a verified OCI artifact is supported for future containerized releases',()=>{
  const r=evidence();r.build.artifact_type='oci_image';r.deployment.artifact_type='oci_image';
  delete r.deployment.static_mount;
  assert.equal(validate(r).verified,true);
});
test('a static web release cannot claim an unverified bind mount',()=>{
  const r=evidence();r.deployment.static_mount='/tmp/other';
  blocked(()=>validate(r),'static production mount');
});
test('false flags or altered signed evidence cannot bypass',()=>{
  const r=evidence();r.checks.browser_e2e='not_run';
  blocked(()=>validate(r),'required independent check');
  const good=evidence(),signature=sign(good);
  good.build.artifact_digest='sha256:'+'e'.repeat(64);
  blocked(()=>validate(good,KEY,dispatch,signature),'signature');
});
test('another dispatch, wrong PR, mismatched build/deploy and wrong host blocked',()=>{
  for(const [field,val,term] of [
    ['dispatch_id','dispatch_other','another work'],
    ['pull_request_url','https://github.com/thatlango/TukuBDS/pull/84','delivered pull request'],
    ['release_sha','wrongsha','SHA invalid']]){
    const r=evidence();r[field]=val;blocked(()=>validate(r),term);
  }
  let r=evidence();r.build.commit_sha=baseline;blocked(()=>validate(r),'provenance');
  r=evidence();r.deployment.artifact_digest=rollback;blocked(()=>validate(r),'deployed artifact');
  r=evidence();r.deployment.production_url='https://another.example/';blocked(()=>validate(r),'wrong production host');
  r=evidence();r.deployment.production_url='https://bds.tukutuku.org:8443/';blocked(()=>validate(r),'production URL invalid');
  r=evidence();r.base_sha=release;blocked(()=>validate(r),'source baseline');
});
test('requires all independent security, browser, operational and rollback checks',()=>{
  for(const name of Object.keys(evidence().checks)){
    const r=evidence();r.checks[name]='not_run';
    blocked(()=>validate(r),'required independent check');
  }
});
test('prevents false release authority, stale evidence, and missing source result',()=>{
  let r=evidence();r.release_authority='draft';blocked(()=>validate(r),'approval');
  r=evidence();r.verified_at='2026-10-20T10:00:00.000Z';blocked(()=>validate(r),'stale');
  r=evidence();r.deployment.deployed_at='2026-10-21T15:55:00.000Z';blocked(()=>validate(r),'time');
  r=evidence();blocked(()=>validate(r,KEY,{...dispatch,result_content:'{"draft_pr":""}'}),'delivered pull request');
});
