'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {unwrap}=require('../server/tuku-auth');

test('unwrap returns Tuku Core data envelope payload',()=>{
  const value=unwrap({data:{user:{coreUserId:'owner'}},meta:{request_id:'x'}});
  assert.equal(value.user.coreUserId,'owner');
});

test('unwrap preserves unwrapped payloads',()=>{
  const payload={user:{coreUserId:'owner'}};
  assert.equal(unwrap(payload),payload);
});
