'use strict';
const db = require('./db');

function uid() { return `inv_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

async function nextInvoiceNumber() {
  const all = await db.all('invoices', { order: { col: 'created_at', asc: false }, limit: 1 });
  if (!all.length) return 'TTL-2026-001';
  const m = all[0].number.match(/(\d+)$/);
  return `TTL-2026-${String(m ? parseInt(m[1])+1 : 1).padStart(3,'0')}`;
}

async function createInvoice(data) {
  const id = uid();
  const number = data.number || await nextInvoiceNumber();
  const items = JSON.stringify(data.items||[]);
  const subtotal  = (data.items||[]).reduce((s,i) => s + (i.qty||1)*(i.rate||0), 0);
  const taxAmount = subtotal * (data.tax_rate||0) / 100;
  const total     = subtotal + taxAmount;
  return db.insert('invoices', { id, number,
    client_name:data.client_name||'', client_org:data.client_org||'', client_email:data.client_email||'', client_address:data.client_address||'',
    items, subtotal, tax_rate:data.tax_rate||0, tax_amount:taxAmount, total,
    currency:data.currency||'USD', status:data.status||'Draft',
    issued_date:data.issued_date||new Date().toISOString().slice(0,10),
    due_date:data.due_date||null, notes:data.notes||'', pipeline_id:data.pipeline_id||null });
}

async function getInvoices(status = null) {
  return db.all('invoices', status ? { eq:{status}, order:{col:'created_at',asc:false} } : { order:{col:'created_at',asc:false} });
}

async function updateStatus(id, status) {
  const paid_date = status === 'Paid' ? new Date().toISOString().slice(0,10) : null;
  await db.update('invoices', id, { status, paid_date });
}

function generateHTML(invoice) {
  const items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : (invoice.items||[]);
  const cur = invoice.currency === 'UGX' ? 'UGX' : '$';
  const fmt = n => invoice.currency === 'UGX' ? `UGX ${Number(n).toLocaleString()}` : `$${Number(n).toFixed(2)}`;
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const statusColor = { Draft:'#5C6680', Sent:'#F0B429', Paid:'#0ECB81', Overdue:'#FF4757' }[invoice.status]||'#5C6680';
  const rows = items.map(i => `<tr><td style="padding:10px 16px;border-bottom:1px solid #1A2030;color:#DDE3F0">${esc(i.description)}</td><td style="padding:10px 16px;border-bottom:1px solid #1A2030;text-align:center;color:#5C6680">${i.qty||1}</td><td style="padding:10px 16px;border-bottom:1px solid #1A2030;text-align:right;color:#5C6680;font-family:monospace">${fmt(i.rate||0)}</td><td style="padding:10px 16px;border-bottom:1px solid #1A2030;text-align:right;font-family:monospace;font-weight:600;color:#DDE3F0">${fmt((i.qty||1)*(i.rate||0))}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(invoice.number)}</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#07090F;color:#DDE3F0;font-family:'DM Sans',sans-serif;font-size:14px;padding:40px 0}
.page{max-width:720px;margin:0 auto;background:#0D1117;border:1px solid #1A2030;border-radius:16px;overflow:hidden}
@media print{body{background:white;padding:0}.page{background:white;border:none;border-radius:0;max-width:100%;color:#1a1a1a}.no-print{display:none!important}}</style></head>
<body><div class="page">
<div style="background:#131820;padding:32px 40px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #1A2030">
  <div><div style="background:#F0B429;color:#07090F;font-family:'Syne',sans-serif;font-weight:800;font-size:13px;display:inline-block;padding:5px 12px;border-radius:6px;margin-bottom:12px">JAKE</div>
    <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.6px">Tuku-Tuku Innovation Labs</div>
    <div style="color:#5C6680;font-size:13px;margin-top:4px">Northern Uganda — Gulu &amp; Lira</div></div>
  <div style="text-align:right"><div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:800;letter-spacing:-1px;color:#F0B429">INVOICE</div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:15px;color:#DDE3F0;margin-top:6px">${esc(invoice.number)}</div>
    <div style="display:inline-block;background:${statusColor}22;color:${statusColor};font-size:11px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:4px;margin-top:8px;border:1px solid ${statusColor}44">${invoice.status}</div></div></div>
<div style="padding:28px 40px;display:grid;grid-template-columns:1fr 1fr;gap:32px;border-bottom:1px solid #1A2030">
  <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#5C6680;margin-bottom:10px">Bill To</div>
    <div style="font-size:16px;font-weight:600">${esc(invoice.client_name)}</div>
    ${invoice.client_org?`<div style="color:#5C6680;font-size:13px">${esc(invoice.client_org)}</div>`:''}
    ${invoice.client_email?`<div style="color:#5C6680;font-size:12px">${esc(invoice.client_email)}</div>`:''}</div>
  <div style="text-align:right">
    ${invoice.issued_date?`<div style="font-size:13px;color:#5C6680;margin-bottom:6px">Issued: <span style="color:#DDE3F0;font-family:'JetBrains Mono',monospace">${invoice.issued_date}</span></div>`:''}
    ${invoice.due_date?`<div style="font-size:13px;color:#5C6680">Due: <span style="color:#F0B429;font-family:'JetBrains Mono',monospace">${invoice.due_date}</span></div>`:''}</div></div>
<table width="100%" cellpadding="0" cellspacing="0">
  <thead><tr style="background:#0A0C12">
    <th style="padding:10px 16px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#5C6680;font-weight:600">Description</th>
    <th style="padding:10px 16px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#5C6680;font-weight:600">Qty</th>
    <th style="padding:10px 16px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#5C6680;font-weight:600">Rate</th>
    <th style="padding:10px 16px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#5C6680;font-weight:600">Amount</th>
  </tr></thead><tbody>${rows}</tbody></table>
<div style="padding:20px 40px;border-top:1px solid #1A2030;display:flex;justify-content:flex-end">
  <div style="min-width:240px">
    <div style="display:flex;justify-content:space-between;padding:6px 0;color:#5C6680;font-size:13px"><span>Subtotal</span><span style="font-family:'JetBrains Mono',monospace">${fmt(invoice.subtotal)}</span></div>
    ${invoice.tax_rate>0?`<div style="display:flex;justify-content:space-between;padding:6px 0;color:#5C6680;font-size:13px"><span>Tax (${invoice.tax_rate}%)</span><span style="font-family:'JetBrains Mono',monospace">${fmt(invoice.tax_amount)}</span></div>`:''}
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #DDE3F0;margin-top:4px">
      <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px">Total</span>
      <span style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:18px;color:#0ECB81">${fmt(invoice.total)}</span></div></div></div>
${invoice.notes?`<div style="padding:0 40px 24px;border-top:1px solid #1A2030"><div style="font-size:10px;text-transform:uppercase;color:#5C6680;padding-top:20px;margin-bottom:8px">Notes</div><div style="font-size:13px;color:#5C6680">${esc(invoice.notes)}</div></div>`:''}
<div style="background:#0A0C12;padding:16px 40px;display:flex;justify-content:space-between;align-items:center">
  <div style="font-size:11px;color:#2A3050;font-family:'JetBrains Mono',monospace">JAKE · Tuku-Tuku Innovation Labs · 2026</div>
  <button class="no-print" onclick="window.print()" style="background:#F0B429;color:#07090F;border:none;border-radius:6px;padding:7px 16px;font-weight:700;font-size:12px;cursor:pointer">Print / Save PDF</button>
</div></div></body></html>`;
}

module.exports = { createInvoice, getInvoices, updateStatus, generateHTML, nextInvoiceNumber };
