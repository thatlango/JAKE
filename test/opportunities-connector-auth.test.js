'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  READ_SCOPE,
  WRITE_SCOPE,
  CONNECTOR_SCOPES,
  secureEqual,
  connectorPrincipal,
  requireOpportunityScope
}=require('../server/opportunities-connector-auth');

test('opportunities connector exposes only read and write scopes',()=>{
  assert.deepEqual([...CONNECTOR_SCOPES],[READ_SCOPE,WRITE_SCOPE]);
  assert.deepEqual(connectorPrincipal().scopes,['opportunities:read','opportunities:write']);
});

test('connector credential comparison is exact',()=>{
  assert.equal(secureEqual('abc','abc'),true);
  assert.equal(secureEqual('abc','abcd'),false);
  assert.equal(secureEqual('abc','abd'),false);
  assert.equal(secureEqual('',''),false);
});

test('scope middleware denies missing write scope',()=>{
  const middleware=requireOpportunityScope(WRITE_SCOPE);
  let statusCode=0;
  let payload=null;
  const req={opportunitiesPrincipal:{scopes:[READ_SCOPE]}};
  const res={
    status(code){statusCode=code;return this;},
    json(value){payload=value;return this;}
  };
  middleware(req,res,()=>assert.fail('next must not run'));
  assert.equal(statusCode,403);
  assert.equal(payload.required_scope,WRITE_SCOPE);
});

test('scope middleware allows exact write scope',()=>{
  const middleware=requireOpportunityScope(WRITE_SCOPE);
  let called=false;
  middleware(
    {opportunitiesPrincipal:{scopes:[READ_SCOPE,WRITE_SCOPE]}},
    {status(){throw new Error('unexpected denial');}},
    ()=>{called=true;}
  );
  assert.equal(called,true);
});
