'use strict';
const path=require('path');
const express=require('express');
const {app:api,ensureSeeded}=require('./app');
const {momentumRouter,integrationsRouter}=require('./momentum');
const gcal=require('./gcal');
const db=require('./db');
const {parseSMS}=require('./sms-parser');

const app=express();
app.set('trust proxy',1);
// Momentum and integration routers are mounted before the JakeOS API app,
// so parse their request bodies at the top level as well.
app.use(express.json({limit:'15mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));

app.get('/health',async(_,res)=>res.json({status:'ok',app:'JakeOS',version:'5.1',db:await db.ping(),time:new Date().toISOString()}));
app.use('/api/momentum/v1',momentumRouter);
app.use('/api/integrations/v1',integrationsRouter);
app.use('/api',api);

app.post('/share-target',async(req,res)=>{const text=String(req.body.text||req.body.title||'').trim().slice(0,2000);if(text&&db.isReady()){const entry=parseSMS(text,'share-target',new Date().toISOString())||{id:`sms_${Date.now()}`,type:'unparsed',raw:text,sender:'share-target',timestamp:new Date().toISOString()};await db.insert('sms_transactions',{id:entry.id,type:entry.type||'unparsed',flow:entry.flow||'',amount:entry.amount||0,party:entry.party||'',provider:entry.provider||'',category:entry.category||'Other',timestamp:entry.timestamp,raw:entry.raw||text,sender:'share-target',note:'',currency:'UGX'},true);}res.redirect(303,'/?module=personal-finance');});

app.get('/auth/google',(req,res)=>{if(!gcal.isConfigured())return res.status(503).send('Google Calendar is not configured yet.');const redirectUri=process.env.GOOGLE_REDIRECT_URI||`${req.protocol}://${req.get('host')}/auth/google/callback`;res.redirect(gcal.buildAuthUrl(redirectUri));});
app.get('/auth/google/callback',async(req,res)=>{if(req.query.error)return res.status(400).send(`Google authorisation denied: ${String(req.query.error)}`);if(!req.query.code)return res.status(400).send('No Google auth code received.');try{const redirectUri=process.env.GOOGLE_REDIRECT_URI||`${req.protocol}://${req.get('host')}/auth/google/callback`;await gcal.exchangeCode(String(req.query.code),redirectUri);res.redirect('/?module=calendar&google=connected');}catch(e){res.status(502).send(`Google Calendar connection failed: ${e.message}`);}});

const dist=path.join(__dirname,'..','client','dist');
app.use(express.static(dist,{maxAge:process.env.NODE_ENV==='production'?'1h':0,index:false}));
// Middleware fallback avoids Express 5's changed wildcard route grammar.
app.use((req,res,next)=>{if(req.path.startsWith('/api/'))return res.status(404).json({error:'API route not found'});if(req.method!=='GET'&&req.method!=='HEAD')return next();res.sendFile(path.join(dist,'index.html'));});

const port=Number(process.env.PORT||3000);
(async()=>{await gcal.hydrate();await ensureSeeded();app.listen(port,'0.0.0.0',()=>console.log(`[JakeOS] listening on :${port}`));})().catch(e=>{console.error('[JakeOS] startup failed:',e);process.exit(1);});
