'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateReceipt}=require('../server/tuku-pm-production-gate');
const kp=crypto.generateKeyPairSync('ed25519');
const KEY=kp.publicKey.export({format:'pem',type:'spki'});
const moment=Date.parse('2026-10-22T08:30:00.000Z');
const BASE='a'.repeat(40), RELEASE='b'.repeat(40);
const DIGEST='sha256:'+'c'.repeat(64), ROLLBACK='sha256:'+'d'.repeat(64);
const cases=[
  {repo:'thatlango/lendflow',hint:'lendflow',host:'lendflow.tukutuku.org',artifact:'oci_image'},
  {repo:'thatlango/JAKE',hint:'jakeos',host:'jakeos.tukutuku.org',artifact:'oci_image'},
  {repo:'thatlango/TukuBDS',hint:'bds',host:'bds.tukutuku.org',artifact:'static_bundle',mount:'/opt/tuku/apps/tukubds/dist'}
];
function scenario(policy){
  const pr='https://github.com/'+policy.repo+'/pull/85';
  const work={id:'dispatch_abc456',work_item_id:'work_abc456',requested_agent_id:'tuku-pm',
    request_text:'Tuku-PM fix product='+policy.hint+': finish production flow',
    state:'review',result_content:JSON.stringify({draft_pr:pr,source_sha:BASE,qa:'NOT_VERIFIED'})};
  const receipt={schema_version:1,work_item_id:work.work_item_id,dispatch_id:work.id,
    repository:policy.repo,pull_request_url:pr,base_sha:BASE,release_sha:RELEASE,
    build:{status:'passed',commit_sha:RELEASE,build_url:'https://console.cloud.google.com/builds/123',
      artifact_type:policy.artifact,artifact_digest:DIGEST},
    deployment:{status:'live',commit_sha:RELEASE,artifact_type:policy.artifact,artifact_digest:DIGEST,
      rollback_digest:ROLLBACK,production_url:'https://'+policy.host+'/',deployed_at:'2026-10-22T08:10:00.000Z'},
    checks:{ci:'passed',security:'passed',browser_e2e:'passed',permissions:'passed',
      live_health:'passed',live_user_journey:'passed',telemetry:'passed',rollback_ready:'passed'},
    release_authority:'A3-approved',release_approval_ref:'approved_scope_12345',
    verifier_id:'independent-release-authority',verified_at:'2026-10-22T08:20:00.000Z'};
  if(policy.mount)receipt.deployment.static_mount=policy.mount;
  return {work,receipt};
}
function verify(work,receipt){
  const sig=crypto.sign(null,Buffer.from(JSON.stringify(receipt),'utf8'),kp.privateKey).toString('base64url');
  return validateReceipt(work,receipt,sig,KEY,moment);
}
function denied(work,receipt,expected){
  assert.throws(()=>verify(work,receipt),err=>err.status===409&&err.code==='PRODUCTION_PROOF_REQUIRED'&&err.message.includes(expected));
}
test('each allowlisted product accepts its own scoped independently signed receipt',()=>{
  for(const policy of cases){
    const {work,receipt}=scenario(policy);
    assert.equal(verify(work,receipt).verified,true,policy.repo);
  }
});
test('cross-product requested product substitution is denied even with valid signature',()=>{
  for(const policy of cases){
    const {work,receipt}=scenario(policy);
    work.request_text='Tuku-PM fix product='+cases.find(x=>x.repo!==policy.repo).hint+': sample';
    denied(work,receipt,'requested product');
  }
});
test('container releases cannot masquerade as static bundles or reuse BDS mount',()=>{
  for(const policy of cases.filter(x=>x.artifact==='oci_image')){
    let {work,receipt}=scenario(policy);
    receipt.deployment.static_mount='/opt/tuku/apps/tukubds/dist';
    denied(work,receipt,'static mount');
    ({work,receipt}=scenario(policy));
    receipt.build.artifact_type='static_bundle';receipt.deployment.artifact_type='static_bundle';
    denied(work,receipt,'provenance');
  }
});
test('BDS cannot send OCI receipt and must prove its exact static mount',()=>{
  let {work,receipt}=scenario(cases[2]);
  receipt.deployment.static_mount='/tmp/fake';
  denied(work,receipt,'static production mount');
  ({work,receipt}=scenario(cases[2]));
  receipt.build.artifact_type='oci_image';receipt.deployment.artifact_type='oci_image';
  delete receipt.deployment.static_mount;
  denied(work,receipt,'provenance');
});
test('wrong host, a different PR and unsupported repository are never accepted',()=>{
  for(const policy of cases){
    let {work,receipt}=scenario(policy);
    receipt.deployment.production_url='https://another.tukutuku.org/';
    denied(work,receipt,'wrong production host');
    ({work,receipt}=scenario(policy));
    receipt.pull_request_url='https://github.com/'+policy.repo+'/pull/999';
    denied(work,receipt,'delivered pull request');
    ({work,receipt}=scenario(policy));
    receipt.repository='thatlango/unapproved-product';
    denied(work,receipt,'repository has no approved');
  }
});
test('production claim is refused with failed financial/security or browser proof',()=>{
  for(const policy of cases){
    const {work,receipt}=scenario(policy);
    receipt.checks.browser_e2e='not_run';
    denied(work,receipt,'required independent check');
  }
});
test('invalid or modified signatures cannot be accepted for any product',()=>{
  for(const policy of cases){
    const {work,receipt}=scenario(policy);
    const sig=crypto.sign(null,Buffer.from(JSON.stringify(receipt)),kp.privateKey).toString('base64url');
    receipt.release_sha='f'.repeat(40);
    assert.throws(()=>validateReceipt(work,receipt,sig,KEY,moment),/signature mismatch/);
  }
});
