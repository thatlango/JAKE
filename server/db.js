'use strict';
const { Pool, types } = require('pg');
types.setTypeParser(1700, value => value === null ? null : Number(value));

let pool = null;
const IDENT = /^[a-z_][a-z0-9_]*$/i;
function ident(value) {
  if (!IDENT.test(String(value))) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${String(value)}"`;
}
function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) return null;
  pool = new Pool({ connectionString:process.env.DATABASE_URL, max:Number(process.env.PG_POOL_MAX||8), idleTimeoutMillis:30000, connectionTimeoutMillis:5000, ssl:process.env.PGSSL==='require'?{rejectUnauthorized:false}:false });
  pool.on('error', err => console.error('[DB] pool error:', err.message));
  return pool;
}
function isReady(){ return !!process.env.DATABASE_URL; }
async function query(text, values=[]){ const database=getPool(); if(!database) throw new Error('DATABASE_URL is not configured'); return database.query(text,values); }
async function ping(){ if(!getPool()) return false; try{await query('SELECT 1');return true;}catch(e){console.error('[DB] ping:',e.message);return false;} }
function selectClause(select='*'){ if(select==='*')return '*'; return String(select).split(',').map(s=>ident(s.trim())).join(', '); }
function buildWhere(opts,values){ const clauses=[]; for(const [key,op] of [['eq','='],['neq','<>'],['gte','>='],['lte','<='],['gt','>'],['lt','<']]) for(const [col,val] of Object.entries(opts[key]||{})){values.push(val);clauses.push(`${ident(col)} ${op} $${values.length}`);} if(opts.filter){const map={eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<=',like:'LIKE',ilike:'ILIKE'};const op=map[opts.filter.op];if(!op)throw new Error('Unsupported filter op');values.push(opts.filter.val);clauses.push(`${ident(opts.filter.col)} ${op} $${values.length}`);} return clauses.length?` WHERE ${clauses.join(' AND ')}`:''; }
async function all(table,opts={}){ if(!getPool())return[];const values=[];let sql=`SELECT ${selectClause(opts.select||'*')} FROM ${ident(table)}`+buildWhere(opts,values);if(opts.order)sql+=` ORDER BY ${ident(opts.order.col)} ${opts.order.asc===false?'DESC':'ASC'}`;if(opts.limit){values.push(Math.max(1,Math.min(Number(opts.limit)||100,5000)));sql+=` LIMIT $${values.length}`;}try{return(await query(sql,values)).rows;}catch(e){console.error(`[DB] all(${table}):`,e.message);return[];} }
async function get(table,opts={}){const rows=await all(table,{...opts,limit:1});return rows[0]||null;}
function columns(data){return Object.keys(data).filter(k=>data[k]!==undefined);}
async function insert(table,data,upsert=false){if(!getPool())return null;const cols=columns(data);if(!cols.length)return null;const vals=cols.map(k=>data[k]);let sql=`INSERT INTO ${ident(table)} (${cols.map(ident).join(',')}) VALUES (${cols.map((_,i)=>`$${i+1}`).join(',')})`;if(upsert){const conflict=cols.includes('id')?'id':(cols.includes('key')?'key':null);if(conflict){const updates=cols.filter(c=>c!==conflict).map(c=>`${ident(c)}=EXCLUDED.${ident(c)}`).join(',');sql+=updates?` ON CONFLICT (${ident(conflict)}) DO UPDATE SET ${updates}`:` ON CONFLICT (${ident(conflict)}) DO NOTHING`;}}sql+=' RETURNING *';try{return(await query(sql,vals)).rows[0]||null;}catch(e){console.error(`[DB] insert(${table}):`,e.message);return null;}}
async function insertMany(table,rows){if(!Array.isArray(rows)||!rows.length)return 0;let n=0;for(const row of rows)if(await insert(table,row,true))n++;return n;}
async function update(table,id,data){if(!getPool())return false;const cols=columns(data);if(!cols.length)return true;const vals=cols.map(k=>data[k]);vals.push(id);try{await query(`UPDATE ${ident(table)} SET ${cols.map((c,i)=>`${ident(c)}=$${i+1}`).join(',')} WHERE ${ident('id')}=$${vals.length}`,vals);return true;}catch(e){console.error(`[DB] update(${table}):`,e.message);return false;}}
async function del(table,id){if(!getPool())return false;try{await query(`DELETE FROM ${ident(table)} WHERE ${ident('id')}=$1`,[id]);return true;}catch(e){console.error(`[DB] del(${table}):`,e.message);return false;}}
async function count(table,opts={}){if(!getPool())return 0;const vals=[];try{return(await query(`SELECT COUNT(*)::int AS n FROM ${ident(table)}`+buildWhere(opts,vals),vals)).rows[0]?.n||0;}catch(e){console.error(`[DB] count(${table}):`,e.message);return 0;}}
async function withTransaction(fn){const database=getPool();if(!database)throw new Error('DATABASE_URL is not configured');const client=await database.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
async function seedIfEmpty(){if((await count('clients'))>0)return;await insertMany('clients',[{id:'c_palladium',name:'Palladium Team',org:'Palladium',type:'Partner',status:'Active',notes:'Active partner. Northern Uganda programmes.',avatar_emoji:'🏢'},{id:'c_gopa',name:'GOPA AFC Team',org:'GOPA AFC',type:'Partner',status:'Active',notes:'Agricultural capacity building partner.',avatar_emoji:'🌾'},{id:'c_lead4africa',name:'Lead4Africa Programme',org:'Lead4Africa',type:'Client',status:'Active',notes:'4Africa Incubator.',avatar_emoji:'🌱'},{id:'c_muni',name:'Muni University',org:'Muni University',type:'Partner',status:'Active',notes:'Academic partnership.',avatar_emoji:'🎓'}]);console.log('[DB] seeded clients');}
module.exports={getPool,isReady,query,ping,all,get,insert,insertMany,update,del,count,withTransaction,seedIfEmpty};
