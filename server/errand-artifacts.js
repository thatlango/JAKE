'use strict';

const crypto=require('crypto');
const db=require('./db');

const text=(v,max=250000)=>String(v??'').slice(0,max);
const id=p=>p+'_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

async function storeArtifact({dispatchId,runId,agentId=null,name='deliverable',artifactType='deliverable',mediaType='text/plain',contentText=null,contentJson=null,storageUri=null,sourceTool=null,metadata={}}){
  const payload=contentText!==null?text(contentText):JSON.stringify(contentJson??{});
  const digest=hash(payload);
  const latest=(await db.query('SELECT COALESCE(MAX(version),0)::int AS version FROM agent_artifact_versions WHERE dispatch_id=$1 AND name=$2',[dispatchId,name])).rows[0]?.version||0;
  const version=Number(latest)+1;
  const row=(await db.query(`INSERT INTO agent_artifact_versions(
      id,dispatch_id,run_id,agent_id,name,artifact_type,media_type,content_text,content_json,storage_uri,sha256,version,source_tool,metadata
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14::jsonb) RETURNING *`,[
      id('artifactv'),dispatchId,runId,agentId,text(name,300),text(artifactType,80),text(mediaType,120),
      contentText===null?null:text(contentText),contentJson===null?null:JSON.stringify(contentJson),storageUri?text(storageUri,4000):null,
      digest,version,sourceTool?text(sourceTool,120):null,JSON.stringify(metadata||{})
    ])).rows[0];
  const uri=storageUri||`jakeos://errands/${dispatchId}/artifacts/${row.id}`;
  await db.query(`INSERT INTO agent_artifacts(id,run_id,agent_id,name,artifact_type,uri,evidence_kind,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    ON CONFLICT(id) DO UPDATE SET uri=EXCLUDED.uri,metadata=EXCLUDED.metadata`,[
      'artifact_'+row.id,runId,agentId,text(name,300),text(artifactType,80),uri,text(artifactType,80),
      JSON.stringify({dispatch_id:dispatchId,artifact_version_id:row.id,sha256:digest,version})
    ]);
  return{...row,uri};
}

async function listArtifacts(dispatchId){
  return(await db.query('SELECT * FROM agent_artifact_versions WHERE dispatch_id=$1 ORDER BY created_at DESC,version DESC',[dispatchId])).rows;
}

module.exports={storeArtifact,listArtifacts};
