'use strict';
// Daily digest at 07:00 EAT = 04:00 UTC
const { schedule } = require('@netlify/functions');
const { sendDeadlineDigest } = require('../../server/alerts');
const gcal = require('../../server/gcal');
const crm = require('../../server/crm');
const db = require('../../server/db');

const handler = async () => {
  console.log('[CRON] Daily tasks starting:', new Date().toISOString());

  // 1. GCal sync
  let gcalEvents = [];
  if (gcal.isConnected()) {
    try {
      gcalEvents = await gcal.getAllEvents({ days: 90 });
      console.log(`[CRON] GCal: ${gcalEvents.length} events`);
    } catch (e) { console.warn('[CRON] GCal sync failed:', e.message); }
  }

  // 2. CRM follow-ups
  try {
    const r = await crm.processDueFollowups();
    console.log(`[CRON] Follow-ups: ${r.sent}/${r.total} sent`);
  } catch (e) { console.warn('[CRON] Follow-ups failed:', e.message); }

  // 3. Deadline digest
  try {
    const events = await db.all('calendar_events', { eq: { done: false }, gte: { date: new Date().toISOString().slice(0,10) }, order: { col: 'date' } });
    const combined = [...events, ...gcalEvents.map(e => ({ ...e, project: e.calendarName || 'Google Calendar', type: 'gcal' }))];
    const result = await sendDeadlineDigest(combined, {});
    const tg = result.telegram?.ok ? '✓ Telegram' : `✗ ${result.telegram?.error || 'skip'}`;
    const em = result.email?.ok    ? '✓ Email'    : `✗ ${result.email?.error || 'skip'}`;
    console.log(`[CRON] Digest: ${tg} | ${em}`);
  } catch (e) { console.error('[CRON] Digest failed:', e.message); }

  return { statusCode: 200 };
};

exports.handler = schedule('0 4 * * *', handler);
