'use strict';
const db=require('./db');

const ROOTS=[
  {host:'tukutuku.org',product:'Tukutuku'},
  {host:'getprediq.site',product:'PredIQ'}
];

async function ensureRootDomains(){
  if(!db.isReady())return 0;
  let count=0;
  for(const root of ROOTS){
    await db.query(`INSERT INTO ops_domains(id,host,root_domain,kind,product,status,metadata)
      VALUES($1,$2,$2,'registrable',$3,'unknown','{}'::jsonb)
      ON CONFLICT(host) DO UPDATE SET root_domain=EXCLUDED.root_domain,kind='registrable',product=EXCLUDED.product`,
      [`domain-${root.host.replace(/[^a-z0-9]+/g,'-')}`,root.host,root.product]);
    count++;
  }
  return count;
}

module.exports={ensureRootDomains};
