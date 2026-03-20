// ── JAKE Integration Definitions ──
// Each integration is a self-contained wizard.
// type: 'info' | 'input' | 'actions' | 'verify' | 'secrets'

export const INTEGRATIONS = [

  // ── ALERTS ──
  {
    id: 'telegram',
    name: 'Telegram Alerts',
    icon: '💬',
    category: 'Alerts',
    description: 'Free instant alerts to your phone. Deadlines, digests, reminders.',
    connected: false,
    wizard: [
      {
        label: 'Create Bot', type: 'actions', title: 'Step 1 — Create your Telegram bot',
        desc: 'Telegram bots are 100% free. This takes 2 minutes.',
        actions: [
          { icon: '🤖', label: 'Open @BotFather on Telegram', sub: 'Send /newbot, choose a name, copy the token', url: 'https://t.me/BotFather' },
          { icon: '🆔', label: 'Get your Chat ID', sub: 'Message @userinfobot — it replies with your ID', url: 'https://t.me/userinfobot' },
        ]
      },
      {
        label: 'Enter Keys', type: 'input', title: 'Paste your Telegram credentials',
        desc: 'These go into Replit Secrets — never exposed in code.',
        required: true,
        fields: [
          { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token (from @BotFather)', placeholder: '1234567890:ABC...', required: true },
          { key: 'TELEGRAM_CHAT_ID',   label: 'Your Chat ID (from @userinfobot)', placeholder: '123456789', required: true },
        ]
      },
      {
        label: 'Save', type: 'secrets', title: 'Add to Replit Secrets',
        desc: 'Copy each value → go to Replit sidebar → Tools → Secrets → add them.',
        secrets: [
          { key: 'TELEGRAM_BOT_TOKEN', stateKey: 'TELEGRAM_BOT_TOKEN' },
          { key: 'TELEGRAM_CHAT_ID',   stateKey: 'TELEGRAM_CHAT_ID' },
        ]
      },
      {
        label: 'Test', type: 'verify', title: 'Test your Telegram connection',
        desc: 'Sends a test message to your bot.',
        verifyLabel: '📨 Send test message',
      }
    ],
    verify: async (state) => {
      const res = await fetch('/api/alerts/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'telegram' }) });
      const d = await res.json();
      return d.ok ? true : (d.error || 'Failed');
    }
  },

  {
    id: 'resend',
    name: 'Email Alerts (Resend)',
    icon: '✉️',
    category: 'Alerts',
    description: 'Free email. 3,000/month. Beautiful HTML digest every morning.',
    connected: false,
    wizard: [
      {
        label: 'Sign Up', type: 'actions', title: 'Get your free Resend API key',
        desc: 'Resend is free, no credit card needed.',
        actions: [
          { icon: '✉️', label: 'Sign up at resend.com', sub: 'Free — 3,000 emails/month forever', url: 'https://resend.com' },
        ]
      },
      {
        label: 'Enter Keys', type: 'input', title: 'Paste Resend credentials',
        desc: 'The API key is under Resend → API Keys. For From Email, use their free shared domain for testing.',
        required: true,
        fields: [
          { key: 'RESEND_API_KEY',    label: 'Resend API Key', placeholder: 're_...', required: true, secret: true },
          { key: 'ALERT_FROM_EMAIL',  label: 'From Email', placeholder: 'JAKE <you@yourdomain.com>', required: true },
          { key: 'ALERT_TO_EMAIL',    label: 'To Email (where you receive alerts)', placeholder: 'you@gmail.com', required: true },
        ]
      },
      {
        label: 'Save', type: 'secrets', title: 'Add to Replit Secrets',
        desc: 'Paste each into Replit → Tools → Secrets.',
        secrets: [
          { key: 'RESEND_API_KEY',   stateKey: 'RESEND_API_KEY' },
          { key: 'ALERT_FROM_EMAIL', stateKey: 'ALERT_FROM_EMAIL' },
          { key: 'ALERT_TO_EMAIL',   stateKey: 'ALERT_TO_EMAIL' },
        ]
      },
      {
        label: 'Test', type: 'verify', title: 'Send a test email',
        desc: 'Sends a test email to confirm everything works.',
        verifyLabel: '📧 Send test email',
      }
    ],
    verify: async () => {
      const res = await fetch('/api/alerts/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'email' }) });
      const d = await res.json();
      return d.ok ? true : (d.error || 'Failed');
    }
  },

  // ── SMS / FINANCE ──
  {
    id: 'sms-pwa',
    name: 'SMS Tracking (Built-in)',
    icon: '📲',
    category: 'Finance',
    description: 'Share M-Pesa, Airtel, bank SMS directly to JAKE. No app needed.',
    connected: false,
    wizard: [
      {
        label: 'Install', type: 'info', icon: '📱',
        title: 'Install JAKE as an app first',
        body: 'JAKE uses Android\'s built-in Share Sheet. Once installed as a PWA, any SMS can be shared directly to JAKE.<br><br><strong>You should see an "Install JAKE" banner at the bottom.</strong> If not, in Chrome: tap ⋮ menu → "Add to Home Screen".',
      },
      {
        label: 'Share SMS', type: 'actions', title: 'How to share an SMS to JAKE',
        desc: 'Once JAKE is installed as an app on your phone:',
        actions: [
          { icon: '📩', label: 'Open any SMS (M-Pesa, Airtel, Bank)', sub: 'From your messaging app' },
          { icon: '⟨', label: 'Tap the Share button', sub: 'Usually at top or bottom of SMS' },
          { icon: '🟡', label: 'Select "JAKE" in the share sheet', sub: 'JAKE appears automatically after install' },
        ]
      },
      {
        label: 'Done', type: 'info', icon: '✅',
        title: 'SMS tracking is ready',
        body: 'Every SMS you share to JAKE is automatically parsed for:<br><br>• <strong>M-Pesa</strong> transactions (sent/received)<br>• <strong>Airtel Money</strong> transactions<br>• <strong>Bank SMS</strong> (Stanbic, DFCU, Centenary)<br>• Auto-categorised into Food, Transport, Income, etc.<br><br>Go to <strong>Personal Finance → Transactions</strong> to see them.',
      }
    ]
  },

  // ── DEV TOOLS ──
  {
    id: 'supabase',
    name: 'Supabase',
    icon: '🗄️',
    category: 'Dev Tools',
    description: 'Connect Radar or Synced Supabase project to view DB stats.',
    connected: false,
    wizard: [
      {
        label: 'Open', type: 'actions', title: 'Open your Supabase project',
        desc: 'Dashboard, tables, and API stats are all here.',
        actions: [
          { icon: '🗄️', label: 'Open Supabase Dashboard', url: 'https://supabase.com/dashboard' },
        ]
      },
      {
        label: 'Keys', type: 'input', title: 'Add Supabase project URL',
        desc: 'Found in Supabase → Project Settings → API. Used to fetch stats.',
        fields: [
          { key: 'supabase_url', label: 'Project URL', placeholder: 'https://xxxx.supabase.co' },
          { key: 'supabase_anon', label: 'Anon Key', placeholder: 'eyJ...', secret: true },
        ]
      },
      {
        label: 'Done', type: 'info', icon: '✅',
        title: 'Supabase linked',
        body: 'Your Supabase URL is saved. Use the <strong>Integrations → Tools</strong> tab to open the dashboard with one click anytime.',
      }
    ]
  },

  {
    id: 'stripe',
    name: 'Stripe (Radar Revenue)',
    icon: '💳',
    category: 'Finance',
    description: 'Connect Radar subscription revenue. View MRR in Finance module.',
    connected: false,
    wizard: [
      {
        label: 'Open', type: 'actions', title: 'Open Stripe Dashboard',
        desc: 'Get your restricted API key for read-only revenue stats.',
        actions: [
          { icon: '💳', label: 'Open Stripe Dashboard', url: 'https://dashboard.stripe.com' },
          { icon: '🔑', label: 'Create Restricted Key', sub: 'Developers → API Keys → Restricted key → Read-only', url: 'https://dashboard.stripe.com/apikeys' },
        ]
      },
      {
        label: 'Key', type: 'input', title: 'Paste your Stripe restricted key',
        desc: 'Read-only restricted key. Never use your live secret key.',
        fields: [
          { key: 'STRIPE_RESTRICTED_KEY', label: 'Restricted API Key', placeholder: 'rk_live_...', secret: true },
        ]
      },
      {
        label: 'Save', type: 'secrets', title: 'Add to Replit Secrets',
        desc: 'Add STRIPE_RESTRICTED_KEY to Replit Secrets.',
        secrets: [{ key: 'STRIPE_RESTRICTED_KEY', stateKey: 'STRIPE_RESTRICTED_KEY' }]
      }
    ]
  },

  // ── PROGRAMS ──
  {
    id: 'lead4africa',
    name: 'Lead4Africa Portal',
    icon: '🌱',
    category: 'Programs',
    description: '4Africa Incubator program portal. Quick access link.',
    connected: false,
    wizard: [
      {
        label: 'URL', type: 'input', title: 'Add Lead4Africa portal URL',
        desc: 'Paste the URL to your program portal or reporting dashboard.',
        fields: [
          { key: 'lead4africa_url', label: 'Portal URL', placeholder: 'https://...' },
        ]
      },
      {
        label: 'Done', type: 'info', icon: '✅',
        title: 'Lead4Africa linked',
        body: 'Portal saved. Opens with one tap from Integrations → Tools.',
      }
    ]
  },

  {
    id: 'palladium',
    name: 'Palladium Partner',
    icon: '🏢',
    category: 'Programs',
    description: 'Partner portal quick access.',
    connected: false,
    wizard: [
      {
        label: 'URL', type: 'input', title: 'Add Palladium portal URL',
        fields: [{ key: 'palladium_url', label: 'Portal URL', placeholder: 'https://...' }]
      },
      {
        label: 'Done', type: 'info', icon: '✅', title: 'Palladium linked',
        body: 'Partner portal saved to Integrations.',
      }
    ]
  },

  // ── PRODUCTIVITY ──
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    icon: '📅',
    category: 'Productivity',
    description: 'View upcoming events alongside JAKE calendar.',
    connected: false,
    wizard: [
      {
        label: 'Get URL', type: 'actions', title: 'Get your Google Calendar embed link',
        desc: 'No API key needed — uses Google\'s public calendar embed.',
        actions: [
          { icon: '📅', label: 'Open Google Calendar', url: 'https://calendar.google.com' },
          { icon: '⚙', label: 'Settings → Your calendar → Integrate → Copy Embed URL', sub: 'Look for the Public URL or Embed URL' },
        ]
      },
      {
        label: 'URL', type: 'input', title: 'Paste embed URL',
        fields: [{ key: 'gcal_url', label: 'Calendar Embed URL', placeholder: 'https://calendar.google.com/calendar/embed?...' }]
      },
      {
        label: 'Done', type: 'info', icon: '✅', title: 'Google Calendar linked',
        body: 'Calendar appears in Integrations → Tools as a quick-open link.',
      }
    ]
  },

  {
    id: 'notion',
    name: 'Notion Workspace',
    icon: '📝',
    category: 'Productivity',
    description: 'Quick access to your Notion docs and databases.',
    connected: false,
    wizard: [
      {
        label: 'URL', type: 'input', title: 'Add your Notion workspace URL',
        fields: [{ key: 'notion_url', label: 'Notion URL', placeholder: 'https://notion.so/...' }]
      },
      {
        label: 'Done', type: 'info', icon: '✅', title: 'Notion linked',
        body: 'Opens from Integrations with one tap.',
      }
    ]
  },

  {
    id: 'replit',
    name: 'Replit Workspace',
    icon: '💻',
    category: 'Dev Tools',
    description: 'One-tap access to your Replit projects.',
    connected: false,
    wizard: [
      {
        label: 'URLs', type: 'input', title: 'Add your Replit project links',
        desc: 'Add the Replit URLs for Radar, Synced, Ajura, and JAKE itself.',
        fields: [
          { key: 'replit_radar', label: 'Radar project URL', placeholder: 'https://replit.com/@username/radar' },
          { key: 'replit_synced', label: 'Synced project URL', placeholder: 'https://replit.com/@username/synced' },
          { key: 'replit_ajura', label: 'Ajura Clothes URL', placeholder: 'https://replit.com/@username/ajura' },
        ]
      },
      {
        label: 'Done', type: 'info', icon: '✅', title: 'Replit linked',
        body: 'All three projects accessible from Integrations.',
      }
    ]
  },

  {
    id: 'anthropic',
    name: 'Anthropic Console',
    icon: '🤖',
    category: 'Dev Tools',
    description: 'Monitor API usage and billing.',
    connected: false,
    wizard: [
      {
        label: 'Open', type: 'info', icon: '🤖', title: 'Anthropic Console',
        body: 'Monitor your Claude API usage, set spend limits, and manage API keys at <strong>console.anthropic.com</strong>.',
        url: 'https://console.anthropic.com', linkLabel: 'Open Anthropic Console'
      }
    ]
  }
];

export const CATEGORIES = ['All', 'Alerts', 'Finance', 'Dev Tools', 'Programs', 'Productivity'];
