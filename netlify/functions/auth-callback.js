'use strict';
const gcal = require('../../server/gcal');

const PAGE = (content) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'text/html' },
  body: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>JAKE — Google Calendar</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#07090F;color:#DDE3F0;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}</style>
</head><body>${content}</body></html>`
});

exports.handler = async (event) => {
  const { code, error } = event.queryStringParameters || {};

  if (error) {
    return PAGE(`<div style="background:#0D1117;border:1px solid rgba(255,71,87,.3);border-radius:16px;padding:40px;text-align:center;max-width:440px">
      <div style="font-size:48px;margin-bottom:16px">❌</div>
      <h2 style="color:#FF4757;margin-bottom:12px">Authorisation denied</h2>
      <p style="color:#5C6680">${error}</p>
      <a href="/?module=integrations" style="display:inline-block;margin-top:20px;color:#F0B429">← Back to JAKE</a>
    </div>`);
  }

  if (!code) {
    return { statusCode: 400, body: 'No auth code received' };
  }

  try {
    const host = event.headers['x-forwarded-host'] || event.headers.host;
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const redirectUri = `${proto}://${host}/auth/google/callback`;
    const tokens = await gcal.exchangeCode(code, redirectUri);

    return PAGE(`<div style="background:#0D1117;border:1px solid rgba(14,203,129,.3);border-radius:16px;padding:40px;text-align:center;max-width:500px;width:90%">
      <div style="font-size:48px;margin-bottom:16px">✅</div>
      <h2 style="font-family:'Syne',sans-serif;color:#0ECB81;margin-bottom:8px">Google Calendar Connected!</h2>
      <p style="color:#5C6680;margin-bottom:20px">${tokens.email || 'Connected successfully'}</p>

      <div style="background:#131820;border:1px solid #1A2030;border-radius:10px;padding:16px;margin-bottom:20px;text-align:left">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#5C6680;margin-bottom:8px">⚠️ Save this as GOOGLE_REFRESH_TOKEN in Netlify → Site settings → Environment variables</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#22D3EE;word-break:break-all;line-height:1.6" id="rt">${tokens.refreshToken}</div>
      </div>

      <div style="display:flex;gap:10px;justify-content:center">
        <button onclick="navigator.clipboard.writeText(document.getElementById('rt').textContent).then(()=>{this.textContent='✓ Copied!';this.style.background='#0ECB81'})"
          style="background:#F0B429;color:#07090F;border:none;border-radius:8px;padding:10px 20px;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif;font-size:13px">
          Copy Token
        </button>
        <a href="/?module=calendar" style="background:#131820;color:#DDE3F0;border:1px solid #1A2030;border-radius:8px;padding:10px 20px;font-size:13px;text-decoration:none;display:inline-flex;align-items:center">
          Open Calendar →
        </a>
      </div>

      <p style="font-size:11px;color:#2A3050;margin-top:20px;line-height:1.6">
        Also add GOOGLE_USER_EMAIL = ${tokens.email || ''}<br>
        Once saved, redeploy JAKE on Netlify to activate persistent calendar sync.
      </p>
    </div>`);
  } catch (e) {
    return PAGE(`<div style="background:#0D1117;border:1px solid rgba(255,71,87,.3);border-radius:16px;padding:40px;text-align:center;max-width:440px">
      <div style="font-size:48px;margin-bottom:16px">⚠️</div>
      <h2 style="color:#FF4757;margin-bottom:12px">Connection failed</h2>
      <p style="color:#5C6680;margin-bottom:20px">${e.message}</p>
      <a href="/?module=integrations" style="color:#F0B429">← Try again</a>
    </div>`);
  }
};
