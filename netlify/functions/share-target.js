'use strict';
const db = require('../../server/db');
const { parseSMS } = require('../../server/sms-parser');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const params = new URLSearchParams(event.body || '');
  const text = (params.get('text') || params.get('title') || '').trim().slice(0, 2000);

  if (text && db.isReady()) {
    const entry = parseSMS(text, 'share-target', new Date().toISOString())
      || { id: `sms_${Date.now()}`, type: 'unparsed', raw: text, sender: 'share-target', timestamp: new Date().toISOString() };
    await db.insert('sms_transactions', {
      id: entry.id, type: entry.type || 'unparsed', flow: entry.flow || '',
      amount: entry.amount || 0, party: entry.party || '', provider: entry.provider || '',
      category: entry.category || 'Other', timestamp: entry.timestamp,
      raw: entry.raw || text, sender: 'share-target', note: '', currency: 'UGX'
    }, true);
  }

  return {
    statusCode: 302,
    headers: { Location: '/?module=personal-finance' }
  };
};
