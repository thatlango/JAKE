'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('./db');

const registryPath = path.join(__dirname, '..', 'estate-control', 'registry.json');
const LOCK_STATES = new Set(['ACTIVE','VERIFYING','MERGING','DEPLOYING','BLOCKED']);
const FINAL_STATES = new Set(['VERIFIED','AVAILABLE']);

function loadRegistry() {
  const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.repositories)) {
    throw new Error('Estate registry is invalid');
  }
  return parsed;
}

function repoById(id) {
  return loadRegistry().repositories.find(row => row.id === id) || null;
}

function safeText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function lockExpired(lock) {
  if (!lock?.expires_at) return true;
  return new Date(lock.expires_at).getTime() <= Date.now();
}

function publicLock(lock) {
  if (!lock) return null;
  return {
    repoId: lock.repo_id,
    workstreamId: lock.workstream_id,
    owner: lock.owner,
    branch: lock.branch,
    state: lock.state,
    acquiredAt: lock.acquired_at,
    heartbeatAt: lock.heartbeat_at,
    expiresAt: lock.expires_at,
    expired: lockExpired(lock),
    metadata: lock.metadata || {}
  };
}

async function latestByRepo(table, repoIds) {
  if (!db.isReady() || !repoIds.length) return new Map();
  const result = await db.query(
    `SELECT DISTINCT ON (repo_id) * FROM ${table}
     WHERE repo_id = ANY($1::text[])
     ORDER BY repo_id, created_at DESC`,
    [repoIds]
  );
  return new Map(result.rows.map(row => [row.repo_id, row]));
}

async function controlSnapshot() {
  const registry = loadRegistry();
  const ids = registry.repositories.map(row => row.id);
  const [locks, checkpoints, releases] = await Promise.all([
    db.isReady() ? db.query('SELECT * FROM estate_repo_locks WHERE repo_id = ANY($1::text[])', [ids]).then(r => r.rows) : [],
    latestByRepo('estate_checkpoints', ids),
    latestByRepo('estate_releases', ids)
  ]);
  const lockMap = new Map(locks.map(row => [row.repo_id, row]));
  const repositories = registry.repositories.map(repo => {
    const lock = lockMap.get(repo.id) || null;
    const checkpoint = checkpoints.get(repo.id) || null;
    const release = releases.get(repo.id) || null;
    let state = 'AVAILABLE';
    if (lock && !lockExpired(lock)) state = lock.state;
    else if (release?.smoke_status === 'success') state = 'VERIFIED';
    else if (checkpoint?.checkpoint_type === 'blocked') state = 'BLOCKED';
    return {
      ...repo,
      state,
      lock: publicLock(lock),
      checkpoint: checkpoint ? {
        workstreamId: checkpoint.workstream_id,
        branch: checkpoint.branch,
        commitSha: checkpoint.commit_sha,
        checkpointType: checkpoint.checkpoint_type,
        prNumber: checkpoint.pr_number,
        ciStatus: checkpoint.ci_status,
        tests: checkpoint.tests || {},
        notes: checkpoint.notes || '',
        createdAt: checkpoint.created_at
      } : null,
      release: release ? {
        environment: release.environment,
        sourceSha: release.source_sha,
        artifactType: release.artifact_type,
        artifactVersion: release.artifact_version,
        artifactRef: release.artifact_ref,
        deployRef: release.deploy_ref,
        ciStatus: release.ci_status,
        smokeStatus: release.smoke_status,
        rollbackRef: release.rollback_ref,
        evidence: release.evidence || {},
        deployedAt: release.deployed_at,
        createdAt: release.created_at
      } : null
    };
  });
  const counts = repositories.reduce((acc, row) => {
    acc[row.state] = (acc[row.state] || 0) + 1;
    return acc;
  }, {});
  return {
    schemaVersion: registry.schemaVersion,
    authority: registry.authority,
    generatedAt: new Date().toISOString(),
    databaseReady: db.isReady(),
    counts,
    repositories
  };
}

async function event(client, {repoId='', workstreamId='', eventType, actor='estate-sprint', payload={}}) {
  await client.query(
    'INSERT INTO estate_control_events(repo_id,workstream_id,event_type,actor,payload) VALUES($1,$2,$3,$4,$5::jsonb)',
    [repoId, workstreamId, eventType, actor, JSON.stringify(payload || {})]
  );
}

async function claimRepo(repoId, input) {
  const repo = repoById(repoId);
  if (!repo) return {status:404, body:{error:'Repository is not registered'}};
  if (!db.isReady()) return {status:503, body:{error:'Estate Control database is not configured'}};
  const workstreamId = safeText(input.workstreamId, 160);
  const owner = safeText(input.owner || 'estate-sprint', 120);
  const branch = safeText(input.branch, 240);
  const ttlMinutes = Math.max(15, Math.min(Number(input.ttlMinutes || 120), 360));
  if (!workstreamId) return {status:400, body:{error:'workstreamId is required'}};
  const token = crypto.randomUUID();
  const result = await db.withTransaction(async client => {
    const current = await client.query('SELECT * FROM estate_repo_locks WHERE repo_id=$1 FOR UPDATE', [repoId]);
    const lock = current.rows[0];
    if (lock && !lockExpired(lock) && lock.workstream_id !== workstreamId) {
      return {status:409, body:{error:'Repository is already claimed', lock:publicLock(lock)}};
    }
    const expiresAt = new Date(Date.now() + ttlMinutes * 60000).toISOString();
    const saved = await client.query(
      `INSERT INTO estate_repo_locks(repo_id,workstream_id,owner,branch,state,lock_token,expires_at,metadata)
       VALUES($1,$2,$3,$4,'ACTIVE',$5,$6,$7::jsonb)
       ON CONFLICT(repo_id) DO UPDATE SET
         workstream_id=EXCLUDED.workstream_id, owner=EXCLUDED.owner, branch=EXCLUDED.branch,
         state='ACTIVE', lock_token=EXCLUDED.lock_token, acquired_at=NOW(), heartbeat_at=NOW(),
         expires_at=EXCLUDED.expires_at, metadata=EXCLUDED.metadata
       RETURNING *`,
      [repoId, workstreamId, owner, branch, token, expiresAt, JSON.stringify(input.metadata || {})]
    );
    await event(client, {repoId, workstreamId, eventType:'repo.claimed', actor:owner, payload:{branch,ttlMinutes}});
    return {status:201, body:{ok:true, repo, lock:{...publicLock(saved.rows[0]), token}}};
  });
  return result;
}

async function requireLock(client, repoId, token) {
  const result = await client.query('SELECT * FROM estate_repo_locks WHERE repo_id=$1 FOR UPDATE', [repoId]);
  const lock = result.rows[0];
  if (!lock || lockExpired(lock)) return {error:'No active repository lock', status:409};
  const a = Buffer.from(String(lock.lock_token || ''));
  const b = Buffer.from(String(token || ''));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return {error:'Invalid repository lock token', status:403};
  return {lock};
}

const estateControlRouter = express.Router();

estateControlRouter.get('/', async (_, res) => {
  try { res.json(await controlSnapshot()); }
  catch (error) { res.status(500).json({error:error.message}); }
});

estateControlRouter.get('/registry', (_, res) => {
  try { res.json(loadRegistry()); }
  catch (error) { res.status(500).json({error:error.message}); }
});

estateControlRouter.post('/repos/:repoId/claim', async (req, res) => {
  try {
    const result = await claimRepo(req.params.repoId, req.body || {});
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({error:error.message});
  }
});

estateControlRouter.patch('/repos/:repoId/state', async (req, res) => {
  const state = safeText(req.body?.state, 40).toUpperCase();
  if (!LOCK_STATES.has(state)) return res.status(400).json({error:'Invalid active state'});
  try {
    const result = await db.withTransaction(async client => {
      const auth = await requireLock(client, req.params.repoId, req.get('x-estate-lock-token'));
      if (auth.error) return {status:auth.status, body:{error:auth.error}};
      const row = await client.query(
        'UPDATE estate_repo_locks SET state=$2, heartbeat_at=NOW(), expires_at=GREATEST(expires_at,NOW()+INTERVAL \'30 minutes\') WHERE repo_id=$1 RETURNING *',
        [req.params.repoId, state]
      );
      await event(client, {repoId:req.params.repoId, workstreamId:auth.lock.workstream_id, eventType:'repo.state', actor:auth.lock.owner, payload:{state}});
      return {status:200, body:{ok:true, lock:publicLock(row.rows[0])}};
    });
    res.status(result.status).json(result.body);
  } catch (error) { res.status(500).json({error:error.message}); }
});

estateControlRouter.post('/repos/:repoId/checkpoints', async (req, res) => {
  try {
    const result = await db.withTransaction(async client => {
      const auth = await requireLock(client, req.params.repoId, req.get('x-estate-lock-token'));
      if (auth.error) return {status:auth.status, body:{error:auth.error}};
      const commitSha = safeText(req.body?.commitSha, 80);
      const checkpointType = safeText(req.body?.checkpointType || 'pushed', 40);
      const allowed = new Set(['pushed','pr','merged','migration','artifact','deployed','blocked']);
      if (!commitSha || !allowed.has(checkpointType)) return {status:400, body:{error:'Valid commitSha and checkpointType are required'}};
      const ciStatus = ['unknown','pending','success','failure'].includes(req.body?.ciStatus) ? req.body.ciStatus : 'unknown';
      const inserted = await client.query(
        `INSERT INTO estate_checkpoints(repo_id,workstream_id,branch,commit_sha,checkpoint_type,pr_number,ci_status,tests,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,
        [req.params.repoId, auth.lock.workstream_id, safeText(req.body?.branch || auth.lock.branch,240), commitSha, checkpointType,
         Number.isInteger(req.body?.prNumber) ? req.body.prNumber : null, ciStatus, JSON.stringify(req.body?.tests || {}), safeText(req.body?.notes,2000)]
      );
      const nextState = checkpointType === 'blocked' ? 'BLOCKED' : auth.lock.state;
      await client.query('UPDATE estate_repo_locks SET state=$2,heartbeat_at=NOW(),expires_at=NOW()+INTERVAL \'2 hours\' WHERE repo_id=$1',[req.params.repoId,nextState]);
      await event(client,{repoId:req.params.repoId,workstreamId:auth.lock.workstream_id,eventType:'checkpoint.recorded',actor:auth.lock.owner,payload:{commitSha,checkpointType,ciStatus}});
      return {status:201, body:{ok:true, checkpoint:inserted.rows[0]}};
    });
    res.status(result.status).json(result.body);
  } catch (error) { res.status(500).json({error:error.message}); }
});

estateControlRouter.post('/repos/:repoId/releases', async (req, res) => {
  try {
    const result = await db.withTransaction(async client => {
      const auth = await requireLock(client, req.params.repoId, req.get('x-estate-lock-token'));
      if (auth.error) return {status:auth.status, body:{error:auth.error}};
      const sourceSha = safeText(req.body?.sourceSha, 80);
      const ciStatus = ['unknown','pending','success','failure'].includes(req.body?.ciStatus) ? req.body.ciStatus : 'unknown';
      const smokeStatus = ['unknown','pending','success','failure'].includes(req.body?.smokeStatus) ? req.body.smokeStatus : 'unknown';
      if (!sourceSha) return {status:400, body:{error:'sourceSha is required'}};
      if (ciStatus !== 'success' || smokeStatus !== 'success') {
        return {status:409, body:{error:'A production release cannot be verified until CI and smoke checks are successful'}};
      }
      const repo = repoById(req.params.repoId);
      const inserted = await client.query(
        `INSERT INTO estate_releases(repo_id,product_code,environment,source_sha,artifact_type,artifact_version,artifact_ref,deploy_ref,ci_status,smoke_status,rollback_ref,evidence,deployed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13) RETURNING *`,
        [req.params.repoId, repo?.product || '', safeText(req.body?.environment || 'production',50), sourceSha,
         safeText(req.body?.artifactType,80), safeText(req.body?.artifactVersion,120), safeText(req.body?.artifactRef,500),
         safeText(req.body?.deployRef,500), ciStatus, smokeStatus, safeText(req.body?.rollbackRef,500),
         JSON.stringify(req.body?.evidence || {}), req.body?.deployedAt || new Date().toISOString()]
      );
      await event(client,{repoId:req.params.repoId,workstreamId:auth.lock.workstream_id,eventType:'release.verified',actor:auth.lock.owner,payload:{sourceSha,artifactVersion:req.body?.artifactVersion||'',deployRef:req.body?.deployRef||''}});
      await client.query('DELETE FROM estate_repo_locks WHERE repo_id=$1',[req.params.repoId]);
      return {status:201, body:{ok:true, state:'VERIFIED', release:inserted.rows[0]}};
    });
    res.status(result.status).json(result.body);
  } catch (error) { res.status(500).json({error:error.message}); }
});

estateControlRouter.delete('/repos/:repoId/claim', async (req, res) => {
  try {
    const result = await db.withTransaction(async client => {
      const auth = await requireLock(client, req.params.repoId, req.get('x-estate-lock-token'));
      if (auth.error) return {status:auth.status, body:{error:auth.error}};
      await client.query('DELETE FROM estate_repo_locks WHERE repo_id=$1',[req.params.repoId]);
      await event(client,{repoId:req.params.repoId,workstreamId:auth.lock.workstream_id,eventType:'repo.released',actor:auth.lock.owner});
      return {status:200, body:{ok:true,state:'AVAILABLE'}};
    });
    res.status(result.status).json(result.body);
  } catch (error) { res.status(500).json({error:error.message}); }
});

estateControlRouter.get('/events', async (req, res) => {
  if (!db.isReady()) return res.json({events:[]});
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
  try {
    const result = await db.query('SELECT * FROM estate_control_events ORDER BY created_at DESC LIMIT $1',[limit]);
    res.json({events:result.rows});
  } catch (error) { res.status(500).json({error:error.message}); }
});

module.exports = { estateControlRouter, loadRegistry, controlSnapshot, lockExpired, FINAL_STATES };
