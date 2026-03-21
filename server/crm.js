'use strict';
const db = require('./db');
const { sendAlert } = require('./alerts');

function uid() { return `c_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

async function getClients(status = null) {
  return db.all('clients', status ? { eq: { status }, order: { col: 'name' } } : { order: { col: 'name' } });
}

async function getClient(id) {
  const client = await db.get('clients', { eq: { id } });
  if (!client) return null;
  client.interactions = await db.all('interactions', { eq: { client_id: id }, order: { col: 'date', asc: false } });
  client.followups    = await db.all('followups',    { eq: { client_id: id, sent: false }, order: { col: 'due_date' } });
  return client;
}

async function createClient(data) {
  const id = data.id || uid();
  return db.insert('clients', { id, name:data.name, org:data.org||'', role:data.role||'',
    email:data.email||'', phone:data.phone||'', whatsapp:data.whatsapp||data.phone||'', location:data.location||'',
    type:data.type||'Partner', status:data.status||'Active', notes:data.notes||'',
    avatar_emoji:data.avatar_emoji||'👤', pipeline_id:data.pipeline_id||null,
    last_contact:data.last_contact||null, next_followup:data.next_followup||null });
}

async function updateClient(id, data) {
  const allowed = ['name','org','role','email','phone','whatsapp','location','type','status','notes','avatar_emoji','last_contact','next_followup','pipeline_id','contract_value','contract_currency'];
  const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
  if (Object.keys(clean).length) await db.update('clients', id, clean);
}

async function deleteClient(id) { await db.del('clients', id); }

async function logInteraction(clientId, data) {
  const row = await db.insert('interactions', {
    client_id: clientId, type: data.type||'note', title: data.title||'',
    content: data.content, date: data.date || new Date().toISOString().slice(0,10),
    outcome: data.outcome||'', follow_up_date: data.follow_up_date||null
  });
  await db.update('clients', clientId, { last_contact: data.date || new Date().toISOString().slice(0,10) });
  if (data.follow_up_date) {
    const c = await db.get('clients', { eq: { id: clientId } });
    await scheduleFollowup(clientId, {
      message: data.follow_up_note || `Follow up with ${c?.name || 'client'}`,
      due_date: data.follow_up_date, channel: 'telegram'
    });
  }
  return row?.id;
}

async function scheduleFollowup(clientId, data) {
  await db.insert('followups', { client_id: clientId, message: data.message, due_date: data.due_date, channel: data.channel||'telegram', sent: false });
  await db.update('clients', clientId, { next_followup: data.due_date });
}

async function processDueFollowups() {
  const today = new Date().toISOString().slice(0,10);
  const due = await db.all('followups', { eq: { sent: false }, lte: { due_date: today } });
  let sent = 0;
  for (const f of due) {
    const c = await db.get('clients', { eq: { id: f.client_id } });
    const msg = `📋 *JAKE Follow-up*\n\n*${c?.name||'Client'}* (${c?.org||''})\n\n${f.message}\n\n_Due: ${f.due_date}_`;
    try {
      const r = await sendAlert({ message: msg, subject: `Follow-up: ${c?.name}`, channels: [f.channel||'telegram'] });
      if (r?.telegram?.ok || r?.email?.ok) { await db.update('followups', f.id, { sent: true }); sent++; }
    } catch {}
  }
  return { sent, total: due.length };
}

async function getCRMStats() {
  const [total, active, dueF, int7, noC] = await Promise.all([
    db.count('clients'),
    db.count('clients', { eq: { status: 'Active' } }),
    db.count('followups', { eq: { sent: false }, lte: { due_date: new Date().toISOString().slice(0,10) } }),
    db.count('interactions', { gte: { date: new Date(Date.now()-7*86400000).toISOString().slice(0,10) } }),
    db.all('clients', { eq: { status: 'Active' } }).then(cs =>
      cs.filter(c => !c.last_contact || new Date(c.last_contact) < new Date(Date.now()-30*86400000)).length
    ),
  ]);
  return { total, active, dueFollowups: dueF, interactions7d: int7, noContact30d: noC };
}

module.exports = { getClients, getClient, createClient, updateClient, deleteClient, logInteraction, scheduleFollowup, processDueFollowups, getCRMStats };
