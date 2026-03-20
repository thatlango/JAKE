// ── SMS Finance Parser ──
// Receives forwarded SMS via webhook (from Android SMS Forwarder app or Africa's Talking)
// Parses M-Pesa, Airtel Money, bank SMS into structured transactions
// Webhook URL: POST /api/sms/receive
// Also supports Africa's Talking inbound SMS callback

// ── Uganda mobile money SMS patterns ──
const PARSERS = [
  // M-Pesa Uganda: "UG-MPESA Confirmed. Ksh 50,000 sent to JOHN DOE..."
  // OR "You have received UGX 120,000 from +256700000000"
  {
    name: 'M-Pesa Uganda',
    type: 'mobile_money',
    provider: 'M-Pesa',
    patterns: [
      // Received
      {
        regex: /received\s+UGX\s*([\d,]+)\s+from\s+(.+?)\s+on\s+(.+?)\./i,
        extract: (m) => ({ flow: 'in', amount: parseAmount(m[1]), party: m[2].trim(), date: m[3], raw: m[0] })
      },
      // Sent
      {
        regex: /UGX\s*([\d,]+)\s+sent\s+to\s+(.+?)\./i,
        extract: (m) => ({ flow: 'out', amount: parseAmount(m[1]), party: m[2].trim(), raw: m[0] })
      },
      // Confirmed
      {
        regex: /Confirmed\.\s+UGX\s*([\d,]+)\s+(?:sent to|paid to)\s+(.+?)\./i,
        extract: (m) => ({ flow: 'out', amount: parseAmount(m[1]), party: m[2].trim(), raw: m[0] })
      },
      // Balance
      {
        regex: /balance\s+is\s+UGX\s*([\d,]+)/i,
        extract: (m) => ({ type: 'balance', balance: parseAmount(m[1]), raw: m[0] })
      }
    ]
  },

  // Airtel Money Uganda
  {
    name: 'Airtel Money',
    type: 'mobile_money',
    provider: 'Airtel',
    patterns: [
      {
        regex: /(?:received|you have received)\s+UGX\s*([\d,]+)\s+from\s+(.+)/i,
        extract: (m) => ({ flow: 'in', amount: parseAmount(m[1]), party: m[2].split('.')[0].trim(), raw: m[0] })
      },
      {
        regex: /UGX\s*([\d,]+)\s+has been\s+(?:sent|transferred)\s+to\s+(.+)/i,
        extract: (m) => ({ flow: 'out', amount: parseAmount(m[1]), party: m[2].split('.')[0].trim(), raw: m[0] })
      },
      {
        regex: /Your Airtel Money balance is UGX\s*([\d,]+)/i,
        extract: (m) => ({ type: 'balance', balance: parseAmount(m[1]), raw: m[0] })
      }
    ]
  },

  // Stanbic / DFCU / Centenary Bank Uganda
  {
    name: 'Bank Alert',
    type: 'bank',
    provider: 'Bank',
    patterns: [
      {
        regex: /(?:credit|credited)\s+UGX\s*([\d,]+\.?\d*)\s+(?:on|to)\s+(?:your\s+)?(?:account\s+)?(?:\*{3,}\d+)?\s*(?:from\s+(.+?))?(?:\.|$)/i,
        extract: (m) => ({ flow: 'in', amount: parseAmount(m[1]), party: m[2]?.trim() || 'Bank Credit', raw: m[0] })
      },
      {
        regex: /(?:debit|debited)\s+UGX\s*([\d,]+\.?\d*)/i,
        extract: (m) => ({ flow: 'out', amount: parseAmount(m[1]), party: 'Bank Debit', raw: m[0] })
      },
      {
        regex: /(?:balance|bal)\s*(?:is|:)?\s*UGX\s*([\d,]+)/i,
        extract: (m) => ({ type: 'balance', balance: parseAmount(m[1]), raw: m[0] })
      }
    ]
  },

  // Generic UGX transaction
  {
    name: 'Generic',
    type: 'generic',
    provider: 'SMS',
    patterns: [
      {
        regex: /(?:UGX|USH|Shs)\s*([\d,]+)/i,
        extract: (m) => ({ flow: 'unknown', amount: parseAmount(m[1]), party: 'Unknown', raw: m[0] })
      }
    ]
  }
];

function parseAmount(str) {
  return parseFloat(str.replace(/,/g, '')) || 0;
}

function detectProvider(from, body) {
  const f = (from || '').toLowerCase();
  const b = (body || '').toLowerCase();
  if (f.includes('mpesa') || b.includes('m-pesa') || b.includes('mpesa')) return 'M-Pesa';
  if (f.includes('airtel') || b.includes('airtel money'))                  return 'Airtel';
  if (f.includes('stanbic') || b.includes('stanbic'))                      return 'Stanbic';
  if (f.includes('dfcu') || b.includes('dfcu'))                            return 'DFCU';
  if (f.includes('centenary') || b.includes('centenary'))                  return 'Centenary';
  return 'Unknown';
}

function categorize(party = '', body = '') {
  const text = (party + ' ' + body).toLowerCase();
  if (/salary|payroll|payment|contract|consultancy|consulting/i.test(text)) return 'Income';
  if (/rent|property|housing/i.test(text))   return 'Housing';
  if (/food|supermarket|restaurant|cafe|market|groceries|maize|posho/i.test(text)) return 'Food';
  if (/fuel|petrol|diesel|transport|boda|taxi|bus/i.test(text)) return 'Transport';
  if (/school|fees|university|tuition/i.test(text)) return 'Education';
  if (/airtel|mtn|uganda telecom|phone|data|airtime/i.test(text)) return 'Utilities';
  if (/hospital|clinic|pharmacy|doctor|health/i.test(text)) return 'Health';
  if (/hotel|lodge|accommodation/i.test(text)) return 'Accommodation';
  if (/withdraw|atm|cash/i.test(text)) return 'Cash Withdrawal';
  return 'Other';
}

function parseSMS(smsBody, sender = '', receivedAt = null) {
  const body = smsBody || '';
  const timestamp = receivedAt || new Date().toISOString();
  const provider = detectProvider(sender, body);

  for (const parser of PARSERS) {
    for (const pattern of parser.patterns) {
      const match = body.match(pattern.regex);
      if (match) {
        const extracted = pattern.extract(match);
        if (extracted.type === 'balance') {
          return {
            id: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'balance',
            provider: parser.provider !== 'SMS' ? parser.provider : provider,
            balance: extracted.balance,
            timestamp,
            raw: body,
            sender
          };
        }
        const category = categorize(extracted.party || '', body);
        return {
          id: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'transaction',
          flow: extracted.flow,
          amount: extracted.amount,
          party: extracted.party || 'Unknown',
          provider: parser.provider !== 'SMS' ? parser.provider : provider,
          category,
          timestamp,
          raw: body,
          sender,
          note: ''
        };
      }
    }
  }

  // Not parseable as transaction
  return null;
}

module.exports = { parseSMS };
