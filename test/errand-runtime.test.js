'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const policy=require('../server/errand-policy');
const runner=require('../server/openai-errand-runner');

test('errand tool policy is default deny and approval-gates external mutations',()=>{
  assert.equal(policy.toolAllowed('unknown_tool',['web:search']),false);
  assert.equal(policy.toolAllowed('gmail_send',['gmail:send']),true);
  assert.equal(policy.requiresApproval('gmail_send'),true);
  assert.equal(policy.requiresApproval('google_calendar_create'),true);
  assert.equal(policy.isExecutive('github_merge_pr'),true);
  assert.equal(policy.isExecutive('ops_request_action'),true);
  assert.equal(policy.canAutoExecute('jakeos_search',['jakeos:read']),true);
  assert.equal(policy.canAutoExecute('gmail_send',['gmail:send']),false);
});

test('default errand scopes include research but exclude irreversible authority',()=>{
  const scopes=policy.defaultScopesFor({requestedAgentId:'document-knowledge'});
  assert.ok(scopes.includes('web:search'));
  assert.ok(scopes.includes('drive:read'));
  assert.ok(scopes.includes('gmail:draft'));
  assert.equal(scopes.includes('gmail:send'),false);
  assert.equal(scopes.includes('payments:write'),false);
  assert.equal(scopes.includes('access:write'),false);
  assert.equal(scopes.includes('ops:write'),false);
});

test('action fingerprints are deterministic across object key order',()=>{
  const a=runner.fingerprint('gmail_send',{to:'a@example.com',subject:'Hello',body:'Hi'});
  const b=runner.fingerprint('gmail_send',{body:'Hi',subject:'Hello',to:'a@example.com'});
  assert.equal(a,b);
});

test('estimated OpenAI cost respects current model rate table',()=>{
  const cost=runner.usageCost({model:'gpt-5.6-terra',usage:{input_tokens:1000000,output_tokens:1000000}});
  assert.equal(cost.estimated_usd,14);
  assert.equal(cost.input_tokens,1000000);
  assert.equal(cost.output_tokens,1000000);
});
