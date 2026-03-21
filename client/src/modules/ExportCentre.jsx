import { useState } from 'react';

function toCSV(rows, cols) {
  const header = cols.map(c => `"${c.label}"`).join(',');
  const body   = rows.map(r => cols.map(c => {
    const v = typeof c.get === 'function' ? c.get(r) : (r[c.key] ?? '');
    return `"${String(v).replace(/"/g,'""')}"`;
  }).join(','));
  return [header, ...body].join('\n');
}

function download(filename, content, type = 'text/csv;charset=utf-8;') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCSV(filename, rows, cols) {
  const BOM = '\uFEFF';
  download(filename, BOM + toCSV(rows, cols));
}

function printReport(title, html) {
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}
    h1{font-size:24px;border-bottom:2px solid #000;padding-bottom:8px}
    h2{font-size:16px;margin-top:24px;color:#444}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
    th{text-align:left;border-bottom:2px solid #000;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    td{padding:7px 8px;border-bottom:1px solid #ddd}
    tr:last-child td{border-bottom:none}
    .meta{color:#666;font-size:12px;margin-bottom:24px}
    @media print{body{margin:20px}}
  </style></head><body>${html}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

export default function ExportCentre({ projects, pipeline, calendar, finance }) {
  const [busy, setBusy] = useState('');

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch(e) { alert('Export failed: ' + e.message); }
    finally { setBusy(''); }
  };

  const exports = [
    {
      id: 'pipeline',
      icon: '⟳',
      title: 'Business Pipeline',
      desc: 'All deals — name, org, stage, value, deadline, contact, notes',
      action: () => downloadCSV('jake_pipeline.csv', pipeline || [], [
        { label:'Name',     key:'name' },
        { label:'Org',      key:'org' },
        { label:'Stage',    key:'stage' },
        { label:'Type',     key:'type' },
        { label:'Value USD',key:'valueUSD' },
        { label:'Deadline', key:'deadline' },
        { label:'Contact',  key:'contact' },
        { label:'Notes',    key:'notes' },
      ]),
    },
    {
      id: 'projects',
      icon: '◈',
      title: 'Projects & Tasks',
      desc: 'All projects with task breakdown, progress, and status',
      action: () => {
        const rows = (projects||[]).flatMap(p =>
          (p.tasks||[]).length
            ? (p.tasks||[]).map(t => ({ project:p.name, emoji:p.emoji, status:p.status, progress:p.progress, task:t.text, done:t.done?'Yes':'No' }))
            : [{ project:p.name, emoji:p.emoji, status:p.status, progress:p.progress, task:'', done:'' }]
        );
        downloadCSV('jake_projects.csv', rows, [
          { label:'Project', key:'project' },
          { label:'Status',  key:'status' },
          { label:'Progress',key:'progress' },
          { label:'Task',    key:'task' },
          { label:'Done',    key:'done' },
        ]);
      },
    },
    {
      id: 'calendar',
      icon: '▦',
      title: 'Calendar Events',
      desc: 'All scheduled events, milestones, and deadlines',
      action: () => downloadCSV('jake_calendar.csv', calendar || [], [
        { label:'Title',   key:'title' },
        { label:'Date',    key:'date' },
        { label:'Type',    key:'type' },
        { label:'Project', key:'project' },
        { label:'Done',    get:r => r.done ? 'Yes':'No' },
        { label:'Notes',   key:'notes' },
      ]),
    },
    {
      id: 'finance',
      icon: '◆',
      title: 'Revenue Streams',
      desc: 'Confirmed, pending, and projected revenue with periods',
      action: () => {
        const streams = finance?.streams || [];
        downloadCSV('jake_finance.csv', streams, [
          { label:'Source', key:'name' },
          { label:'Type',   key:'type' },
          { label:'Status', key:'status' },
          { label:'Amount USD', key:'amount' },
          { label:'Period', key:'month' },
        ]);
      },
    },
    {
      id: 'quarterly-report',
      icon: '📊',
      title: 'Quarterly Business Report',
      desc: 'Printable HTML report — revenue, pipeline, projects, next steps',
      color: 'var(--accent)',
      action: () => {
        const streams   = finance?.streams || [];
        const confirmed = streams.filter(s=>s.status==='Confirmed').reduce((a,s)=>a+s.amount,0);
        const pending   = streams.filter(s=>s.status==='Pending').reduce((a,s)=>a+s.amount,0);
        const target    = finance?.targets?.quarterly || 20000;
        const hotDeals  = (pipeline||[]).filter(p=>['Applied','In Delivery'].includes(p.stage));
        const activeP   = (projects||[]).filter(p=>['Active','In Development'].includes(p.status));
        const upcoming  = [...(calendar||[])].filter(e=>!e.done&&new Date(e.date)>=new Date()).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,8);

        const html = `
          <h1>Tuku-Tuku Labs — Quarterly Business Report</h1>
          <div class="meta">Generated ${new Date().toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} · JAKE Operating System</div>

          <h2>Revenue Summary</h2>
          <table><thead><tr><th>Source</th><th>Status</th><th>Amount</th><th>Period</th></tr></thead><tbody>
          ${streams.map(s=>`<tr><td>${s.name}</td><td>${s.status}</td><td>$${s.amount.toLocaleString()}</td><td>${s.month||''}</td></tr>`).join('')}
          <tr><td colspan="2"><strong>Total Confirmed</strong></td><td><strong>$${confirmed.toLocaleString()}</strong></td><td></td></tr>
          </tbody></table>
          <p>Quarterly target: $${target.toLocaleString()} · ${Math.round((confirmed/target)*100)}% achieved · $${Math.max(0,target-confirmed).toLocaleString()} gap</p>

          <h2>Active Pipeline (${hotDeals.length} hot deals)</h2>
          <table><thead><tr><th>Deal</th><th>Org</th><th>Stage</th><th>Value</th></tr></thead><tbody>
          ${hotDeals.map(d=>`<tr><td>${d.name}</td><td>${d.org}</td><td>${d.stage}</td><td>${d.valueUSD>0?'$'+d.valueUSD.toLocaleString():'TBD'}</td></tr>`).join('')}
          </tbody></table>

          <h2>Active Projects (${activeP.length})</h2>
          <table><thead><tr><th>Project</th><th>Status</th><th>Progress</th><th>Tasks Done</th></tr></thead><tbody>
          ${activeP.map(p=>{
            const done=(p.tasks||[]).filter(t=>t.done).length;
            const total=(p.tasks||[]).length;
            return `<tr><td>${p.emoji} ${p.name}</td><td>${p.status}</td><td>${p.progress}%</td><td>${done}/${total}</td></tr>`;
          }).join('')}
          </tbody></table>

          <h2>Upcoming Events (next 30 days)</h2>
          <table><thead><tr><th>Date</th><th>Event</th><th>Project</th></tr></thead><tbody>
          ${upcoming.map(e=>`<tr><td>${new Date(e.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</td><td>${e.title}</td><td>${e.project||''}</td></tr>`).join('')}
          </tbody></table>
        `;
        printReport('Tuku-Tuku Labs — Quarterly Report', html);
      },
    },
    {
      id: 'crm',
      icon: '🤝',
      title: 'CRM Contacts',
      desc: 'Fetch and export all CRM contacts (from server)',
      action: async () => {
        const res  = await fetch('/api/crm/clients');
        const data = await res.json();
        downloadCSV('jake_crm.csv', data.clients||[], [
          { label:'Name',         key:'name' },
          { label:'Org',          key:'org' },
          { label:'Role',         key:'role' },
          { label:'Type',         key:'type' },
          { label:'Status',       key:'status' },
          { label:'Email',        key:'email' },
          { label:'Phone',        key:'phone' },
          { label:'Location',     key:'location' },
          { label:'Last Contact', key:'last_contact' },
          { label:'Next Followup',key:'next_followup' },
        ]);
      },
    },
    {
      id: 'invoices',
      icon: '🧾',
      title: 'Invoices',
      desc: 'All invoices with status, client, amounts (from server)',
      action: async () => {
        const res  = await fetch('/api/invoices');
        const data = await res.json();
        downloadCSV('jake_invoices.csv', data.invoices||[], [
          { label:'Invoice #',  key:'invoice_number' },
          { label:'Client',     key:'client_name' },
          { label:'Status',     key:'status' },
          { label:'Subtotal',   key:'subtotal' },
          { label:'Tax',        key:'tax' },
          { label:'Total',      key:'total' },
          { label:'Currency',   key:'currency' },
          { label:'Due Date',   key:'due_date' },
          { label:'Created',    key:'created_at' },
        ]);
      },
    },
  ];

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Export Centre</h1>
          <p className="module-sub">Download your data · CSV for spreadsheets · Print-to-PDF reports</p>
        </div>
      </div>

      <div className="module-body">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:12 }}>
          {exports.map(exp => (
            <div key={exp.id} className="card" style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:22 }}>{exp.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14 }}>{exp.title}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, lineHeight:1.5 }}>{exp.desc}</div>
                </div>
              </div>
              <button
                onClick={() => run(exp.id, exp.action)}
                disabled={busy === exp.id}
                style={{
                  padding:'8px 0', border:'none', borderRadius:6, fontWeight:700, fontSize:12, cursor: busy===exp.id?'not-allowed':'pointer',
                  background: busy===exp.id?'var(--surface-3)': exp.color||'var(--blue-dim)',
                  color: busy===exp.id?'var(--text-muted)': exp.color?'#07090F':'var(--blue)',
                  fontFamily:'Syne,sans-serif',
                }}>
                {busy === exp.id ? 'Exporting…' : exp.id==='quarterly-report' ? '🖨 Print Report' : '↓ Download CSV'}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop:24, padding:14, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8 }}>
          <div style={{ fontSize:12, fontWeight:600, fontFamily:'Syne,sans-serif', marginBottom:6 }}>💡 Tips</div>
          <ul style={{ fontSize:12, color:'var(--text-muted)', paddingLeft:16, lineHeight:2 }}>
            <li>Open CSV files in Google Sheets or Excel — use <strong>File → Import</strong> and select UTF-8 encoding</li>
            <li>Quarterly Report opens in a new tab — use your browser's <strong>Print → Save as PDF</strong></li>
            <li>CRM and Invoice exports fetch live data from the server — ensure you're connected</li>
            <li>All data stays private — exports happen locally in your browser</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
