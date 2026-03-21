'use strict';
// ── JAKE Google Calendar Integration ──
// Uses Google OAuth2 (free — 1M requests/day)
//
// Netlify env vars required:
//   GOOGLE_CLIENT_ID      — from Google Cloud Console
//   GOOGLE_CLIENT_SECRET  — from Google Cloud Console
//   GOOGLE_REDIRECT_URI   — your Netlify URL + /auth/google/callback
//   GOOGLE_REFRESH_TOKEN  — auto-saved after first auth (you don't set this manually)

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ── In-memory token store ──
// Refresh token is persisted to env so it survives server restarts
let tokenStore = {
  accessToken: null,
  accessTokenExpiry: 0,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN || null,
  userEmail: process.env.GOOGLE_USER_EMAIL || null,
};

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function isConnected() {
  return !!(tokenStore.refreshToken);
}

// ── Build OAuth2 authorise URL ──
function buildAuthUrl(redirectUri) {
  const uri = redirectUri || process.env.GOOGLE_REDIRECT_URI;
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  uri,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',   // gets a refresh token
    prompt:        'consent',   // forces refresh token even if previously granted
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── Exchange auth code for tokens ──
async function exchangeCode(code, redirectUri) {
  const uri = redirectUri || process.env.GOOGLE_REDIRECT_URI;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  uri,
      grant_type:    'authorization_code',
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  tokenStore.accessToken       = data.access_token;
  tokenStore.accessTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  if (data.refresh_token) tokenStore.refreshToken = data.refresh_token;

  // Fetch user email
  try {
    const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` }
    });
    const meData = await me.json();
    tokenStore.userEmail = meData.email || null;
  } catch {}

  return {
    accessToken:  tokenStore.accessToken,
    refreshToken: tokenStore.refreshToken,
    email:        tokenStore.userEmail,
  };
}

// ── Refresh access token using stored refresh token ──
async function refreshAccessToken() {
  if (!tokenStore.refreshToken) throw new Error('No refresh token — reconnect Google Calendar');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokenStore.refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  tokenStore.accessToken       = data.access_token;
  tokenStore.accessTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return tokenStore.accessToken;
}

// ── Get a valid access token (auto-refreshes if expired) ──
async function getAccessToken() {
  if (tokenStore.accessToken && Date.now() < tokenStore.accessTokenExpiry) {
    return tokenStore.accessToken;
  }
  return refreshAccessToken();
}

// ── Fetch calendar list ──
async function getCalendars() {
  const token = await getAccessToken();
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.items || [];
}

// ── Fetch events from a calendar ──
async function getEvents({ calendarId = 'primary', days = 60, maxResults = 100 } = {}) {
  const token = await getAccessToken();

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  // Normalise to JAKE calendar format
  return (data.items || []).map(event => ({
    id:        `gcal_${event.id}`,
    title:     event.summary || '(No title)',
    date:      (event.start?.dateTime || event.start?.date || '').slice(0, 10),
    dateTime:  event.start?.dateTime || null,
    endDate:   (event.end?.dateTime || event.end?.date || '').slice(0, 10),
    project:   'Google Calendar',
    type:      'gcal',
    gcalLink:  event.htmlLink || null,
    location:  event.location || null,
    desc:      event.description || null,
    allDay:    !event.start?.dateTime,
    done:      false,
    source:    'google',
    calendarId,
    colorId:   event.colorId || null,
  }));
}

// ── Fetch events from ALL accessible calendars ──
async function getAllEvents({ days = 60 } = {}) {
  const calendars = await getCalendars();
  const results = [];

  for (const cal of calendars) {
    if (cal.selected === false) continue; // Skip hidden calendars
    try {
      const events = await getEvents({ calendarId: cal.id, days });
      results.push(...events.map(e => ({ ...e, calendarName: cal.summary, calendarColor: cal.backgroundColor })));
    } catch (e) {
      console.warn(`[GCal] Could not fetch calendar ${cal.summary}:`, e.message);
    }
  }

  return results;
}

function getStatus() {
  return {
    configured: isConfigured(),
    connected:  isConnected(),
    email:      tokenStore.userEmail,
    hasToken:   !!tokenStore.accessToken,
    tokenValid: Date.now() < tokenStore.accessTokenExpiry,
  };
}

function disconnect() {
  tokenStore = { accessToken: null, accessTokenExpiry: 0, refreshToken: null, userEmail: null };
}

module.exports = {
  isConfigured,
  isConnected,
  buildAuthUrl,
  exchangeCode,
  getAccessToken,
  getCalendars,
  getEvents,
  getAllEvents,
  getStatus,
  disconnect,
  tokenStore,
};
