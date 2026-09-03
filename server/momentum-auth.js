'use strict';
const crypto=require('crypto');
const {momentumAuth}=require('./tuku-auth');
function timingSafeStringEqual(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function ingestAuth(){return(req,res,next)=>{const configured=process.env.JAKEOS_INGEST_TOKEN||'',bearer=String(req.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';if(!configured||!timingSafeStringEqual(configured,bearer))return res.status(401).json({error:'Invalid ingest token'});next();};}
module.exports={momentumAuth,ingestAuth};
