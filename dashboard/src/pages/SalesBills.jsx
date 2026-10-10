import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import Portal from '../components/Portal';
import MonthPicker from '../components/MonthPicker';
import ImportSalesBillsModal from '../components/ImportSalesBillsModal';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const inr0 = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const title = (s) => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const authH = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

export function OrdersTabs({ tab, onChange }) {
  const btn = (key, label) => (
    <button key={key} onClick={() => onChange(key)} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === key ? '#0F1B2D' : 'transparent', color: tab === key ? '#fff' : '#8A94A6' }}>{label}</button>
  );
  return <div style={{ display: 'inline-flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', marginBottom: 20 }}>{btn('stock', '📦 Stock Orders')}{btn('bills', '🧾 Daily Sales Bills')}</div>;
}

function DayDrawer({ date, onClose, onDeleted }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [hall, setHall] = useState('');
  const [pay, setPay] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/sales-bills/day/${date}`, { headers: authH() })
      .then(r => r.json().then(j => ({ ok: r.ok, j }))).then(({ ok, j }) => (ok ? setData(j) : setError(j.error || 'Could not load')))
      .catch(() => setError('Error connecting to server'));
  }, [date]);

  const bills = data ? data.bills : [];
  const halls = useMemo(() => [...new Set(bills.map(b => b.hall).filter(Boolean))], [bills]);
  const pays = useMemo(() => [...new Set(bills.map(b => b.paymentType).filter(Boolean))], [bills]);
  const list = bills.filter(b => (!q || String(b.billNo).includes(q.trim()) || (b.onlineOrderNo || '').includes(q.trim())) && (!hall || b.hall === hall) && (!pay || b.paymentType === pay));
  const tot = (k) => list.reduce((s, b) => s + b[k], 0);

  const del = async () => {
    if (!window.confirm(`Delete all bills of ${fmtDay(date)}? Its sales will also be removed from Profit & Loss.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/sales-bills/day/${date}`, { method: 'DELETE', headers: authH() });
      if (r.ok) onDeleted(); else { const j = await r.json().catch(() => ({})); alert(j.error || 'Failed to delete'); }
    } finally { setBusy(false); }
  };

  const rep = data && data.report; const det = rep && rep.details;
  const bar = (label, amount, max, color = '#2ECC71', extra = '') => (
    <div key={label} style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}><span>{label}</span><span style={{ fontWeight: 600 }}>{inr0(amount)}<span style={{ color: '#8A94A6', fontWeight: 500 }}>{extra}</span></span></div>
      <div style={{ height: 5, background: '#F4F5F7', borderRadius: 4 }}><div style={{ height: 5, borderRadius: 4, background: color, width: `${max ? Math.min(100, (amount / max) * 100) : 0}%` }} /></div>
    </div>
  );
  const channels = det ? (det.channels || []).filter(c => c.amount > 0) : [];
  const cats = det ? [...(det.categories || [])].sort((a, b) => b.amount - a.amount).slice(0, 8) : [];
  const alt = det && det.alterations;
  const chips = alt ? [
    ['Discounted bills', alt.discounted.a, alt.discounted.b], ['Cancelled', alt.cancelled.a, alt.cancelled.b], ['Void', alt.voided.a, alt.voided.b],
    ['Complimentary', alt.complimentary.a, alt.complimentary.b], ['No charge', alt.noCharge.a, alt.noCharge.b], ['Staff', alt.staff.a, alt.staff.b],
  ].filter(c => c[1] > 0) : [];
  const th = { padding: '8px 6px', textAlign: 'left', color: '#8A94A6', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' };
  const sel = { padding: '7px 10px', borderRadius: 8, border: '1px solid #E8EAED', fontSize: 12.5, fontFamily: 'inherit' };

  return (
    <Portal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.4)', zIndex: 150, display: 'flex', justifyContent: 'flex-end' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 'min(760px, 100vw)', height: '100vh', background: '#fff', overflowY: 'auto', padding: 24, boxShadow: '-8px 0 40px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div><h2 style={{ fontSize: 20, fontWeight: 700 }}>{fmtDay(date)}</h2><p style={{ fontSize: 12, color: '#8A94A6', marginTop: 2 }}>{rep ? `Bills ${rep.firstBill || ''} to ${rep.lastBill || ''} · ${rep.fileName || ''}` : ''}</p></div>
            <button onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}>✕</button>
          </div>
          {error && <p style={{ color: '#B91C1C' }}>{error}</p>}
          {!data && !error && <p style={{ color: '#8A94A6' }}>Loading...</p>}
          {data && (
            <>
              {rep && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
                  {[['Gross sale', rep.grossSale], ['Discount', rep.discount], ['Net sale', rep.netSale], ['Net excl. tax', rep.netExTax], ['Tax (GST)', rep.taxes]].map(([l, v]) => (
                    <div key={l} style={{ background: '#F4F5F7', borderRadius: 10, padding: '10px 12px' }}><p style={{ fontSize: 11, color: '#8A94A6', textTransform: 'uppercase' }}>{l}</p><p style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>{inr(v)}</p></div>
                  ))}
                  <div style={{ background: '#F4F5F7', borderRadius: 10, padding: '10px 12px' }}><p style={{ fontSize: 11, color: '#8A94A6', textTransform: 'uppercase' }}>Bills · PAX</p><p style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>{rep.bills} · {rep.pax}</p></div>
                </div>
              )}
              {(channels.length > 0 || cats.length > 0) && (
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
                  {channels.length > 0 && <div style={{ flex: '1 1 260px' }}><h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Where it was sold</h4>{channels.map(c => bar(title(c.name), c.amount, Math.max(...channels.map(x => x.amount)), '#6C63FF', ` · ${c.pct}%`))}</div>}
                  {cats.length > 0 && <div style={{ flex: '1 1 260px' }}><h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Top categories</h4>{cats.map(c => bar(c.name, c.amount, cats[0].amount, '#2ECC71', ` · ${c.pct}%`))}</div>}
                </div>
              )}
              {chips.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>{chips.map(([l, n, a]) => <span key={l} style={{ background: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>{l}: {n}{a ? ` (${inr0(a)})` : ''}</span>)}</div>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700 }}>All bills <span style={{ color: '#8A94A6', fontWeight: 500 }}>({list.length})</span></h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input placeholder="Bill no / order #" value={q} onChange={e => setQ(e.target.value)} style={{ ...sel, width: 130 }} />
                  <select value={hall} onChange={e => setHall(e.target.value)} style={sel}><option value="">All halls</option>{halls.map(h => <option key={h} value={h}>{title(h)}</option>)}</select>
                  <select value={pay} onChange={e => setPay(e.target.value)} style={sel}><option value="">All payments</option>{pays.map(h => <option key={h}>{h}</option>)}</select>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr><th style={th}>Bill</th><th style={th}>Time</th><th style={th}>Hall</th><th style={th}>Paid by</th><th style={{ ...th, textAlign: 'right' }}>Gross</th><th style={{ ...th, textAlign: 'right' }}>Disc.</th><th style={{ ...th, textAlign: 'right' }}>Net</th><th style={{ ...th, textAlign: 'right' }}>Tax</th><th style={th}>Ref</th></tr></thead>
                  <tbody>
                    {list.map(b => (
                      <tr key={b.id} style={{ borderTop: '1px solid #F0F1F4' }}>
                        <td style={{ padding: '8px 6px', fontWeight: 600, color: '#16A34A' }}>#{b.billNo}</td>
                        <td style={{ padding: '8px 6px', color: '#8A94A6' }}>{b.billTime}</td>
                        <td style={{ padding: '8px 6px' }}>{title(b.hall)}</td>
                        <td style={{ padding: '8px 6px' }}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: b.paymentType === 'ZMT' ? '#FEE2E2' : '#EEF0FF', color: b.paymentType === 'ZMT' ? '#B91C1C' : '#4338CA', fontWeight: 600 }}>{b.paymentType || '-'}</span></td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>{inr(b.gross)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: b.discount ? '#B45309' : '#C4C9D2' }}>{b.discount ? inr(b.discount) : '-'}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{inr(b.net)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#8A94A6' }}>{b.cgst + b.sgst ? inr(b.cgst + b.sgst) : '-'}</td>
                        <td style={{ padding: '8px 6px', fontSize: 11, color: '#8A94A6' }}>{b.onlineOrderNo || (b.tableNo && b.tableNo !== 'P' && b.tableNo !== 'ZMT' ? `T${b.tableNo}` : '')}{b.discountReason ? ` · ${b.discountReason}` : ''}</td>
                      </tr>
                    ))}
                    {list.length === 0 && <tr><td colSpan="9" style={{ padding: 20, textAlign: 'center', color: '#8A94A6' }}>No bills match.</td></tr>}
                  </tbody>
                  {list.length > 0 && <tfoot><tr style={{ borderTop: '2px solid #0F1B2D', fontWeight: 700 }}><td colSpan="4" style={{ padding: '10px 6px' }}>Total</td><td style={{ padding: '10px 6px', textAlign: 'right' }}>{inr(tot('gross'))}</td><td style={{ padding: '10px 6px', textAlign: 'right' }}>{inr(tot('discount'))}</td><td style={{ padding: '10px 6px', textAlign: 'right' }}>{inr(tot('net'))}</td><td style={{ padding: '10px 6px', textAlign: 'right' }}>{inr(tot('cgst') + tot('sgst'))}</td><td></td></tr></tfoot>}
                </table>
              </div>
              <button onClick={del} disabled={busy} style={{ marginTop: 22, padding: '9px 18px', borderRadius: 10, background: '#FEE2E2', color: '#B91C1C', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{busy ? 'Deleting...' : 'Delete this day'}</button>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

export default function SalesBills({ tab, onTab, initialFiles = [] }) {
  const [reports, setReports] = useState([]);
  const [months, setMonths] = useState([]);
  const [month, setMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(initialFiles.length > 0);
  const [openDay, setOpenDay] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async (m) => {
    try {
      const r = await fetch(`${API}/api/sales-bills${m && m !== 'all' ? `?month=${m}` : ''}`, { headers: authH() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load');
      setReports(j.reports); setMonths(j.months);
      if (!m && j.months.length) { const last = j.months[j.months.length - 1].key; setMonth(last); if (j.months.length > 0) { const r2 = await fetch(`${API}/api/sales-bills?month=${last}`, { headers: authH() }); const j2 = await r2.json(); if (r2.ok) setReports(j2.reports); } }
      setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(null); }, [load]);

  const sum = (k) => reports.reduce((s, r) => s + (r[k] || 0), 0);
  const bills = sum('bills');

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Transactions" subtitle="Stock orders and the daily POS sales bills" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <OrdersTabs tab={tab} onChange={onTab} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <MonthPicker months={months} value={month} onChange={(m) => { setMonth(m); load(m); }} />
          <button onClick={() => setShowUpload(true)} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⬆ Upload daily bills (Excel)</button>
        </div>

        {error && <p style={{ color: '#B91C1C', marginBottom: 12 }}>{error}</p>}

        {reports.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 22 }}>
            {[
              ['Days uploaded', reports.length, '#0F1B2D'], ['Bills', bills.toLocaleString('en-IN'), '#0F1B2D'], ['Net sale (excl. tax)', inr0(sum('netExTax')), '#16A34A'],
              ['Discount given', inr0(sum('discount')), '#B45309'], ['Avg bill', inr0(bills ? sum('netSale') / bills : 0), '#6C63FF'], ['Guests (PAX)', sum('pax').toLocaleString('en-IN'), '#0F1B2D'],
            ].map(([l, v, c]) => <div key={l} className="card"><p style={{ fontSize: 12, color: '#8A94A6', textTransform: 'uppercase', fontWeight: 500 }}>{l}</p><p style={{ fontSize: 24, fontWeight: 700, color: c, marginTop: 8 }}>{v}</p></div>)}
          </div>
        )}

        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#8A94A6', fontSize: 11, textTransform: 'uppercase' }}>
                {['Date', 'Bills', 'PAX', 'Gross', 'Discount', 'Net sale', 'Excl. tax', 'Cash', 'Zomato', ''].map((h, i) => <th key={i} style={{ padding: '10px 8px', textAlign: i >= 3 && i <= 8 ? 'right' : 'left' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} onClick={() => setOpenDay(dayKey(r.reportDate))} style={{ borderTop: '1px solid #E8EAED', cursor: 'pointer' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 600, color: '#16A34A' }}>{fmtDay(r.reportDate)}</td>
                  <td style={{ padding: '12px 8px' }}>{r.bills}</td>
                  <td style={{ padding: '12px 8px' }}>{r.pax}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{inr(r.grossSale)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: '#B45309' }}>{inr(r.discount)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>{inr(r.netSale)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{inr(r.netExTax)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{inr(r.cash)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{inr(r.zomato)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}><span style={{ fontSize: 12, color: '#6C63FF', fontWeight: 600 }}>View bills →</span></td>
                </tr>
              ))}
              {!loading && reports.length === 0 && (
                <tr><td colSpan="10" style={{ textAlign: 'center', padding: 36, color: '#8A94A6' }}>
                  No daily bills yet. Click <b>Upload daily bills (Excel)</b> and choose the POS "Detailed Sales Summary" files from the client.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && <ImportSalesBillsModal initialFiles={initialFiles} onClose={() => setShowUpload(false)} onDone={() => load(month)} />}
      {openDay && <DayDrawer date={openDay} onClose={() => setOpenDay(null)} onDeleted={() => { setOpenDay(null); load(month); }} />}
    </div>
  );
}
