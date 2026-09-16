'use strict';
const express=require('express');
const db=require('./db');
const {createData,patchData,duplicateFor}=require('./opportunities-connector');
const router=express.Router();
const tools=[
 {name:'opportunities_list',description:'List canonical JakeOS opportunities',inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:200}}}},
 {name:'opportunities_upsert',description:'Create or update a canonical JakeOS opportunity, deduplicating by source URL or issuer and title',inputSchema:{type:'object',required:['title','org'],properties:{title:{type:'string'},org:{type:'string'},source_url:{type:'string'},opportunity_summary:{type:'string'},fit_score:{type:'number',minimum:0,maximum:5},fit_status:{type:'string'},eligibility_status:{type:'string'},assessment_status:{type:'string'},assessment_confidence:{type:'string'},fit_summary:{type:'string'},decision_rationale:{type:'string'},bid_posture:{type:'string'},mandatory_requirements:{type:'array',items:{type:'string'}},desirable_requirements:{type:'array',items:{type:'string'}},strongest_matches:{type:'array',items:{type:'string'}},gaps:{type:'array',items:{type:'string'}},hard_blockers:{type:'array',items:{type:'string'}},deliverables:{type:'array',items:{type:'string'}},application_requirements:{type:'array',items:{type:'string'}},strategic_reasons:{type:'array',items:{type:'string'}},winning_strategy:{type:'string'},compensation:{type:'string'},start_window:{type:'string'},duration:{type:'string'},procurement_type:{type:'string'},arrangement:{type:'string'},location:{type:'string'},deadline:{type:'string'},source_context:{type:'string'},source_verified_at:{type:'string'},next_action:{type:'string'},watch_profile_id:{type:'string'}},additionalProperties:true}}
];
const result=v=>({content:[{type:'text',text:JSON.stringify(v)}],structuredContent:v});
async function call(name,args={}){
 if(name==='opportunities_list')return {opportunities:await db.all('opportunities',{order:{col:'updated_at',asc:false},limit:Math.max(1,Math.min(Number(args.limit)||100,200))})};
 if(name==='opportunities_upsert'){
   const existing=await duplicateFor(args);
   if(existing){await db.update('opportunities',existing.id,patchData(args,existing));return {action:'updated',opportunity:await db.get('opportunities',{eq:{id:existing.id}})};}
   return {action:'created',opportunity:await db.insert('opportunities',createData(args),false)};
 }
 throw new Error('Unknown tool');
}
router.post('/',async(req,res)=>{const b=req.body||{},id=b.id??null;try{
 if(b.method==='initialize')return res.json({jsonrpc:'2.0',id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'JakeOS Opportunities',version:'1.0.0'}}});
 if(b.method==='notifications/initialized')return res.status(202).end();
 if(b.method==='ping')return res.json({jsonrpc:'2.0',id,result:{}});
 if(b.method==='tools/list')return res.json({jsonrpc:'2.0',id,result:{tools}});
 if(b.method==='tools/call')return res.json({jsonrpc:'2.0',id,result:result(await call(b.params?.name,b.params?.arguments||{}))});
 return res.status(400).json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
}catch(e){return res.status(500).json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:e.message||'Tool failed'}],isError:true}});}});
module.exports={opportunitiesMcpRouter:router};
