'use strict';
const gcal = require('../../server/gcal');

exports.handler = async (event) => {
  if (!gcal.isConfigured()) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body style="font-family:sans-serif;background:#07090F;color:#DDE3F0;padding:40px"><h2 style="color:#FF4757">Google not configured</h2><p>Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Netlify environment variables.</p><a href="/" style="color:#F0B429">← Back to JAKE</a></body></html>'
    };
  }
  const host = event.headers['x-forwarded-host'] || event.headers.host;
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/auth/google/callback`;
  return {
    statusCode: 302,
    headers: { Location: gcal.buildAuthUrl(redirectUri) }
  };
};
