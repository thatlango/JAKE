'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadRegistry,lockExpired}=require('../server/estate-control');

test('estate registry has unique ids, repositories, and valid dependencies',()=>{
  const registry=loadRegistry();
  assert.equal(registry.schemaVersion,1);
  assert.ok(registry.repositories.length>=10);
  const ids=registry.repositories.map(x=>x.id);
  const repos=registry.repositories.map(x=>x.repo);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(new Set(repos).size,repos.length);
  const known=new Set(ids);
  for(const row of registry.repositories){
    assert.ok(row.branch);
    assert.ok(Number.isInteger(row.priority));
    for(const dep of row.dependencies)assert.ok(known.has(dep),`${row.id} depends on unknown ${dep}`);
  }
});

test('repo lock expiry is deterministic',()=>{
  assert.equal(lockExpired(null),true);
  assert.equal(lockExpired({expires_at:new Date(Date.now()-1000).toISOString()}),true);
  assert.equal(lockExpired({expires_at:new Date(Date.now()+60000).toISOString()}),false);
});
