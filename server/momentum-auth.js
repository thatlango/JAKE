'use strict';
const crypto=require('crypto');

let certCache={expiresAt:0,certs:null};
const coreTokenCache=new Map();

function timingSafeStringEqual(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function csvEnv(name){return new Set(String(process.env[name]||'').split(',').map(v=>v.trim()).filter(Boolean));}
function tokenCacheKey(token){return crypto.createHash('sha256').update(String(token||'')).digest('hex');}
function parseJwt(token){const parts=String(token||'').split('.');if(parts.length!==3)throw new Error('Malformed token');const decode=value=>JSON.parse(Buffer.from(value.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));return{header:decode(parts[0]),payload:decode(parts[1]),signed:`${parts[0]}.${parts[1]}`,signature:Buffer.from(parts[2].replace(/-/g,'+').replace(/_/g,'/'),'base64')};}

async function firebaseCerts(){if(certCache.certs&&certCache.expiresAt>Date.now())return certCache.certs;const response=await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('Firebase certificate lookup failed');const cacheControl=response.headers.get('cache-control')||'',maxAge=Number(cacheControl.match(/max-age=(\d+)/)?.[1]||3600);certCache={certs:await response.json(),expiresAt:Date.now()+Math.max(300,maxAge-60)*1000};return certCache.certs;}
async function verifyFirebaseIdToken(token,projectId){const{header,payload,signed,signature}=parseJwt(token);if(header.alg!=='RS256'||!header.kid)throw new Error('Unsupported Firebase token');const now=Math.floor(Date.now()/1000);if(payload.aud!==projectId)throw new Error('Wrong Firebase audience');if(payload.iss!==`https://securetoken.google.com/${projectId}`)throw new Error('Wrong Firebase issuer');if(!payload.sub||typeof payload.sub!=='string')throw new Error('Missing Firebase subject');if(Number(payload.exp||0)<=now)throw new Error('Firebase token expired');if(Number(payload.iat||now+1)>now+60)throw new Error('Firebase token issued in the future');const cert=(await firebaseCerts())[header.kid];if(!cert)throw new Error('Unknown Firebase signing key');const verifier=crypto.createVerify('RSA-SHA256');verifier.update(signed);verifier.end();if(!verifier.verify(cert,signature))throw new Error('Invalid Firebase signature');return payload;}

function tukuCoreBase(){return String(process.env.TUKU_CORE_BASE_URL||process.env.TUKU_CORE_URL||'').replace(/\/$/,'');}
async function verifyTukuCoreAccessToken(token){
  const base=tukuCoreBase();
  if(!base)throw new Error('Tuku Core authentication is not configured');
  const key=tokenCacheKey(token),cached=coreTokenCache.get(key);
  if(cached&&cached.expiresAt>Date.now())return cached.user;
  const response=await fetch(`${base}/api/v1/auth/me`,{headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal:AbortSignal.timeout(Number(process.env.TUKU_CORE_AUTH_TIMEOUT_MS||5000))});
  if(response.status===401||response.status===403)throw new Error('Tuku Core session rejected');
  if(!response.ok)throw new Error(`Tuku Core authentication failed (${response.status})`);
  const payload=await response.json().catch(()=>({}));
  const body=payload?.data??payload;
  const profile=body?.profile??body?.user??body;
  const coreUserId=String(profile?.coreUserId||profile?.core_user_id||'').trim();
  if(!coreUserId)throw new Error('Tuku Core identity response is incomplete');
  const user={uid:coreUserId,coreUserId,email:profile?.email||null,name:profile?.displayName||profile?.display_name||null,provider:'tuku-core'};
  coreTokenCache.set(key,{user,expiresAt:Date.now()+Math.max(5,Number(process.env.TUKU_CORE_AUTH_CACHE_SECONDS||30))*1000});
  if(coreTokenCache.size>500){const now=Date.now();for(const[k,v]of coreTokenCache)if(v.expiresAt<=now)coreTokenCache.delete(k);}
  return user;
}

function allowedMomentumUser(user){
  const allowedCoreIds=csvEnv('MOMENTUM_ALLOWED_CORE_USER_IDS');
  const allowedUids=csvEnv('MOMENTUM_ALLOWED_UIDS');
  const allowedEmails=csvEnv('MOMENTUM_ALLOWED_EMAILS');
  if(allowedCoreIds.size&&!allowedCoreIds.has(String(user.coreUserId||user.uid||'')))return false;
  if(allowedUids.size&&!allowedUids.has(String(user.uid||'')))return false;
  if(allowedEmails.size&&!allowedEmails.has(String(user.email||'').toLowerCase()))return false;
  return true;
}

function momentumAuth(){return async(req,res,next)=>{
  const bearer=String(req.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
  if(!bearer)return res.status(401).json({error:'Momentum authentication required'});
  const coreBase=tukuCoreBase();
  const projectId=process.env.MOMENTUM_FIREBASE_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;
  const fallback=process.env.MOMENTUM_API_TOKEN;
  try{
    if(coreBase){
      const user=await verifyTukuCoreAccessToken(bearer);
      if(!allowedMomentumUser(user))return res.status(403).json({error:'Momentum account is not allowed'});
      req.momentumUser=user;
      return next();
    }
    if(projectId){
      const claims=await verifyFirebaseIdToken(bearer,projectId);
      const user={uid:claims.sub,email:claims.email||null,name:claims.name||null,provider:'firebase'};
      if(!allowedMomentumUser(user))return res.status(403).json({error:'Momentum account is not allowed'});
      req.momentumUser=user;
      return next();
    }
    if(fallback&&timingSafeStringEqual(bearer,fallback)){
      req.momentumUser={uid:'personal',coreUserId:null,email:null,name:'Personal workspace',provider:'token'};
      return next();
    }
    return res.status(503).json({error:'Momentum authentication is not configured'});
  }catch(error){return res.status(401).json({error:'Invalid Momentum session',detail:process.env.NODE_ENV==='development'?error.message:undefined});}
};}

function ingestAuth(){return(req,res,next)=>{const configured=process.env.JAKEOS_INGEST_TOKEN||'',bearer=String(req.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';if(!configured||!timingSafeStringEqual(configured,bearer))return res.status(401).json({error:'Invalid ingest token'});next();};}
module.exports={momentumAuth,ingestAuth,verifyFirebaseIdToken,verifyTukuCoreAccessToken};
