'use strict';
const express=require('express');
const db=require('./db');
const router=express.Router();
const statuses=new Set(['discovered','assessing','draft','internal_review','ready','submitted_unverified','submitted_verified','under_review','shortlisted','awarded','rejected','withdrawn','missed']);
const fields=['title','funder','initiative','opportunity_url','owner','amount','currency','deadline','status','submitted_at','submission_channel','submission_reference','receipt_url','next_action','next_action_due','follow_up_at','notes'];
function normalize(body,creating=false){
 const data={};
 for(const key of fields)if(Object.prototype.hasOwnProperty.call(body,key)){
  const value=body[key];
  if(value!==null && typeof value!=='string' && !(key==='amount' && typeof value==='number'))throw Object.assign(new Error('Invalid '+key),{status:422});
  data[key]=value===''?null:(typeof value==='string'?value.trim().slice(0,key==='notes'?10000:1000):value);
 }
 if(creating && !data.title)throw Object.assign(new Error('Title required'),{status:422});
 if(data.title!==undefined && (!data.title || data.title.length<3 || data.title.length>300))throw Object.assign(new Error('Title must be 3–300 characters'),{status:422});
 if(data.status!==undefined && !statuses.has(data.status))throw Object.assign(new Error('Invalid status'),{status:422});
 if(data.currency && !/^[A-Z]{3}$/.test(data.currency))throw Object.assign(new Error('Currency must be ISO 4217'),{status:422});
 if(data.amount!==undefined && data.amount!==null && (!Number.isFinite(Number(data.amount))||Number(data.amount)<0))throw Object.assign(new Error('Invalid amount'),{status:422});
 for(const key of ['deadline','submitted_at','next_action_due','follow_up_at'])if(data[key] && !Number.isFinite(Date.parse(data[key])))throw Object.assign(new Error('Invalid '+key),{status:422});
 for(const key of ['opportunity_url','receipt_url'])if(data[key]){let u;try{u=new URL(data[key]);}catch{}if(!u||u.protocol!=='https:')throw Object.assign(new Error(key+' requires HTTPS'),{status:422});}
 return data;
}
function actor(req){return String(req.user?.email||req.user?.sub||req.user?.id||'authenticated_user').slice(0,200);}
function fail(res,e){res.status(e.status||500).json({error:e.status?e.message:'Funding tracker request failed'});}
router.get('/',async(req,res)=>{try{const status=String(req.query.status||'');if(status&&!statuses.has(status))return res.status(422).json({error:'Invalid status'});const vals=status?[status]:[];const where=status?'WHERE status=$1':'';const result=await db.query('SELECT * FROM funding_applications '+where+' ORDER BY deadline ASC NULLS LAST,created_at DESC LIMIT 500',vals);res.json({applications:result.rows});}catch(e){fail(res,e);}});
router.get('/:id',async(req,res)=>{try{const app=await db.query('SELECT * FROM funding_applications WHERE id=$1',[req.params.id]);if(!app.rows.length)return res.status(404).json({error:'Not found'});const events=await db.query('SELECT * FROM funding_application_events WHERE application_id=$1 ORDER BY recorded_at DESC',[req.params.id]);res.json({application:app.rows[0],events:events.rows});}catch(e){fail(res,e);}});
router.post('/',async(req,res)=>{try{const data=normalize(req.body,true);const keys=Object.keys(data);const entry=await db.withTransaction(async client=>{const out=await client.query('INSERT INTO funding_applications ('+keys.map(k=>'"'+k+'"').join(',')+') VALUES ('+keys.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *',keys.map(k=>data[k]));await client.query('INSERT INTO funding_application_events(application_id,new_status,actor,reason) VALUES($1,$2,$3,$4)',[out.rows[0].id,out.rows[0].status,actor(req),'Created']);return out.rows[0];});res.status(201).json({application:entry});}catch(e){fail(res,e);}});
router.patch('/:id',async(req,res)=>{try{const data=normalize(req.body);delete data.id;const keys=Object.keys(data);if(!keys.length)return res.status(422).json({error:'No changes'});const updated=await db.withTransaction(async client=>{const old=await client.query('SELECT * FROM funding_applications WHERE id=$1 FOR UPDATE',[req.params.id]);if(!old.rows.length)return null;const current=old.rows[0];const merged={...current,...data};if(merged.status==='submitted_verified'&&(!merged.submitted_at||!merged.submission_channel||(!merged.submission_reference&&!merged.receipt_url)))throw Object.assign(new Error('A verified submission requires date, channel and confirmation reference or receipt'),{status:422});const values=keys.map(k=>data[k]);const out=await client.query('UPDATE funding_applications SET '+keys.map((k,i)=>'"'+k+'"=$'+(i+1)).join(',')+', updated_at=now() WHERE id=$'+(keys.length+1)+' RETURNING *',[...values,req.params.id]);if(data.status && data.status!==current.status)await client.query('INSERT INTO funding_application_events(application_id,old_status,new_status,actor,reason) VALUES($1,$2,$3,$4,$5)',[req.params.id,current.status,data.status,actor(req),String(req.body.reason||'Status changed').slice(0,500)]);return out.rows[0];});if(!updated)return res.status(404).json({error:'Not found'});res.json({application:updated});}catch(e){fail(res,e);}});
module.exports={fundingApplicationsRouter:router,normalize};