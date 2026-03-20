'use strict';
const { schedule } = require('@netlify/functions');
const radar = require('../../server/radar');

const handler = async () => {
  console.log('[CRON] Radar scan starting:', new Date().toISOString());
  try {
    const results = await radar.scanAll();
    const added = results.reduce((s, r) => s + (r.added || 0), 0);
    console.log(`[CRON] Radar: ${added} new opportunities from ${results.length} sources`);
    results.forEach(r => { if (r.error) console.warn(`  ✗ ${r.source}: ${r.error}`); else console.log(`  ✓ ${r.source}: ${r.added} added`); });
  } catch (e) {
    console.error('[CRON] Radar scan failed:', e.message);
  }
  return { statusCode: 200 };
};

exports.handler = schedule('0 */6 * * *', handler);
