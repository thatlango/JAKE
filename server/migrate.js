'use strict';
const fs=require('fs');
const path=require('path');
const db=require('./db');

(async()=>{
  const dir=path.join(__dirname,'..','database');
  const files=fs.readdirSync(dir).filter(name=>name.endsWith('.sql')).sort((a,b)=>{
    if(a==='schema.sql')return -1;
    if(b==='schema.sql')return 1;
    return a.localeCompare(b);
  });
  for(const file of files){
    const sql=fs.readFileSync(path.join(dir,file),'utf8');
    await db.query(sql);
    console.log(`[JakeOS] applied ${file}`);
  }
  console.log('[JakeOS] database schema is up to date');
  await db.getPool()?.end();
})().catch(error=>{console.error('[JakeOS] migration failed:',error);process.exit(1);});
