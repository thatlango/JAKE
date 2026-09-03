'use strict';
const crypto=require('crypto');
const dns=require('dns').promises;
const net=require('net');
const express=require('express');
const helmet=require('helmet');
const {body,validationResult}=require('express-validator');
const {sendDeadlineDigest,sendAlert}=require('./alerts');
const {parseSMS}=require('./sms-parser');
const gcal=require('./gcal');
const db=require('./db');
const invoices=require('./invoices');
const crm=require('./crm');
const radar=require('./radar');
const {commandCenterOverview}=require('./overview');

const app=express();
app.use(express.json({limit:'15mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));
app.use(helmet({contentSecurityPolicy:false,hsts:false}));
const uid=(p='id')=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const cache={gcalEvents:[]};

function validate(validators){return[...validators,(req,res,next)=>{const errors=validationResult(req);if(!errors.isEmpty())return res.status(422).json({error:'Validation failed',details:errors.array().map(x=>x.msg)});next();}];}
function timingSafeEqual(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function requireSmsSecret(req,res,next){const configured=process.env.SMS_WEBHOOK_SECRET||'',provided=String(req.query.secret||req.get('x-jakeos-sms-secret')||'');if(!configured||!timingSafeEqual(configured,provided))return res.status(401).json({error:'Invalid webhook secret'});next();}
function isPrivateIp(ip){if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||p[0]===0;}if(net.isIP(ip)===6){const x=ip.toLowerCase();return x==='::1'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe80:')||x==='::';}return false;}
async function assertExternalUrl(raw){let url;try{url=new URL(raw);}catch{throw Object.assign(new Error('Invalid URL'),{status:400});}if(!['http:','https:'].includes(url.protocol))throw Object.assign(new Error('Only HTTP(S) URLs are allowed'),{status:400});const hostname=url.hostname.toLowerCase();if(hostname==='localhost'||hostname.endsWith('.local')||hostname.endsWith('.internal')||isPrivateIp(hostname))throw Object.assign(new Error('Private URLs are not allowed'),{status:403});const addresses=await dns.lookup(hostname,{all:true});if(!addresses.length||addresses.some(x=>isPrivateIp(x.address)))throw Object.assign(new Error('Private URLs are not allowed'),{status:403});return url;}

app.get('/health',async(_,res)=>res.json({status:'ok',app:'JakeOS',version:'5.1',db:await db.ping(),time:new Date().toISOString()}));
app.get('/overview',async(_,res)=>res.json(await commandCenterOverview()));

app.post('/claude',validate([body('messages').isArray({min:1,max:50}),body('messages.*.role').isIn(['user','assistant']),body('messages.*.content').isString().trim().isLength({min:1,max:8000})]),async(req,res)=>{if(!process.env.ANTHROPIC_API_KEY)return res.status(503).json({error:'AI unavailable — configure ANTHROPIC_API_KEY'});try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||'claude-sonnet-4-20250514',max_tokens:1500,system:req.body.systemPrompt,messages:req.body.messages}),signal:AbortSignal.timeout(30000)});const d=await r.json().catch(()=>({}));if(!r.ok)return res.status(r.status).json({error:d.error?.message||'AI failed'});res.json(d);}catch(e){res.status(502).json({error:'Could not reach AI',detail:process.env.NODE_ENV==='development'?e.message:undefined});}});

app.post('/sync',async(req,res)=>{if(Array.isArray(req.body.projects)){const rows=req.body.projects.slice(0,300).map(p=>({id:p.id,name:p.name||'',emoji:p.emoji||'📁',description:p.description||'',tech:p.tech||'',status:p.status||'Planning',priority:p.priority||'Medium',color:p.color||'#5C6680',progress:Number(p.progress||0),tasks:Array.isArray(p.tasks)?p.tasks:[]})).filter(p=>p.id&&p.name);await db.insertMany('projects',rows);}if(req.body.finance&&typeof req.body.finance==='object'){if(Array.isArray(req.body.finance.streams))await db.insertMany('finance_streams',req.body.finance.streams.slice(0,300));if(Array.isArray(req.body.finance.expenses))await db.insertMany('expenses',req.body.finance.expenses.slice(0,300));if(req.body.finance.targets)await db.insert('settings',{key:'finance_targets',value:JSON.stringify(req.body.finance.targets),updated_at:new Date().toISOString()},true);}if(Array.isArray(req.body.calendar)){const rows=req.body.calendar.slice(0,500).map(e=>({id:e.id,title:e.title||'',date:e.date||'',project:e.project||'',type:e.type||'session',done:!!e.done,notes:e.notes||'',source:e.source||'jakeos',starts_at:e.starts_at||e.dateTime||null,ends_at:e.ends_at||e.endDateTime||null,all_day:!!e.allDay,external_id:e.external_id||null})).filter(e=>e.id&&e.title&&e.date);await db.insertMany('calendar_events',rows);}if(Array.isArray(req.body.pipeline)){const rows=req.body.pipeline.slice(0,200).map(p=>({id:p.id,name:p.name||'',org:p.org||'',value:p.value||'',value_usd:Number(p.valueUSD||p.value_usd||0),stage:p.stage||'Prospect',type:p.type||'Consulting',deadline:p.deadline||null,contact:p.contact||'',notes:p.notes||''})).filter(p=>p.id&&p.name);await db.insertMany('pipeline',rows);}res.json({ok:true});});

app.post('/alerts/send',async(req,res)=>{try{const events=await db.all('calendar_events',{eq:{done:false},gte:{date:new Date().toISOString().slice(0,10)},order:{col:'date'}});const result=req.body.type==='digest'?await sendDeadlineDigest(events,{}):await sendAlert({message:String(req.body.message||'').slice(0,2000),subject:String(req.body.subject||'').slice(0,200),channels:req.body.channels});res.json({ok:true,result});}catch(e){res.status(500).json({ok:false,error:'Alert dispatch failed',detail:process.env.NODE_ENV==='development'?e.message:undefined});}});
app.post('/alerts/test',async(req,res)=>{const channel=['email','telegram','whatsapp'].includes(req.body.channel)?req.body.channel:'telegram';try{const r=await sendAlert({message:`✅ JakeOS test — ${new Date().toLocaleString('en-GB')}`,subject:'JakeOS — Test Alert',channels:[channel]});res.json(r[channel]||{ok:false});}catch(e){res.status(500).json({ok:false,error:'Test failed'});}});

app.post('/sms/receive',requireSmsSecret,async(req,res)=>{const text=String(req.body.text||req.body.Body||req.body.message||req.body.sms||'').trim().slice(0,2000),from=String(req.body.from||req.body.From||req.body.sender||'').trim().slice(0,50);if(!text)return res.status(400).json({error:'No SMS body'});const entry=parseSMS(text,from,req.body.date||new Date().toISOString())||{id:uid('sms'),type:'unparsed',raw:text,sender:from,timestamp:new Date().toISOString()};await db.insert('sms_transactions',{id:entry.id,type:entry.type||'unparsed',flow:entry.flow||'',amount:entry.amount||0,party:entry.party||'',provider:entry.provider||'',category:entry.category||'Other',timestamp:entry.timestamp,raw:entry.raw||text,sender:entry.sender||from,note:'',currency:'UGX'},true);res.status(204).send();});
app.get('/sms/webhook-info',(req,res)=>{const origin=process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`,secret=process.env.SMS_WEBHOOK_SECRET||'';res.json({configured:!!secret,url:secret?`${origin}/api/sms/receive?secret=${encodeURIComponent(secret)}`:null});});
app.get('/sms/transactions',async(req,res)=>res.json({transactions:await db.all('sms_transactions',{order:{col:'timestamp',asc:false},limit:Math.min(parseInt(req.query.limit)||100,500)})}));
app.patch('/sms/transactions/:id',async(req,res)=>{await db.update('sms_transactions',req.params.id.slice(0,100),{note:String(req.body.note||'').slice(0,500),category:String(req.body.category||'').slice(0,50)});res.json({ok:true});});
app.delete('/sms/transactions/:id',async(req,res)=>{await db.del('sms_transactions',req.params.id.slice(0,100));res.json({ok:true});});

app.get('/gcal/status',(_,res)=>res.json(gcal.getStatus()));
app.get('/gcal/events',(_,res)=>res.json({events:gcal.isConnected()?cache.gcalEvents:[],connected:gcal.isConnected(),email:gcal.getStatus().email}));
app.post('/gcal/sync',async(_,res)=>{if(!gcal.isConnected())return res.status(400).json({error:'Not connected'});try{cache.gcalEvents=await gcal.getAllEvents({days:90});for(const e of cache.gcalEvents)await db.insert('calendar_events',{id:e.id,title:e.title,date:e.date,project:e.project,type:e.type,done:false,source:'google',notes:e.desc||'',starts_at:e.dateTime,ends_at:e.endDateTime||null,all_day:e.allDay,external_id:e.id.replace(/^gcal_/,'')},true);res.json({ok:true,count:cache.gcalEvents.length,events:cache.gcalEvents});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.post('/gcal/disconnect',(_,res)=>{gcal.disconnect();cache.gcalEvents=[];res.json({ok:true});});

app.get('/invoices',async(req,res)=>res.json({invoices:await invoices.getInvoices(req.query.status)}));
app.post('/invoices',async(req,res)=>res.status(201).json({ok:true,invoice:await invoices.createInvoice(req.body)}));
app.patch('/invoices/:id/status',async(req,res)=>{const allowed=['Draft','Sent','Paid','Overdue','Cancelled'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status'});await invoices.updateStatus(req.params.id,req.body.status);res.json({ok:true});});
app.get('/invoices/:id/html',async(req,res)=>{const inv=await db.get('invoices',{eq:{id:req.params.id}});if(!inv)return res.status(404).json({error:'Not found'});res.type('html').send(invoices.generateHTML(inv));});
app.delete('/invoices/:id',async(req,res)=>{await db.del('invoices',req.params.id);res.json({ok:true});});

app.get('/crm/clients',async(req,res)=>{const[clients,stats]=await Promise.all([crm.getClients(req.query.status),crm.getCRMStats()]);res.json({clients,stats});});
app.get('/crm/clients/:id',async(req,res)=>{const client=await crm.getClient(req.params.id);if(!client)return res.status(404).json({error:'Not found'});res.json({client});});
app.post('/crm/clients',async(req,res)=>res.status(201).json({ok:true,client:await crm.createClient(req.body)}));
app.patch('/crm/clients/:id',async(req,res)=>{await crm.updateClient(req.params.id,req.body);res.json({ok:true});});
app.delete('/crm/clients/:id',async(req,res)=>{await crm.deleteClient(req.params.id);res.json({ok:true});});
app.post('/crm/clients/:id/interactions',async(req,res)=>res.status(201).json({ok:true,id:await crm.logInteraction(req.params.id,req.body)}));
app.post('/crm/clients/:id/followup',async(req,res)=>{await crm.scheduleFollowup(req.params.id,req.body);res.status(201).json({ok:true});});

app.get('/projects',async(_,res)=>res.json({projects:await db.all('projects',{order:{col:'name'}})}));
app.post('/projects',async(req,res)=>{const p={id:req.body.id||uid('proj'),name:String(req.body.name||'').trim(),emoji:req.body.emoji||'🚀',description:req.body.description||'',tech:req.body.tech||'',status:req.body.status||'Planning',priority:req.body.priority||'Medium',color:req.body.color||'#5E6AD2',progress:Number(req.body.progress||0),tasks:Array.isArray(req.body.tasks)?req.body.tasks:[]};if(!p.name)return res.status(400).json({error:'Project name is required'});res.status(201).json({ok:true,project:await db.insert('projects',p,true)||p});});
app.patch('/projects/:id',async(req,res)=>{const data={};if(Array.isArray(req.body.tasks))data.tasks=req.body.tasks;if(req.body.progress!==undefined)data.progress=Number(req.body.progress||0);for(const key of ['name','emoji','description','tech','status','priority','color'])if(req.body[key]!==undefined)data[key]=req.body[key];data.updated_at=new Date().toISOString();await db.update('projects',req.params.id,data);res.json({ok:true});});

app.get('/pipeline',async(_,res)=>{const rows=await db.all('pipeline',{order:{col:'created_at',asc:false}});res.json({pipeline:rows.map(p=>({...p,valueUSD:Number(p.value_usd||0)}))});});
app.post('/pipeline',async(req,res)=>{const valueUSD=Number(req.body.valueUSD||req.body.value_usd||0),payload={id:req.body.id||uid('pipe'),name:String(req.body.name||'').trim(),org:String(req.body.org||'').trim(),value_usd:valueUSD,value:req.body.value||(valueUSD>0?`$${valueUSD.toLocaleString()}`:'TBD'),stage:req.body.stage||'Prospect',type:req.body.type||'Partnership',deadline:req.body.deadline||null,contact:req.body.contact||'',notes:req.body.notes||''};if(!payload.name||!payload.org)return res.status(400).json({error:'Name and organization are required'});const item=await db.insert('pipeline',payload,true)||payload;res.status(201).json({ok:true,item:{...item,valueUSD:Number(item.value_usd||valueUSD||0)}});});

app.get('/radar/opportunities',async(req,res)=>res.json({opportunities:await radar.getOpportunities({status:req.query.status,saved:req.query.saved==='1'}),sources:await radar.getSources()}));
app.post('/radar/scan',async(_,res)=>{try{res.json({ok:true,results:await radar.scanAll()});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.patch('/radar/opportunities/:id',async(req,res)=>{await radar.updateOpportunity(req.params.id,req.body);res.json({ok:true});});
app.delete('/radar/opportunities/:id',async(req,res)=>{await db.del('opportunities',req.params.id);res.json({ok:true});});

app.get('/cashflow',async(_,res)=>{const[streams,expenses,invList]=await Promise.all([db.all('finance_streams',{order:{col:'month'}}),db.all('expenses',{order:{col:'name'}}),db.all('invoices',{order:{col:'due_date'}})]),monthlyExpenses=expenses.filter(e=>e.monthly).reduce((s,e)=>s+Number(e.amount||0),0),now=new Date(),projection=[0,1,2].map(i=>{const d=new Date(now.getFullYear(),now.getMonth()+i,1),label=d.toLocaleDateString('en-GB',{month:'long',year:'numeric'}),ms=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,income=streams.filter(s=>s.month&&s.month.includes(String(d.getFullYear()))&&s.status!=='Projected').reduce((s,x)=>s+Number(x.amount||0),0),invIncome=invList.filter(v=>v.due_date&&v.due_date.startsWith(ms)&&v.status==='Sent').reduce((s,v)=>s+Number(v.total||0),0);return{label,month:ms,income:income+invIncome,expenses:monthlyExpenses,net:income+invIncome-monthlyExpenses};});res.json({streams,expenses,invoices:invList,projection,monthlyExpenses});});

app.get('/fetch-stats',async(req,res)=>{try{const url=await assertExternalUrl(req.query.url),r=await fetch(url.toString(),{headers:{'User-Agent':'JakeOS/5.1'},redirect:'error',signal:AbortSignal.timeout(8000)}),text=await r.text();if((r.headers.get('content-type')||'').includes('application/json')){try{return res.json(JSON.parse(text));}catch{}}res.type('text/plain').send(text.slice(0,50000));}catch(e){res.status(e.status||502).json({error:e.message||'Could not fetch URL'});}});

app.post('/groq/transcribe',async(req,res)=>{if(!process.env.GROQ_API_KEY)return res.status(503).json({error:'Configure GROQ_API_KEY on the server'});const{audio,mimeType,filename}=req.body;if(!audio)return res.status(400).json({error:'No audio data'});try{const buffer=Buffer.from(audio,'base64');if(buffer.length>10*1024*1024)return res.status(413).json({error:'Audio payload is too large'});const formData=new FormData();formData.append('file',new Blob([buffer],{type:mimeType||'audio/webm'}),filename||'memo.webm');formData.append('model','whisper-large-v3');formData.append('response_format','json');const r=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`},body:formData,signal:AbortSignal.timeout(60000)});const d=await r.json().catch(()=>({}));if(!r.ok)return res.status(r.status).json({error:d.error?.message||'Transcription failed'});res.json(d);}catch(e){res.status(500).json({error:e.message});}});

app.get('/fx-rates',async(req,res)=>{const base=['USD','UGX','KES','EUR','GBP'].includes(req.query.base)?req.query.base:'USD';try{const r=await fetch(`https://open.er-api.com/v6/latest/${base}`,{signal:AbortSignal.timeout(5000)}),d=await r.json();res.json({rates:d.rates,updated:d.time_last_update_utc,base});}catch{res.json({rates:{UGX:3680,KES:130,EUR:.92,GBP:.79,USD:1,TZS:2650,RWF:1380},updated:null,fallback:true,base});}});

app.get('/research/briefs',async(req,res)=>res.json({briefs:await db.all('research_briefs',{order:{col:'brief_date',asc:false},limit:Math.min(parseInt(req.query.limit)||20,100)})}));
app.post('/research/briefs',async(req,res)=>{const b={id:req.body.id||uid('brief'),brief_date:req.body.brief_date||new Date().toISOString().slice(0,10),title:String(req.body.title||'Weekly evidence brief').slice(0,500),summary:String(req.body.summary||'').slice(0,5000),items:Array.isArray(req.body.items)?req.body.items.slice(0,30):[],watchlist:Array.isArray(req.body.watchlist)?req.body.watchlist.slice(0,50):[]};res.status(201).json({ok:true,brief:await db.insert('research_briefs',b,true)});});

app.get('/digest-data',async(_,res)=>{const[events,pipeline,clients]=await Promise.all([db.all('calendar_events',{eq:{done:false},gte:{date:new Date().toISOString().slice(0,10)},order:{col:'date'},limit:10}),db.all('pipeline',{order:{col:'created_at',asc:false},limit:10}),db.all('clients',{order:{col:'name'},limit:20})]);res.json({events,pipeline,clients});});

let seeded=false;async function ensureSeeded(){if(seeded||!db.isReady())return;await db.seedIfEmpty().catch(()=>{});seeded=true;}ensureSeeded();
module.exports={app,ensureSeeded};
