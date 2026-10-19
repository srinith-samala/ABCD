import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { API } from '../config';
import Header from '../components/Header';
import Portal from '../components/Portal';
import MonthPicker from '../components/MonthPicker';
import RepairBanner from '../components/RepairBanner';

const GROUPS = ['Auto', 'Food', 'Packaging', 'Gas', 'Transport', 'Staff', 'Salary', 'Commission', 'Rent', 'Marketing', 'Utilities', 'Maintenance', 'Tax', 'General'];
const PAYMENT_MODES = ['Cash', 'ICICI', 'SVC', 'Bank', 'UPI', 'Other'];

const money = (n) => `₹${Math.abs(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthKeyOf = (d) => { const x = new Date(d); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [month, setMonth] = useState(null); // null = let the server pick the latest month with data
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');

  const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

  const load = useCallback(async (m) => {
    try {
      const q = m ? `?month=${m}` : '';
      const [e, p] = await Promise.all([
        fetch(`${API}/api/expenses`, { headers: authHeaders() }),
        fetch(`${API}/api/accounts/pnl${q}`, { headers: authHeaders() }),
      ]);
      if (e.ok) setExpenses(await e.json());
      if (p.ok) {
        const data = await p.json();
        setPnl(data);
        if (!m) setMonth(data.month || 'all');
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(null); }, [load]);

  const changeMonth = (m) => { setMonth(m); load(m); };
  const reload = () => load(month);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter(e => {
      if (month && month !== 'all' && monthKeyOf(e.expenseDate || e.createdAt) !== month) return false;
      if (groupFilter && (e.group || '') !== groupFilter) return false;
      if (modeFilter && (e.paymentMode || 'Cash') !== modeFilter) return false;
      if (q && !`${e.title} ${e.vendor || ''} ${e.category || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, month, search, groupFilter, modeFilter]);
  const listTotal = list.reduce((s, e) => s + e.amount, 0);

  const openAdd = () => setForm({ title: '', amount: '', category: '', date: today(), paymentMode: 'Cash', vendor: '', group: 'Auto' });
  const openEdit = (e) => setForm({
    id: e.id, title: e.title, amount: String(e.amount), category: e.category || '',
    date: new Date(e.expenseDate || e.createdAt).toISOString().slice(0, 10),
    paymentMode: e.paymentMode || 'Cash', vendor: e.vendor || '', group: e.group || 'Auto',
  });

  const handleSave = async () => {
    if (!form.title.trim() || !(parseFloat(form.amount) > 0)) { alert('Please enter a title and an amount greater than 0'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/expenses${form.id ? `/${form.id}` : ''}`, { method: form.id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(form) });
      if (res.ok) { setForm(null); reload(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to save expense'); }
    } catch (err) { console.error(err); alert('Error connecting to server'); } finally { setSaving(false); }
  };

  const handleDelete = async (e) => {
    if (!window.confirm(`Delete expense "${e.title}"?`)) return;
    try {
      const res = await fetch(`${API}/api/expenses/${e.id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) reload(); else alert('Failed to delete expense');
    } catch (err) { console.error(err); }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 };
  const hasData = pnl && (pnl.sales.total > 0 || pnl.totalExpenses > 0);
  const isProfit = pnl ? pnl.netProfit >= 0 : true;
  const maxGroup = pnl && pnl.byGroup.length ? pnl.byGroup[0].amount : 1;
  const noSales = pnl && pnl.sales.total === 0 && pnl.totalExpenses > 0;

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Expenses" subtitle="Month-wise expenses with real profit or loss" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>

        <RepairBanner onDone={reload} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <MonthPicker months={pnl ? pnl.months : []} value={month} onChange={changeMonth} />
          <button onClick={openAdd} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Expense</button>
        </div>

        {/* Profit / Loss banner - same numbers as the P&L page and the Excel export */}
        {pnl && (
          <div className="card" style={{
            marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
            background: !hasData ? '#fff' : isProfit ? '#D6F5E3' : '#FEE2E2',
            borderLeft: `5px solid ${!hasData ? '#E8EAED' : isProfit ? '#16A34A' : '#EF4444'}`,
          }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {pnl.label} · {!hasData ? 'Profit / Loss' : isProfit ? 'Profit' : 'Loss'}
              </p>
              <p style={{ fontSize: 32, fontWeight: 800, marginTop: 4, color: !hasData ? '#8A94A6' : isProfit ? '#16A34A' : '#EF4444' }}>
                {!hasData ? '—' : `${isProfit ? '+' : '-'}${money(pnl.netProfit)}`}
                {hasData && pnl.sales.total > 0 && <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 10, color: '#5B6577' }}>{pnl.margin.toFixed(1)}% margin</span>}
              </p>
            </div>
            <div style={{ maxWidth: 340 }}>
              <p style={{ fontSize: 12, color: '#5B6577' }}>
                Sales − Food & packaging − Other expenses − Salaries. GST and cash withdrawn from bank are not counted as costs.
              </p>
              <Link to="/pandl" style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', textDecoration: 'none' }}>Open full P&L →</Link>
            </div>
          </div>
        )}
        {noSales && <p style={{ background: '#FEF3C7', color: '#92400E', fontSize: 12.5, padding: '10px 14px', borderRadius: 10, marginBottom: 18 }}>No sales are recorded for {pnl.label}, so this month shows only costs. If these payments belong to the previous month, edit their date.</p>}

        {pnl && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18, marginBottom: 24 }}>
            {[
              { label: 'Total Sales', value: pnl.sales.total, icon: '🛒', color: '#16A34A', sub: 'Net of tax' },
              { label: 'Food & Packaging', value: pnl.cogs, icon: '🍗', color: '#0F1B2D', sub: `${pnl.foodCostPct.toFixed(1)}% of sales` },
              { label: 'Other Expenses', value: pnl.opex - pnl.salaryLine, icon: '🧾', color: '#F59E0B', sub: 'Gas, rent, marketing, etc.' },
              { label: 'Salaries', value: pnl.salaryLine, icon: '👨‍🍳', color: '#6C63FF', sub: `${pnl.salaryPct.toFixed(1)}% of sales` },
            ].map(c => (
              <div key={c.label} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ fontSize: 12, color: '#8A94A6', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</p>
                  <span style={{ fontSize: 20 }}>{c.icon}</span>
                </div>
                <p style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{money(c.value)}</p>
                <p style={{ fontSize: 11, color: '#8A94A6', marginTop: 4 }}>{c.sub}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Where the money went</h3>
              {(!pnl || pnl.byGroup.length === 0) && <p style={{ fontSize: 13, color: '#8A94A6' }}>No expenses in this period.</p>}
              {pnl && pnl.byGroup.map(g => (
                <div key={g.group} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                    <span style={{ fontWeight: 500 }}>{g.group}</span>
                    <span style={{ fontWeight: 600 }}>{money(g.amount)} <span style={{ color: '#8A94A6', fontWeight: 500, fontSize: 11 }}>· {g.pct.toFixed(1)}%</span></span>
                  </div>
                  <div style={{ height: 6, background: '#F4F5F7', borderRadius: 4 }}>
                    <div style={{ height: 6, borderRadius: 4, background: g.group === 'Food' || g.group === 'Packaging' ? '#2ECC71' : '#F59E0B', width: `${(g.amount / maxGroup) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {pnl && pnl.byMode.length > 0 && (
              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Paid via</h3>
                {pnl.byMode.map(m => (
                  <div key={m.mode} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderTop: '1px solid #F4F5F7' }}>
                    <span style={{ fontWeight: 500 }}>{m.mode}</span><span style={{ fontWeight: 600 }}>{money(m.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ flex: '2 1 420px', minWidth: 0, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>Expenses <span style={{ color: '#8A94A6', fontWeight: 500 }}>({list.length} · {money(listTotal)})</span></h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 130, padding: '7px 10px' }} />
                <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '7px 10px' }}>
                  <option value="">All heads</option>
                  {GROUPS.filter(g => g !== 'Auto').map(g => <option key={g}>{g}</option>)}
                </select>
                <select value={modeFilter} onChange={e => setModeFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '7px 10px' }}>
                  <option value="">All modes</option>
                  {PAYMENT_MODES.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8A94A6', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px 6px' }}>Date</th>
                  <th style={{ padding: '8px 6px' }}>Title</th>
                  <th style={{ padding: '8px 6px' }}>Head</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {list.map(e => (
                  <tr key={e.id} style={{ borderTop: '1px solid #E8EAED' }}>
                    <td style={{ padding: '10px 6px', color: '#8A94A6', whiteSpace: 'nowrap' }}>{new Date(e.expenseDate || e.createdAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</td>
                    <td style={{ padding: '10px 6px', fontWeight: 500 }}>
                      {e.title}
                      {e.vendor && <div style={{ fontSize: 10, color: '#8A94A6', marginTop: 2 }}>{e.vendor}</div>}
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>{e.group || e.category}</span>
                      <div style={{ fontSize: 10, color: '#8A94A6', marginTop: 4 }}>{e.group && e.category && e.category !== e.group ? `${e.category} · ` : ''}{e.paymentMode || 'Cash'}</div>
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 600 }}>{money(e.amount)}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(e)} style={{ border: 'none', background: '#F4F5F7', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 }}>Edit</button>
                      <button onClick={() => handleDelete(e)} style={{ border: 'none', background: '#FEE2E2', color: '#EF4444', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Delete</button>
                    </td>
                  </tr>
                ))}
                {!loading && list.length === 0 && (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: 28, color: '#8A94A6' }}>No expenses match. Change the period or filters, or click "Add Expense".</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {form && (
        <Portal><div onClick={() => setForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{form.id ? 'Edit Expense' : 'Add Expense'}</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Title *</label>
              <input style={inputStyle} placeholder="e.g. Gas cylinders, Chicken, Rent" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Head (P&L group)</label>
                <select style={inputStyle} value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}>
                  {GROUPS.map(g => <option key={g} value={g}>{g === 'Auto' ? 'Auto (detect from title)' : g}</option>)}
                  {!GROUPS.includes(form.group) && <option>{form.group}</option>}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Vendor (optional)</label>
                <input style={inputStyle} placeholder="e.g. PAYAL" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Amount (₹) *</label>
                <input style={inputStyle} type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Paid via</label>
                <select style={inputStyle} value={form.paymentMode} onChange={e => setForm({ ...form, paymentMode: e.target.value })}>
                  {PAYMENT_MODES.map(p => <option key={p}>{p}</option>)}
                  {!PAYMENT_MODES.includes(form.paymentMode) && <option>{form.paymentMode}</option>}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Date</label>
                <input style={inputStyle} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  );
}
