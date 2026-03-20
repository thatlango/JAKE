// JAKE — Pre-seeded with real Tuku-Tuku Labs data
// Edit this file freely to update defaults. Live changes are saved to localStorage.

export const SEED_DATA = {
  projects: [
    {
      id: 'radar',
      name: 'Radar',
      emoji: '📡',
      description: 'AI-powered opportunity aggregation platform for African job seekers. GPT-4 matching engine, Stripe subscriptions, dark-theme UI.',
      tech: 'Next.js · Prisma · Supabase · GPT-4 · Stripe',
      status: 'In Development',
      priority: 'High',
      color: '#F0B429',
      progress: 45,
      tasks: [
        { id: 1, text: 'GPT-4 matching engine', done: true },
        { id: 2, text: 'Supabase schema finalization', done: true },
        { id: 3, text: 'Dark-theme UI polish', done: true },
        { id: 4, text: 'Stripe subscription integration', done: false },
        { id: 5, text: 'Opportunity scraper pipeline', done: false },
        { id: 6, text: 'Beta user onboarding flow', done: false },
        { id: 7, text: 'Email notification system', done: false },
      ]
    },
    {
      id: 'synced',
      name: 'Synced',
      emoji: '💚',
      description: 'Couples financial management app for East Africa. Shared budgeting, savings goals, mobile money integration.',
      tech: 'React Native · Supabase · M-Pesa API',
      status: 'Planning',
      priority: 'Medium',
      color: '#10B981',
      progress: 18,
      tasks: [
        { id: 1, text: 'Product spec document', done: true },
        { id: 2, text: 'M-Pesa API research', done: true },
        { id: 3, text: 'User research — East Africa couples', done: false },
        { id: 4, text: 'UI/UX wireframes', done: false },
        { id: 5, text: 'Supabase backend setup', done: false },
        { id: 6, text: 'MVP feature scoping', done: false },
      ]
    },
    {
      id: 'ajura',
      name: 'Ajura Clothes',
      emoji: '👗',
      description: 'Faith-driven African fashion brand. AjuraFit product line. Website build in Replit. Security audit framework in place.',
      tech: 'Figma · Replit · React · CSS',
      status: 'In Development',
      priority: 'High',
      color: '#9F7AEA',
      progress: 35,
      tasks: [
        { id: 1, text: 'Figma layout finalization', done: true },
        { id: 2, text: 'Replit build spec', done: true },
        { id: 3, text: 'Security audit framework', done: true },
        { id: 4, text: 'Product catalog page', done: false },
        { id: 5, text: 'AjuraFit landing section', done: false },
        { id: 6, text: 'Checkout / payments integration', done: false },
        { id: 7, text: 'Mobile responsiveness', done: false },
      ]
    },
    {
      id: '4africa',
      name: '4Africa Incubator',
      emoji: '🌱',
      description: '12-week evidence-based agricultural incubation program for Lead4Africa. Running March–June 2026. Formal proposal, calendar, and Excel workbook deliverables.',
      tech: 'Program Design · Facilitation · M&E',
      status: 'Active',
      priority: 'Critical',
      color: '#EF4444',
      progress: 60,
      tasks: [
        { id: 1, text: 'Formal proposal document', done: true },
        { id: 2, text: 'Program calendar (12-week)', done: true },
        { id: 3, text: 'Cohort recruitment', done: true },
        { id: 4, text: 'Excel workbook deliverable', done: false },
        { id: 5, text: 'Week 1-4 facilitation guides', done: false },
        { id: 6, text: 'M&E framework', done: false },
        { id: 7, text: 'Mid-program review report', done: false },
        { id: 8, text: 'Demo Day preparation', done: false },
      ]
    },
    {
      id: 'tuku',
      name: 'Tuku-Tuku MSME',
      emoji: '🏢',
      description: 'MSME capacity building programmes. Social Media, Digital Literacy, TOT workshops across Gulu and Lira districts. Partners: Palladium, GOPA AFC.',
      tech: 'Training Design · PowerPoint · Facilitation',
      status: 'Active',
      priority: 'High',
      color: '#06B6D4',
      progress: 72,
      tasks: [
        { id: 1, text: 'Social Media workshop deck (Gulu)', done: true },
        { id: 2, text: 'Digital Literacy training (FET/AO)', done: true },
        { id: 3, text: 'TOT Modules 1–10 facilitator manuals', done: true },
        { id: 4, text: 'Participant handouts (Modules 5–10)', done: true },
        { id: 5, text: 'FEMINATURE FMS Framework', done: false },
        { id: 6, text: 'Q2 2026 workshop schedule (Lira)', done: false },
        { id: 7, text: 'Impact report — MSME cohort 2025', done: false },
      ]
    }
  ],

  pipeline: [
    {
      id: 'p1',
      name: '4Africa Innovation Incubator',
      org: 'Lead4Africa',
      value: '~$12,000',
      valueUSD: 12000,
      stage: 'In Delivery',
      type: 'Program',
      deadline: '2026-06-30',
      contact: 'Lead4Africa Programme Team',
      notes: '12-week agricultural incubation program. Proposal accepted. Deliverables ongoing through June 2026.'
    },
    {
      id: 'p2',
      name: 'Gender-Smart Business Tools',
      org: '2X Global',
      value: '$24,000',
      valueUSD: 24000,
      stage: 'Applied',
      type: 'Consulting',
      deadline: '2026-07-31',
      contact: '2X Global Partnerships',
      notes: 'Developing gender-smart tools for MSME sector. Application submitted. Budget ~$24,000. Final deliverables July 2026.'
    },
    {
      id: 'p3',
      name: 'FEMINATURE FMS Framework',
      org: 'FEMINATURE',
      value: '~$3,500',
      valueUSD: 3500,
      stage: 'In Delivery',
      type: 'Systems',
      deadline: '2026-04-30',
      contact: 'FEMINATURE Coordinator',
      notes: 'Financial Management System UI + RBAC frontend demo. In delivery. Due end of April.'
    },
    {
      id: 'p4',
      name: 'Palladium Partnership',
      org: 'Palladium',
      value: 'Ongoing',
      valueUSD: 0,
      stage: 'Active Partner',
      type: 'Partnership',
      deadline: null,
      contact: 'Palladium Uganda Office',
      notes: 'Active implementing partner. Multiple programme engagements across Northern Uganda.'
    },
    {
      id: 'p5',
      name: 'GOPA AFC Partnership',
      org: 'GOPA AFC',
      value: 'Ongoing',
      valueUSD: 0,
      stage: 'Active Partner',
      type: 'Partnership',
      deadline: null,
      contact: 'GOPA AFC Uganda',
      notes: 'Agricultural and rural capacity building partner. Joint delivery on MSME programs.'
    },
    {
      id: 'p6',
      name: 'Muni University MOU',
      org: 'Muni University',
      value: 'TBD',
      valueUSD: 0,
      stage: 'Prospect',
      type: 'Academic',
      deadline: null,
      contact: 'Muni University Research Office',
      notes: 'Academic partnership for MSME research, mentorship, and programme delivery. MOU in discussion.'
    },
    {
      id: 'p7',
      name: 'Gulu University Partnership',
      org: 'Gulu University',
      value: 'TBD',
      valueUSD: 0,
      stage: 'Prospect',
      type: 'Academic',
      deadline: null,
      contact: 'Gulu University Business School',
      notes: 'Potential co-delivery of MSME training and research collaboration.'
    }
  ],

  calendar: [
    // 4Africa Incubator
    { id: 'c1',  title: 'Program Launch — Cohort Orientation', date: '2026-03-23', project: '4Africa Incubator', type: 'milestone', done: false },
    { id: 'c2',  title: 'Week 1–2: Business Model Validation', date: '2026-03-30', project: '4Africa Incubator', type: 'session', done: false },
    { id: 'c3',  title: 'Week 3–4: Agri Market Systems Analysis', date: '2026-04-06', project: '4Africa Incubator', type: 'session', done: false },
    { id: 'c4',  title: 'Week 5–6: Financial Modelling', date: '2026-04-20', project: '4Africa Incubator', type: 'session', done: false },
    { id: 'c5',  title: 'Week 7–8: Growth & Scale Strategy', date: '2026-05-04', project: '4Africa Incubator', type: 'session', done: false },
    { id: 'c6',  title: 'Mid-Program Review & M&E', date: '2026-05-04', project: '4Africa Incubator', type: 'milestone', done: false },
    { id: 'c7',  title: 'Excel Workbook Deliverable Due', date: '2026-05-25', project: '4Africa Incubator', type: 'deadline', done: false },
    { id: 'c8',  title: 'Week 9–10: Investor Readiness', date: '2026-05-18', project: '4Africa Incubator', type: 'session', done: false },
    { id: 'c9',  title: 'Week 11–12: Demo Day Preparation', date: '2026-06-01', project: '4Africa Incubator', type: 'session', done: false },
    { id: 'c10', title: 'Program Demo Day & Graduation', date: '2026-06-22', project: '4Africa Incubator', type: 'milestone', done: false },
    // Tuku-Tuku
    { id: 'c11', title: 'Digital Literacy Workshop — Gulu', date: '2026-04-08', project: 'Tuku-Tuku MSME', type: 'session', done: false },
    { id: 'c12', title: 'TOT Module 5–6 Delivery — Lira', date: '2026-04-15', project: 'Tuku-Tuku MSME', type: 'session', done: false },
    { id: 'c13', title: 'FEMINATURE FMS Handover', date: '2026-04-30', project: 'Tuku-Tuku MSME', type: 'deadline', done: false },
    // BD
    { id: 'c14', title: '2X Global Application Follow-Up', date: '2026-04-01', project: 'Business Dev', type: 'deadline', done: false },
    { id: 'c15', title: '2X Global Final Deliverables', date: '2026-07-31', project: 'Business Dev', type: 'deadline', done: false },
    { id: 'c16', title: 'Muni University MOU Discussion', date: '2026-04-20', project: 'Business Dev', type: 'milestone', done: false },
  ],

  finance: {
    targets: {
      quarterly: 20000,
      annual: 75000,
      currency: 'USD'
    },
    streams: [
      { id: 'f1', name: '4Africa Innovation Incubator',   type: 'Consulting', status: 'Confirmed',  amount: 12000, currency: 'USD', month: 'Mar–Jun 2026' },
      { id: 'f2', name: 'FEMINATURE FMS Framework',       type: 'Systems',    status: 'Confirmed',  amount: 3500,  currency: 'USD', month: 'Mar–Apr 2026' },
      { id: 'f3', name: 'MSME Workshop — Gulu',           type: 'Training',   status: 'Confirmed',  amount: 1800,  currency: 'USD', month: 'Apr 2026' },
      { id: 'f4', name: '2X Global Gender-Smart Tools',   type: 'Consulting', status: 'Pending',    amount: 24000, currency: 'USD', month: 'Jun–Jul 2026' },
      { id: 'f5', name: 'MSME Workshop — Lira',           type: 'Training',   status: 'Projected',  amount: 1800,  currency: 'USD', month: 'May 2026' },
      { id: 'f6', name: 'Radar Platform (subscriptions)', type: 'Product',    status: 'Projected',  amount: 800,   currency: 'USD', month: 'Q3 2026' },
    ],
    expenses: [
      { id: 'e1', name: 'Gulu Office / Co-working',       amount: 200,  currency: 'USD', monthly: true },
      { id: 'e2', name: 'Travel Gulu–Lira',               amount: 150,  currency: 'USD', monthly: true },
      { id: 'e3', name: 'Software, Tools & Subscriptions', amount: 90,  currency: 'USD', monthly: true },
      { id: 'e4', name: 'Workshop Materials & Printing',   amount: 300,  currency: 'USD', monthly: false },
      { id: 'e5', name: 'Airtime & Data',                  amount: 40,  currency: 'USD', monthly: true },
    ]
  }
};
