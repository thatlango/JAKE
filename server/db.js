'use strict';
// ── JAKE Database (Supabase/PostgreSQL) ──
// Free tier: 500MB, unlimited API requests
// Netlify env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY

const { createClient } = require('@supabase/supabase-js');

let _client = null;

function deriveSupabaseUrlFromConnectionString(connectionString) {
  if (!connectionString) return null;
  try {
    const parsed = new URL(connectionString);
    const match = parsed.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
    if (!match) return null;
    return `https://${match[1]}.supabase.co`;
  } catch {
    return null;
  }
}

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL
    || deriveSupabaseUrlFromConnectionString(process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL);
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[DB] Missing Supabase credentials. Set SUPABASE_URL + SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY fallback).');
    if (!process.env.SUPABASE_URL && (process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL)) {
      const derived = deriveSupabaseUrlFromConnectionString(process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL);
      if (!derived) {
        console.warn('[DB] Could not derive SUPABASE_URL from connection string.');
      } else {
        console.warn(`[DB] Derived project URL from connection string: ${derived}`);
      }
    }
    if (process.env.SUPABASE_DB_PASSWORD) {
      console.warn('[DB] SUPABASE_DB_PASSWORD is set but unused by this app (it uses the Supabase API client, not direct Postgres auth).');
    }
    return null;
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

function isReady() {
  const resolvedUrl = process.env.SUPABASE_URL
    || deriveSupabaseUrlFromConnectionString(process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL);
  return !!(resolvedUrl && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY));
}

async function all(table, opts = {}) {
  const db = getClient();
  if (!db) return [];
  try {
    let q = db.from(table).select(opts.select || '*');
    if (opts.eq)    Object.entries(opts.eq).forEach(([k,v]) => { q = q.eq(k, v); });
    if (opts.neq)   Object.entries(opts.neq).forEach(([k,v]) => { q = q.neq(k, v); });
    if (opts.gte)   Object.entries(opts.gte).forEach(([k,v]) => { q = q.gte(k, v); });
    if (opts.lte)   Object.entries(opts.lte).forEach(([k,v]) => { q = q.lte(k, v); });
    if (opts.filter) q = q.filter(opts.filter.col, opts.filter.op, opts.filter.val);
    if (opts.order) q = q.order(opts.order.col, { ascending: opts.order.asc !== false });
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) { console.error(`[DB] all(${table}):`, error.message); return []; }
    return data || [];
  } catch (e) { console.error(`[DB] all(${table}):`, e.message); return []; }
}

async function get(table, opts = {}) {
  const rows = await all(table, { ...opts, limit: 1 });
  return rows[0] || null;
}

async function insert(table, data, upsert = false) {
  const db = getClient();
  if (!db) return null;
  try {
    const q = upsert
      ? db.from(table).upsert(data, { onConflict: 'id' })
      : db.from(table).insert(data);
    const { data: result, error } = await q.select().single();
    if (error) { console.error(`[DB] insert(${table}):`, error.message); return null; }
    return result;
  } catch (e) { console.error(`[DB] insert(${table}):`, e.message); return null; }
}

async function insertMany(table, rows) {
  const db = getClient();
  if (!db || !rows.length) return 0;
  try {
    const { error } = await db.from(table).upsert(rows, { onConflict: 'id' });
    if (error) { console.error(`[DB] insertMany(${table}):`, error.message); return 0; }
    return rows.length;
  } catch (e) { return 0; }
}

async function update(table, id, data) {
  const db = getClient();
  if (!db) return false;
  try {
    const { error } = await db.from(table).update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { console.error(`[DB] update(${table}):`, error.message); return false; }
    return true;
  } catch (e) { return false; }
}

async function del(table, id) {
  const db = getClient();
  if (!db) return false;
  try {
    const { error } = await db.from(table).delete().eq('id', id);
    if (error) { console.error(`[DB] del(${table}):`, error.message); return false; }
    return true;
  } catch (e) { return false; }
}

async function count(table, opts = {}) {
  const db = getClient();
  if (!db) return 0;
  try {
    let q = db.from(table).select('*', { count: 'exact', head: true });
    if (opts.eq) Object.entries(opts.eq).forEach(([k,v]) => { q = q.eq(k, v); });
    if (opts.lte) Object.entries(opts.lte).forEach(([k,v]) => { q = q.lte(k, v); });
    const { count: n, error } = await q;
    if (error) return 0;
    return n || 0;
  } catch { return 0; }
}

async function seedIfEmpty() {
  if (!(await count('clients') === 0)) return;
  await insertMany('clients', [
    { id:'c_palladium',   name:'Palladium Team',        org:'Palladium',       type:'Partner',  status:'Active', notes:'Active partner. Northern Uganda programmes.', avatar_emoji:'🏢' },
    { id:'c_gopa',        name:'GOPA AFC Team',          org:'GOPA AFC',        type:'Partner',  status:'Active', notes:'Agricultural capacity building partner.', avatar_emoji:'🌾' },
    { id:'c_lead4africa', name:'Lead4Africa Programme',  org:'Lead4Africa',     type:'Client',   status:'Active', notes:'4Africa Incubator. March–June 2026.', avatar_emoji:'🌱' },
    { id:'c_2xglobal',    name:'2X Global Partnerships', org:'2X Global',       type:'Prospect', status:'Active', notes:'Gender-smart tools. $24K. Applied.', avatar_emoji:'♀️' },
    { id:'c_muni',        name:'Muni University',        org:'Muni University', type:'Partner',  status:'Active', notes:'Academic partnership. MOU in discussion.', avatar_emoji:'🎓' },
  ]);
  console.log('[DB] Seeded clients');
}

module.exports = { getClient, isReady, all, get, insert, insertMany, update, del, count, seedIfEmpty };
