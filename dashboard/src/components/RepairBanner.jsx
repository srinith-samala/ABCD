import React, { useEffect, useState } from 'react';
import { API } from '../config';
import Portal from './Portal';

const money = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

// Shows only when the old Excel import left fake products / orders, uncategorised expenses or wrongly dated payments.
export default function RepairBanner({ onDone }) {
  const [pv, setPv] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [opts, setOpts] = useState({ removeJunk: true, categorize: true, shiftDates: true, markBillsPaid: true });
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

  const load = () => fetch(`${API}/api/accounts/repair/preview`, { headers: headers() })
    .then(r => (r.ok ? r.json() : null)).then(setPv).catch(() => {});
  useEffect(() => { load(); }, []);

  const apply = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API}/api/accounts/repair/apply`, { method: 'POST', headers: headers(), body: JSON.stringify(opts) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Clean-up failed'); return; }
      setResult(d); setOpen(false); load(); onDone && onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (result && !(pv && pv.needsRepair)) {
    return (
      <div className="card" style={{ marginBottom: 18, background: '#D6F5E3', borderLeft: '5px solid #16A34A' }}>
        <p style={{ fontWeight: 700, fontSize: 14 }}>✅ Clean-up done</p>
        <p style={{ fontSize: 12.5, color: '#3B6B4E', marginTop: 4 }}>
          {result.removedProducts} fake products and {result.removedOrders} fake orders removed · {result.categorized} expenses categorised · {result.shifted} payments moved to the right month · {result.billsPaid} vendor bills marked paid.
        </p>
      </div>
    );
  }
  if (!pv || !pv.needsRepair) return null;

  const row = (key, title, desc) => (
    <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FAFBFC', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', marginBottom: 10 }}>
      <input type="checkbox" checked={opts[key]} onChange={e => setOpts({ ...opts, [key]: e.target.checked })} style={{ marginTop: 3 }} />
      <span><b style={{ fontSize: 13 }}>{title}</b><span style={{ display: 'block', fontSize: 12, color: '#8A94A6', marginTop: 2 }}>{desc}</span></span>
    </label>
  );

  return (
    <>
      <div className="card" style={{ marginBottom: 18, background: '#FEF3C7', borderLeft: '5px solid #F59E0B', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <p style={{ fontWeight: 700, fontSize: 14 }}>⚠️ Data needs a quick clean-up</p>
          <p style={{ fontSize: 12.5, color: '#92400E', marginTop: 4 }}>
            The old Excel import created {pv.junk.products} fake products / {pv.junk.orders} fake orders (this is why "Purchases" looked double), left {pv.categorize.count} expenses uncategorised
            {pv.shift.count > 0 && <> and put {pv.shift.count} September payments ({money(pv.shift.amount)}) in October</>}. Your real inventory is not touched.
          </p>
        </div>
        <button onClick={() => setOpen(true)} style={{ padding: '10px 20px', borderRadius: 10, background: '#F59E0B', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Review & clean up</button>
      </div>

      {open && (
        <Portal>
          <div onClick={() => !busy && setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Clean up imported data</h3>
              <p style={{ fontSize: 12.5, color: '#8A94A6', marginBottom: 16 }}>Untick anything you do not want. Real products, real orders and your stock quantities are never changed.</p>
              {pv.junk.products > 0 && row('removeJunk', `Remove ${pv.junk.products} fake products and ${pv.junk.orders} fake orders`,
                `Created from expense / sales rows (e.g. ${pv.junk.sample.slice(0, 4).join(', ')}). Sales and expenses themselves stay - only the duplicate copies in Inventory/Orders go.`)}
              {pv.categorize.count > 0 && row('categorize', `Categorise ${pv.categorize.count} expenses`,
                'Gives each one a proper head (Chicken, Gas, Packaging, Marketing, ...) instead of everything being "Purchases".')}
              {pv.shift.count > 0 && row('shiftDates', `Move ${pv.shift.count} payments dated 1-2 October back to September (${money(pv.shift.amount)})`,
                'Your bank sheet counts them in September. Without this, September profit looks too high and October looks like a loss.')}
              {pv.bills.count > 0 && row('markBillsPaid', `Mark ${pv.bills.count} vendor bills as Paid (${money(pv.bills.amount)})`,
                'Bills with an invoice number from the Food Purchase sheet were already paid through the bank. The "Pending bill" list (rent, water, etc.) stays pending.')}
              {err && <p style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 13, padding: '10px 12px', borderRadius: 10, marginBottom: 12 }}>{err}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setOpen(false)} disabled={busy} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={apply} disabled={busy} style={{ padding: '9px 22px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Cleaning...' : 'Clean up now'}</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
