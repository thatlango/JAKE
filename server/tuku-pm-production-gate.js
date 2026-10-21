'use strict';
// A Tuku-PM engineering task is complete only after an independent
// release authority signs a fresh, exact production receipt.
const crypto=require('node:crypto');
const sha=/^[0-9a-f]{40}$/;
const digest=/^sha256:[0-9a-f]{64}$/;
const signaturePattern=/^[0-9a-f]{64}$/;
const outcomes=['ci','security','browser_e2e','permissions','live_health',
  'live_user_journey','telemetry','rollback_ready'];

function requiresProduction(dispatch){
  if(dispatch?.requested_agent_id!=='tuku-pm')return false;
  const req=String(dispatch.request_text||'');
  const prefix=req.match(/^\s*\/?tuku-pm\b\s*[:\-]?\s*/i);
  if(!prefix)return true; // Unknown malformed Tuku-PM packet: fail closed.
  const remainder=req.slice(prefix[0].length);
  // Even a "plan" request requires production proof if the agent actually
  // delivered a code PR. The source deliverable controls the exit standard.
  if(/^https:\/\/github\.com\/.+\/pull\/\d+$/.test(String(dispatch.artifact_uri||'')))return true;
  if(/\b(implement|release|deploy|ship)\b/i.test(String(dispatch.deliverable_type||'')))return true;
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
  if(typeof signingKey!=='string'||signingKey.length<32)denial('independent release verifier not configured');
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.schema_version!==1)denial('receipt is missing or invalid');
  if(!signaturePattern.test(String(signature||'')))denial('release signature is missing or invalid');
  const expected=crypto.createHmac('sha256',signingKey).update(JSON.stringify(receipt)).digest('hex');
  if(!crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))denial('release attestation signature mismatch');
  if(receipt.work_item_id!==dispatch.work_item_id||receipt.dispatch_id!==dispatch.id)denial('receipt bound to another work item');
  if(receipt.repository!=='thatlango/TukuBDS')denial('repository has no approved release policy');
  if(!sha.test(String(receipt.release_sha||'')))denial('release commit SHA invalid');
  if(!/^https:\/\/github\.com\/thatlango\/TukuBDS\/pull\/[0-9]+$/.test(String(receipt.pull_request_url||'')))denial('pull request URL invalid');
  let agentOutput={};
  try{agentOutput=JSON.parse(dispatch.result_content||'{}');}catch{denial('agent result content invalid');}
  if(agentOutput.draft_pr!==receipt.pull_request_url)denial('receipt does not match delivered pull request');
  if(!sha.test(String(agentOutput.source_sha||''))||receipt.base_sha!==agentOutput.source_sha)denial('receipt does not match source baseline');
  const built=receipt.build||{};
  const live=receipt.deployment||{};
  if(built.status!=='passed'||built.commit_sha!==receipt.release_sha||
      !digest.test(String(built.image_digest||''))||
      typeof built.build_url!=='string'||!/^https:\/\//.test(built.build_url))denial('immutable passing build provenance missing');
  if(live.status!=='live'||live.commit_sha!==receipt.release_sha||
      live.image_digest!==built.image_digest||!digest.test(String(live.rollback_digest||'')))denial('deployed commit, image or rollback proof mismatch');
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
    production_url:live.production_url,verified_at:receipt.verified_at};
}
module.exports={requiresProduction,validateReceipt};
