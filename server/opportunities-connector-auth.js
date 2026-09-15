'use strict';
const crypto=require('crypto');

const READ_SCOPE='opportunities:read';
const WRITE_SCOPE='opportunities:write';
const CONNECTOR_SCOPES=Object.freeze([READ_SCOPE,WRITE_SCOPE]);

function bearer(req){
  return String(req.get?.('authorization')||req.headers?.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';
}
function secureEqual(a,b){
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length===right.length&&left.length>0&&crypto.timingSafeEqual(left,right);
}
function configuredToken(){
  return String(process.env.JAKEOS_OPPORTUNITIES_CONNECTOR_TOKEN||'').trim();
}
function connectorPrincipal(){
  return {type:'service',id:'jakeos-opportunities-connector',scopes:[...CONNECTOR_SCOPES]};
}
function authenticateOpportunityConnector(req,res,next){
  const expected=configuredToken();
  if(!expected){
    return res.status(503).json({
      error:'Opportunity connector authentication is not configured',
      code:'CONNECTOR_AUTH_NOT_CONFIGURED'
    });
  }
  const provided=bearer(req);
  if(!secureEqual(provided,expected)){
    return res.status(401).json({error:'Invalid opportunity connector credential',code:'AUTH_REQUIRED'});
  }
  req.opportunitiesPrincipal=connectorPrincipal();
  return next();
}
function requireOpportunityScope(scope){
  if(!CONNECTOR_SCOPES.includes(scope))throw new Error('Unsupported opportunity connector scope');
  return (req,res,next)=>{
    const scopes=new Set(req.opportunitiesPrincipal?.scopes||[]);
    if(!scopes.has(scope)){
      return res.status(403).json({
        error:'Opportunity connector scope denied',
        code:'SCOPE_DENIED',
        required_scope:scope
      });
    }
    return next();
  };
}

module.exports={
  READ_SCOPE,
  WRITE_SCOPE,
  CONNECTOR_SCOPES,
  bearer,
  secureEqual,
  connectorPrincipal,
  authenticateOpportunityConnector,
  requireOpportunityScope
};
