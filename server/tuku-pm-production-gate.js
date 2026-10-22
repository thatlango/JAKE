'use strict';
// A Tuku-PM engineering task is complete only after an independent
// release authority signs a fresh, exact production receipt.
const crypto=require('node:crypto');
const sha=/^[0-9a-f]{40}$/;
const digest=/^sha256:[0-9a-f]{64}$/;
const outcomes=['ci','security','browser_e2e','permissions','live_health',
  'live_user_journey','telemetry','rollback_ready'];
// Only independently approved products may close Work via a production receipt.
// This is a receipt ACCEPTANCE allowlist, not permission to deploy automatically.
const releasePolicies=Object.freeze({
  'thatlango/TukuBDS':Object.freeze({
    host:'bds.tukutuku.org',artifact_type:'static_bundle',
    static_mount:'/opt/tuku/apps/tukubds/dist',aliases:['bds','tuku-bds']
  }),
  'thatlango/lendflow':Object.freeze({
    host:'lendflow.tukutuku.org',artifact_type:'oci_image',
    aliases:['lendflow']
  }),
  'thatlango/JAKE':Object.freeze({
    host:'jakeos.tukutuku.org',artifact_type:'oci_image',
    aliases:['jakeos']
  })
});

function requiresProduction(dispatch){
  if(dispatch?.requested_agent_id!=='tuku-pm')return false;
  const req=String(dispatch.request_text||'');
  const prefix=req.match(/^\s*\/?tuku-pm\b\s*[:\-]?\s*/i);
  if(!prefix)return true; // Unknown malformed Tuku-PM packet: fail closed.
  const remainder=req.slice(prefix[0].length);
  // Even a "plan" request requires production proof if the agent actually
  // delivered a code PR. The source deliverable controls the exit standard.
  if(/^https:\/\/github\.com\/.+\/pull\/\d+$/.test(String(dispatch.artifact_uri||'')))return true;
  if(/\b(implement|implementation|release|deploy|ship|code)\b/i.test(String(dispatch.deliverable_type||'')))return true;
  // Plans and discoveries without code are document deliverables.
  return !/^(plan|discover)\b/i.test(remainder);
}
function denial(reason){
  const err=new Error('Tuku-PM production completion blocked: '+reason);
  err.status=409;
  err.code='PRODUCTION_PROOF_REQUIRED';
  throw err;
}
function validateReceipt(dispatch, receipt, signature, signingKey, at=Date.now()){
  if(!requiresProduction(dispatch))return {required:false};
  // The application owns ONLY the public verification key. The independent
  // release verifier retains the private Ed25519 key in its own security domain.
  if(typeof signingKey!=='string'||!signingKey.includes('BEGIN PUBLIC KEY'))denial('independent release verifier not configured');
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.schema_version!==1)denial('receipt is missing or invalid');
  if(!/^[A-Za-z0-9_-]{85,88}$/.test(String(signature||'')))denial('release signature is missing or invalid');
  let authentic=false;
  try{
    const key=crypto.createPublicKey(signingKey);
    if(key.asymmetricKeyType!=='ed25519')denial('release signer algorithm not Ed25519');
    authentic=crypto.verify(null,Buffer.from(JSON.stringify(receipt),'utf8'),key,Buffer.from(signature,'base64url'));
  }catch{denial('release attestation signature mismatch');}
  if(!authentic)denial('release attestation signature mismatch');
  if(receipt.work_item_id!==dispatch.work_item_id||receipt.dispatch_id!==dispatch.id)denial('receipt bound to another work item');
  const policy=releasePolicies[receipt.repository];
  if(!policy)denial('repository has no approved release policy');
  const hinted=String(dispatch.request_text||'').match(/\bproduct\s*[:=]\s*([a-zA-Z0-9_-]+)/i);
  if(hinted&&!policy.aliases.includes(hinted[1].toLowerCase()))denial('receipt repository differs from requested product');
  if(!sha.test(String(receipt.release_sha||'')))denial('release commit SHA invalid');
  const prPrefix='https://github.com/'+receipt.repository+'/pull/';
  if(!String(receipt.pull_request_url||'').startsWith(prPrefix)||
      !/^[1-9][0-9]*$/.test(String(receipt.pull_request_url||'').slice(prPrefix.length)))denial('pull request URL invalid');
  let agentOutput={};
  try{agentOutput=JSON.parse(dispatch.result_content||'{}');}catch{denial('agent result content invalid');}
  if(agentOutput.draft_pr!==receipt.pull_request_url)denial('receipt does not match delivered pull request');
  if(!sha.test(String(agentOutput.source_sha||''))||receipt.base_sha!==agentOutput.source_sha)denial('receipt does not match source baseline');
  const built=receipt.build||{};
  const live=receipt.deployment||{};
  // BDS currently serves compiled static files from a read-only bind mount.
  // Bind-mount bundles and OCI images both require immutable SHA256 provenance.
  if(built.artifact_type!==policy.artifact_type||
      built.status!=='passed'||built.commit_sha!==receipt.release_sha||
      !digest.test(String(built.artifact_digest||''))||
      typeof built.build_url!=='string'||!/^https:\/\//.test(built.build_url))denial('immutable passing build provenance missing');
  if(live.status!=='live'||live.commit_sha!==receipt.release_sha||
      live.artifact_type!==built.artifact_type||
      live.artifact_digest!==built.artifact_digest||!digest.test(String(live.rollback_digest||'')))denial('deployed artifact, commit or rollback proof mismatch');
  if(policy.static_mount&&live.static_mount!==policy.static_mount)denial('static production mount not verified');
  if(!policy.static_mount&&live.static_mount!==undefined)denial('container release must not claim a static mount');
  let host;
  try{
    const u=new URL(String(live.production_url||''));
    if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash)denial('production endpoint must be canonical HTTPS');
    host=u.hostname;
    if(u.pathname!=='/'&&u.pathname!=='')denial('production endpoint must be canonical root');
  }catch{denial('production URL invalid');}
  if(host!==policy.host)denial('wrong production host');
  if(!receipt.checks||outcomes.some(key=>receipt.checks[key]!=='passed'))denial('a required independent check is not passed');
  if(receipt.release_authority!=='A3-approved'||!String(receipt.release_approval_ref||'').trim())denial('scoped release approval missing');
  if(!String(receipt.verifier_id||'').trim()||receipt.verifier_id==='tuku-pm-ovh-01')denial('independent verifier identity missing');
  const verified=Date.parse(String(receipt.verified_at||''));
  const deployed=Date.parse(String(live.deployed_at||''));
  if(!Number.isFinite(verified)||!Number.isFinite(deployed)||
      verified>at+120000||at-verified>60*60*1000||
      deployed>verified||verified-deployed>24*60*60*1000)denial('stale or inconsistent release verification time');
  return {required:true,verified:true,repository:receipt.repository,release_sha:receipt.release_sha,
    artifact_digest:live.artifact_digest,production_url:live.production_url,verified_at:receipt.verified_at};
}
module.exports={requiresProduction,validateReceipt};
).test(String(receipt.pull_request_url||'')))denial('pull request URL invalid');
  let agentOutput={};
  try{agentOutput=JSON.parse(dispatch.result_content||'{}');}catch{denial('agent result content invalid');}
  if(agentOutput.draft_pr!==receipt.pull_request_url)denial('receipt does not match delivered pull request');
  if(!sha.test(String(agentOutput.source_sha||''))||receipt.base_sha!==agentOutput.source_sha)denial('receipt does not match source baseline');
  const built=receipt.build||{};
  const live=receipt.deployment||{};
  // BDS currently serves compiled static files from a read-only bind mount.
  // Bind-mount bundles and OCI images both require immutable SHA256 provenance.
  if(!['oci_image','static_bundle'].includes(built.artifact_type)||
      built.status!=='passed'||built.commit_sha!==receipt.release_sha||
      !digest.test(String(built.artifact_digest||''))||
      typeof built.build_url!=='string'||!/^https:\/\//.test(built.build_url))denial('immutable passing build provenance missing');
  if(live.status!=='live'||live.commit_sha!==receipt.release_sha||
      live.artifact_type!==built.artifact_type||
      live.artifact_digest!==built.artifact_digest||!digest.test(String(live.rollback_digest||'')))denial('deployed artifact, commit or rollback proof mismatch');
  if(built.artifact_type==='static_bundle'&&
      live.static_mount!=='/opt/tuku/apps/tukubds/dist')denial('static production mount not verified');
  let host;
  try{
    const u=new URL(String(live.production_url||''));
    if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash)denial('production endpoint must be canonical HTTPS');
    host=u.hostname;
    if(u.pathname!=='/'&&u.pathname!=='')denial('production endpoint must be canonical root');
  }catch{denial('production URL invalid');}
  if(host!=='bds.tukutuku.org')denial('wrong production host');
  if(!receipt.checks||outcomes.some(key=>receipt.checks[key]!=='passed'))denial('a required independent check is not passed');
  if(receipt.release_authority!=='A3-approved'||!String(receipt.release_approval_ref||'').trim())denial('scoped release approval missing');
  if(!String(receipt.verifier_id||'').trim()||receipt.verifier_id==='tuku-pm-ovh-01')denial('independent verifier identity missing');
  const verified=Date.parse(String(receipt.verified_at||''));
  const deployed=Date.parse(String(live.deployed_at||''));
  if(!Number.isFinite(verified)||!Number.isFinite(deployed)||
      verified>at+120000||at-verified>60*60*1000||
      deployed>verified||verified-deployed>24*60*60*1000)denial('stale or inconsistent release verification time');
  return {required:true,verified:true,repository:receipt.repository,release_sha:receipt.release_sha,
    artifact_digest:live.artifact_digest,production_url:live.production_url,verified_at:receipt.verified_at};
}
module.exports={requiresProduction,validateReceipt};
