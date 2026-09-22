'use strict';
const path=require('path');
const express=require('express');
const {app:api,ensureSeeded}=require('./app');
const {momentumRouter,integrationsRouter}=require('./momentum');
const {momentumProjectsRouter}=require('./momentum-projects');
const {mobileRouter}=require('./mobile');
const {estateRouter,momentumEstateRouter}=require('./estate');
const {estateControlRouter}=require('./estate-control');
const {opsRouter,momentumOpsRouter}=require('./ops');
const {tukuPayRouter}=require('./tukupay');
const {opsIngestRouter}=require('./ops-ingest');
const {accountsRouter}=require('./accounts');
const {subscriptionRouter,momentumSubscriptionRouter}=require('./ops-subscriptions');
const {opportunitiesConnectorRouter}=require('./opportunities-connector');
const {opportunitiesMcpRouter}=require('./opportunities-mcp');
const {opportunityIntakeRouter}=require('./opportunity-intake-router');
const {authenticateOpportunityConnector}=require('./opportunities-connector-auth');
const {agentBrowserRouter,agentConnectorRouter,authenticateAgentConnector}=require('./agent-control');
const {agentWorkConnectorRouter,startAgentWorkWorker}=require('./agent-work');
const {startJobs}=require('./jobs');
const {requireJakeAuth,webAuthRouter,momentumAuthRouter}=require('./tuku-auth');
const gcal=require('./gcal');
const db=require('./db');
const {parseSMS}=require('./sms-parser');

const app=express();
app.set('trust proxy',1);
app.use(express.json({limit:'15mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));

app.get('/health',async(_,res)=>res.json({status:'ok',app:'JakeOS',version:'6.2',db:await db.ping(),auth:'tuku',time:new Date().toISOString()}));
app.use('/auth',webAuthRouter());
app.use('/api/mobile/v1/auth',momentumAuthRouter());
app.use('/api/mobile/v1',mobileRouter);
app.use('/api/momentum/v1/auth',momentumAuthRouter());
app.use('/api/momentum/v1/estate',momentumEstateRouter);
app.use('/api/momentum/v1/ops/subscriptions',momentumSubscriptionRouter);
app.use('/api/momentum/v1/ops',momentumOpsRouter);
app.use('/api/momentum/v1/projects',momentumProjectsRouter);
app.use('/api/momentum/v1',momentumRouter);
app.use('/api/integrations/v1/ops',opsIngestRouter);
app.use('/api/integrations/v1',integrationsRouter);

// Dedicated machine boundaries are mounted before the generic browser-auth gate.
// Each token is scoped to its own connector and cannot access general JakeOS APIs.
app.use('/api/connectors/v1/opportunities',authenticateOpportunityConnector,opportunitiesConnectorRouter);
app.use('/mcp/opportunities',authenticateOpportunityConnector,opportunitiesMcpRouter);
app.use('/api/connectors/v1/opportunity-intake',authenticateOpportunityConnector,opportunityIntakeRouter);
app.use('/api/connectors/v1/agents',authenticateAgentConnector,agentConnectorRouter,agentWorkConnectorRouter);

app.use('/api/agents',requireJakeAuth,agentBrowserRouter);
app.use('/api/estate/control',requireJakeAuth,estateControlRouter);
app.use('/api/estate',requireJakeAuth,estateRouter);
app.use('/api/accounts',requireJakeAuth,accountsRouter);
app.use('/api/ops/subscriptions',requireJakeAuth,subscriptionRouter);
app.use('/api/ops',requireJakeAuth,opsRouter);
app.use('/api/tukupay',requireJakeAuth,tukuPayRouter);
app.use('/api',(req,res,next)=>req.path==='/sms/receive'?next():requireJakeAuth(req,res,next),api);

app.post('/share-target',requireJakeAuth,async(req,res)=>{const text=String(req.body.text||req.body.title||'').trim().slice(0,2000);if(text&&db.isReady()){const entry=parseSMS(text,'share-target',new Date().toISOString())||{id:`sms_${Date.now()}`,type:'unparsed',raw:text,sender:'share-target',timestamp:new Date().toISOString()};await db.insert('sms_transactions',{id:entry.id,type:entry.type||'unparsed',flow:entry.flow||'',amount:entry.amount||0,party:entry.party||'',provider:entry.provider||'',category:entry.category||'Other',timestamp:entry.timestamp,raw:entry.raw||text,sender:'share-target',note:'',currency:'UGX'},true);}res.redirect(303,'/?module=personal-finance');});

app.get('/auth/google',requireJakeAuth,(req,res)=>{if(!gcal.isConfigured())return res.status(503).send('Google Calendar is not configured yet.');const redirectUri=process.env.GOOGLE_REDIRECT_URI||`${req.protocol}://${req.get('host')}/auth/google/callback`;res.redirect(gcal.buildAuthUrl(redirectUri));});
app.get('/auth/google/callback',requireJakeAuth,async(req,res)=>{if(req.query.error)return res.redirect('/?module=integrations&google=denied');if(!req.query.code)return res.redirect('/?module=integrations&google=error');try{const redirectUri=process.env.GOOGLE_REDIRECT_URI||`${req.protocol}://${req.get('host')}/auth/google/callback`;await gcal.exchangeCode(String(req.query.code),redirectUri);res.redirect('/?module=integrations&google=connected');}catch(e){console.error('[GCal] OAuth callback failed:',e.message);res.redirect('/?module=integrations&google=error');}});

const dist=path.join(__dirname,'..','client','dist');
app.use(express.static(dist,{maxAge:process.env.NODE_ENV==='production'?'1h':0,index:false}));
app.use((req,res,next)=>{if(req.path.startsWith('/api/'))return res.status(404).json({error:'API route not found'});if(req.method!=='GET'&&req.method!=='HEAD')return next();res.sendFile(path.join(dist,'index.html'));});

const port=Number(process.env.PORT||3000);
(async()=>{
  await gcal.hydrate();
  await ensureSeeded();
  startJobs();
  startAgentWorkWorker();
  app.listen(port,'0.0.0.0',()=>console.log(`[JakeOS] listening on :${port}`));
})().catch(e=>{console.error('[JakeOS] startup failed:',e);process.exit(1);});
