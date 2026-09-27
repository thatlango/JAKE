'use strict';

const db=require('../server/db');
const {
  sprintSnapshot,
  updateAccount,
  createAction,
  completeAction
}=require('../server/revenue-sprint-mcp');

function usage(){
  return [
    'Usage:',
    '  node scripts/revenue-mission-cli.js snapshot [sprint_id]',
    '  node scripts/revenue-mission-cli.js update-account <json>',
    '  node scripts/revenue-mission-cli.js create-action <json>',
    '  node scripts/revenue-mission-cli.js complete-action <json>',
    '',
    'This CLI only exposes the bounded Revenue Mission operations used by JakeOS.',
    'It cannot send messages, submit bids, sign agreements, publish, or move money.'
  ].join('\n');
}

function parseJsonArg(raw){
  if(!raw)throw Object.assign(new Error('JSON payload is required'),{exitCode:2});
  let parsed;
  try{parsed=JSON.parse(raw);}catch{
    throw Object.assign(new Error('Payload must be valid JSON'),{exitCode:2});
  }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){
    throw Object.assign(new Error('Payload must be a JSON object'),{exitCode:2});
  }
  return parsed;
}

function output(value){
  process.stdout.write(JSON.stringify(value,null,2)+'\n');
}

async function main(argv=process.argv.slice(2)){
  const command=String(argv[0]||'').trim();
  if(!command||['help','--help','-h'].includes(command)){
    process.stdout.write(usage()+'\n');
    return;
  }

  if(command==='snapshot'){
    output(await sprintSnapshot(argv[1]||undefined));
    return;
  }
  if(command==='update-account'){
    output(await updateAccount(parseJsonArg(argv[1])));
    return;
  }
  if(command==='create-action'){
    output(await createAction(parseJsonArg(argv[1])));
    return;
  }
  if(command==='complete-action'){
    output(await completeAction(parseJsonArg(argv[1])));
    return;
  }

  throw Object.assign(new Error('Unknown Revenue Mission command: '+command),{exitCode:2});
}

if(require.main===module){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({error:error.message||'Revenue Mission command failed'})+'\n');
    process.exitCode=Number(error.exitCode)||1;
  }).finally(async()=>{
    const pool=db.getPool();
    if(pool)await pool.end().catch(()=>{});
  });
}

module.exports={main,parseJsonArg,usage};
