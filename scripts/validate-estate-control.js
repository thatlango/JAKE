'use strict';
const fs=require('fs');
const path=require('path');

const file=path.join(__dirname,'..','estate-control','registry.json');
const registry=JSON.parse(fs.readFileSync(file,'utf8'));
if(registry.schemaVersion!==1)throw new Error('registry schemaVersion must be 1');
if(!Array.isArray(registry.repositories)||registry.repositories.length===0)throw new Error('registry.repositories must be non-empty');

const ids=new Set(), repos=new Set();
for(const row of registry.repositories){
  for(const key of ['id','product','repo','branch','kind']) if(!row[key]) throw new Error(`${row.id||row.repo||'entry'} missing ${key}`);
  if(ids.has(row.id))throw new Error(`duplicate repository id: ${row.id}`);
  if(repos.has(row.repo))throw new Error(`duplicate GitHub repository: ${row.repo}`);
  ids.add(row.id);repos.add(row.repo);
  if(!Number.isInteger(row.priority)||row.priority<1)throw new Error(`${row.id} has invalid priority`);
  if(!Array.isArray(row.dependencies))throw new Error(`${row.id} dependencies must be an array`);
}
for(const row of registry.repositories){
  for(const dep of row.dependencies)if(!ids.has(dep))throw new Error(`${row.id} depends on unknown repository ${dep}`);
}

const visiting=new Set(), visited=new Set(), byId=new Map(registry.repositories.map(x=>[x.id,x]));
function visit(id){
  if(visiting.has(id))throw new Error(`dependency cycle detected at ${id}`);
  if(visited.has(id))return;
  visiting.add(id);
  for(const dep of byId.get(id).dependencies)visit(dep);
  visiting.delete(id);visited.add(id);
}
for(const id of ids)visit(id);

console.log(`Estate Control registry OK: ${registry.repositories.length} repositories, acyclic dependency graph`);
