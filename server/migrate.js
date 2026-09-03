'use strict';
const fs=require('fs');
const path=require('path');
const db=require('./db');
(async()=>{const sql=fs.readFileSync(path.join(__dirname,'..','database','schema.sql'),'utf8');await db.query(sql);console.log('[JakeOS] database schema is up to date');await db.getPool()?.end();})().catch(error=>{console.error('[JakeOS] migration failed:',error);process.exit(1);});
