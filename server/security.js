// ── JAKE Security Middleware ──
// Helmet, CORS, rate limiting, HMAC webhook validation, input sanitisation

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');

// ── Helmet: security headers ──
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],   // Vite dev needs this; tighten in prod
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.anthropic.com', 'https://api.telegram.org', 'https://api.resend.com'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

// ── CORS: restrict to same origin in prod, allow Vite dev port ──
function buildCors() {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://0.0.0.0:5173',
  ];

  // In Replit the webview URL is injected as REPL_SLUG / REPL_OWNER
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    allowedOrigins.push(`https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
    allowedOrigins.push(`https://${process.env.REPL_SLUG}--${process.env.REPL_OWNER}.repl.co`);
  }

  const cors = require('cors');
  return cors({
    origin(origin, cb) {
      // Allow requests with no origin (server-to-server, Postman in dev)
      if (!origin) return cb(null, true);
      if (allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  });
}

// ── Rate limiters ──
const limiter = {
  // Default: 100 req / 15 min per IP
  general: rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }),

  // AI proxy: 30 req / 15 min (Claude API is expensive)
  ai: rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many AI requests — wait a moment' }, standardHeaders: true, legacyHeaders: false }),

  // Alert sending: 10 / hour (prevent abuse / accidental loops)
  alerts: rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'Too many alert requests' }, standardHeaders: true, legacyHeaders: false }),

  // SMS webhook: 200 / 15 min (high volume from phone forwarder is expected)
  sms: rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }),
};

// ── HMAC webhook validation ──
// Sign with: HMAC-SHA256(secret, body)
// The SMS forwarder app sends: header X-Jake-Signature: sha256=<hex>
// Fallback: plain ?secret= query param for simple forwarder apps
function validateWebhook(req, res, next) {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  if (!secret) return next(); // No secret set — skip (dev mode)

  // Check HMAC header first (preferred, more secure)
  const sigHeader = req.headers['x-jake-signature'];
  if (sigHeader) {
    const rawBody = JSON.stringify(req.body);
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    // Constant-time comparison to prevent timing attacks
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected))) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } catch {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    return next();
  }

  // Fallback: plain secret in query string
  const querySig = req.query.secret;
  if (querySig) {
    const expected = Buffer.from(secret);
    const received = Buffer.from(querySig);
    if (received.length !== expected.length) return res.status(401).json({ error: 'Invalid secret' });
    if (!crypto.timingSafeEqual(expected, received)) return res.status(401).json({ error: 'Invalid secret' });
    return next();
  }

  res.status(401).json({ error: 'No webhook signature provided' });
}

// ── API key validation for internal requests ──
function requireInternalKey(req, res, next) {
  const internalKey = process.env.JAKE_INTERNAL_KEY;
  if (!internalKey) return next(); // Dev mode — skip

  const provided = req.headers['x-jake-key'];
  if (!provided) return res.status(401).json({ error: 'Missing API key' });

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(internalKey);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}

// ── Input validators ──
const validators = {
  claude: [
    body('messages').isArray({ min: 1, max: 50 }).withMessage('messages must be array (max 50)'),
    body('messages.*.role').isIn(['user', 'assistant']).withMessage('Invalid role'),
    body('messages.*.content').isString().trim().isLength({ min: 1, max: 8000 }).withMessage('Content too long'),
    body('systemPrompt').optional().isString().trim().isLength({ max: 4000 })
  ],
  sms: [
    body('text').optional().isString().trim().isLength({ max: 2000 }),
    body('Body').optional().isString().trim().isLength({ max: 2000 }),
    body('message').optional().isString().trim().isLength({ max: 2000 }),
    body('from').optional().isString().trim().isLength({ max: 50 }),
    body('From').optional().isString().trim().isLength({ max: 50 }),
  ],
  sync: [
    body('calendar').optional().isArray({ max: 500 }),
    body('finance').optional().isObject()
  ]
};

// ── Validation error handler (call after validator middleware) ──
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array().map(e => e.msg) });
  }
  next();
}

// ── Sanitise error responses: never leak stack traces ──
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: origin not permitted' });
  }
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { helmetConfig, buildCors, limiter, validateWebhook, requireInternalKey, validators, handleValidation, errorHandler };
