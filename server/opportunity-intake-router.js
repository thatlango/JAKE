'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const db=require('./db');
const {requireOpportunityScope,READ_SCOPE,WRITE_SCOPE}=require('./opportunities-connector-auth');
const {enqueueOpportunity,processOpportunityIntake}=require('./opportunity-intake');

const router=express.Router();
router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));

router.post('/',requireOpportunityScope(WRITE_SCOPE),async(req,res)=>{
  try{
    const payload=req.body?.opportunity||req.body;
    const result=await enqueueOpportunity(payload,{
      source:req.body?.intake_source||req.get('x-intake-source')||'connector',
      idempotencyKey:req.get('idempotency-key')||req.body?.idempotency_key
    });
    if(String(process.env.OPPORTUNITY_INTAKE_INLINE||'false').toLowerCase()==='true')await processOpportunityIntake({limit:1});
    res.status(result.replayed?200:202).json({accepted:true,replayed:result.replayed,intake:result.intake});
  }catch(error){res.status(error.status||500).json({error:error.message,code:error.status===422?'INVALID_INPUT':'INTAKE_ERROR'});}
});

router.post('/batch',requireOpportunityScope(WRITE_SCOPE),async(req,res)=>{
  try{
    const items=req.body?.opportunities;
    if(!Array.isArray(items)||!items.length||items.length>100)return res.status(422).json({error:'Provide 1-100 opportunities'});
    const results=[];
    for(const payload of items)results.push(await enqueueOpportunity(payload,{source:req.body?.intake_source||'connector'}));
    res.status(202).json({accepted:results.length,results});
  }catch(error){res.status(error.status||500).json({error:error.message});}
});

router.get('/',requireOpportunityScope(READ_SCOPE),async(req,res)=>{
  try{
    const state=String(req.query.state||'').trim();
    const values=[];let where='';
    if(state){values.push(state);where='WHERE state=$1';}
    values.push(Math.max(1,Math.min(Number(req.query.limit)||50,200)));
    const rows=(await db.query(`SELECT * FROM opportunity_intake ${where} ORDER BY created_at DESC LIMIT $${values.length}`,values)).rows;
    res.json({intake:rows,count:rows.length});
  }catch(error){res.status(500).json({error:error.message});}
});

router.get('/:id',requireOpportunityScope(READ_SCOPE),async(req,res)=>{
  const row=await db.get('opportunity_intake',{eq:{id:String(req.params.id).slice(0,120)}});
  if(!row)return res.status(404).json({error:'Intake item not found'});
  res.json({intake:row});
});

module.exports={opportunityIntakeRouter:router};
