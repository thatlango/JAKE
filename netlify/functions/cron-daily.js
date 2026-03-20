'use strict';
// Daily digest at 07:00 EAT = 04:00 UTC
const { schedule } = require('@netlify/functions');
const { sendDeadlineDigest } = require('../../server/alerts');
const gcal = require('../../server/gcal');
const crm  = require('../../server/crm');
const db   = require('../../server/db');

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
  let followups = [];
  try {
    const r = await crm.processDueFollowups();
    console.log(`[CRON] Follow-ups: ${r.sent}/${r.total} sent`);
    // Also fetch due followups for digest
    const today = new Date().toISOString().slice(0, 10);
    followups = await db.all('followups', { eq: { sent: false }, lte: { due_date: today } });
  } catch (e) { console.warn('[CRON] Follow-ups failed:', e.message); }

  // 3. Fetch finance streams for digest
  let finance = { streams: [] };
  try {
    const streams = await db.all('finance_streams', { order: { col: 'month' } });
    finance = { streams };
  } catch (e) { console.warn('[CRON] Finance fetch failed:', e.message); }

  // 4. Fetch pipeline for digest
  let pipeline = [];
  try {
    pipeline = await db.all('pipeline', { order: { col: 'stage' } });
  } catch (e) { console.warn('[CRON] Pipeline fetch failed:', e.message); }

  // 5. Deadline digest — combined calendar events
  try {
    const events = await db.all('calendar_events', {
      eq: { done: false },
      gte: { date: new Date().toISOString().slice(0, 10) },
      order: { col: 'date' },
    });
    const combined = [
      ...events,
      ...gcalEvents.map(e => ({ ...e, project: e.calendarName || 'Google Calendar', type: 'gcal' })),
    ];

    const result = await sendDeadlineDigest(combined, { finance, followups, pipeline });

    const tg = result.telegram?.ok   ? '✓ Telegram'  : `✗ ${result.telegram?.error   || 'skip'}`;
    const em = result.email?.ok      ? '✓ Email'     : `✗ ${result.email?.error      || 'skip'}`;
    const wa = result.whatsapp?.ok   ? '✓ WhatsApp'  : result.whatsapp?.skipped ? '– WhatsApp (not configured)'
                                                                                  : `✗ ${result.whatsapp?.error || 'skip'}`;
    console.log(`[CRON] Digest: ${tg} | ${em} | ${wa}`);
  } catch (e) { console.error('[CRON] Digest failed:', e.message); }

  return { statusCode: 200 };
};

exports.handler = schedule('0 4 * * *', handler);
