import React, { useState, useEffect, useMemo } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import Portal from '../components/Portal';

const CATEGORIES = ['Electricity Bill', 'Rent', 'Salaries', 'Water Bill', 'Internet / Phone', 'Transport', 'Maintenance', 'Packaging', 'Other'];
const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: 'year', label: 'This year' },
];

const money = (n) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

function inPeriod(dateStr, period) {
  if (period === 'all') return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === 'last') {
    const l = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === l.getFullYear() && d.getMonth() === l.getMonth();
  }
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  return true;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null | { id?, title, amount, category, date }
  const [saving, setSaving] = useState(false);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
  });

  const load = async () => {
    try {
      const [e, t] = await Promise.all([
        fetch(`${API}/api/expenses`, { headers: authHeaders() }),
        fetch(`${API}/api/transactions`, { headers: authHeaders() }),
      ]);
      if (e.ok) setExpenses(await e.json());
      if (t.ok) setTransactions(await t.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    const tx = transactions.filter(t => inPeriod(t.createdAt, period));
    const ex = expenses.filter(e => inPeriod(e.expenseDate || e.createdAt, period));
    const sales = tx.filter(t => t.type === 'SALE').reduce((s, t) => s + t.total, 0);
    const purchases = tx.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + t.total, 0);
    const totalExpenses = ex.reduce((s, e) => s + e.amount, 0);
    const net = sales - purchases - totalExpenses;
    const byCategory = {};
    ex.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    return { sales, purchases, totalExpenses, net, cats, list: ex };
  }, [transactions, expenses, period]);

  const openAdd = () => setForm({ title: '', amount: '', category: CATEGORIES[0], date: today() });
  const openEdit = (e) => setForm({
    id: e.id, title: e.title, amount: String(e.amount), category: e.category,
    date: new Date(e.expenseDate || e.createdAt).toISOString().slice(0, 10),
  });

  const handleSave = async () => {
    if (!form.title.trim() || !(parseFloat(form.amount) > 0)) {
      alert('Please enter a title and an amount greater than 0');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/expenses${form.id ? `/${form.id}` : ''}`, {
        method: form.id ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (res.ok) { setForm(null); load(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to save expense'); }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e) => {
    if (!window.confirm(`Delete expense "${e.title}"?`)) return;
    try {
      const res = await fetch(`${API}/api/expenses/${e.id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) load(); else alert('Failed to delete expense');
    } catch (err) { console.error(err); }
  };

  const hasData = summary.sales > 0 || summary.purchases > 0 || summary.totalExpenses > 0;
  const isProfit = summary.net >= 0;
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, fontFamily: 'inherit', outline: 'none' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 };
  const maxCat = summary.cats.length ? summary.cats[0][1] : 1;

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Expenses" subtitle="Track business expenses and see profit or loss" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>

        {/* Period + add */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6, background: '#fff', padding: 4, borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                padding: '7px 14px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: period === p.key ? '#0F1B2D' : 'transparent',
                color: period === p.key ? '#fff' : '#8A94A6',
              }}>{p.label}</button>
            ))}
          </div>
          <button onClick={openAdd} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Expense</button>
        </div>

        {/* Profit / Loss banner */}
        <div className="card" style={{
          marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          background: !hasData ? '#fff' : isProfit ? '#D6F5E3' : '#FEE2E2',
          borderLeft: `5px solid ${!hasData ? '#E8EAED' : isProfit ? '#16A34A' : '#EF4444'}`,
        }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {!hasData ? 'Profit / Loss' : isProfit ? 'Business is in profit' : 'Business is in loss'}
            </p>
            <p style={{ fontSize: 32, fontWeight: 800, marginTop: 4, color: !hasData ? '#8A94A6' : isProfit ? '#16A34A' : '#EF4444' }}>
              {!hasData ? '—' : `${isProfit ? '+' : '-'}${money(summary.net)}`}
            </p>
          </div>
          <p style={{ fontSize: 12, color: '#8A94A6', maxWidth: 320 }}>
            {hasData ? 'Net = Sales − Purchases − Expenses' : 'No sales, purchases or expenses recorded for this period yet.'}
          </p>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18, marginBottom: 24 }}>
          {[
            { label: 'Total Sales', value: summary.sales, icon: '🛒', color: '#16A34A' },
            { label: 'Purchases (stock bought)', value: summary.purchases, icon: '📦', color: '#0F1B2D' },
            { label: 'Total Expenses', value: summary.totalExpenses, icon: '🧾', color: '#F59E0B' },
          ].map(c => (
            <div key={c.label} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 12, color: '#8A94A6', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</p>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
              </div>
              <p style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{money(c.value)}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Category breakdown */}
          <div className="card" style={{ flex: '1 1 280px', minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Expenses by category</h3>
            {summary.cats.length === 0 && <p style={{ fontSize: 13, color: '#8A94A6' }}>No expenses in this period.</p>}
            {summary.cats.map(([name, amt]) => (
              <div key={name} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 500 }}>{name}</span>
                  <span style={{ fontWeight: 600 }}>{money(amt)}</span>
                </div>
                <div style={{ height: 6, background: '#F4F5F7', borderRadius: 4 }}>
                  <div style={{ height: 6, borderRadius: 4, background: '#F59E0B', width: `${(amt / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Expense list */}
          <div className="card" style={{ flex: '2 1 420px', minWidth: 0, overflowX: 'auto' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>All expenses</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8A94A6', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px 6px' }}>Date</th>
                  <th style={{ padding: '8px 6px' }}>Title</th>
                  <th style={{ padding: '8px 6px' }}>Category</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {summary.list.map(e => (
                  <tr key={e.id} style={{ borderTop: '1px solid #E8EAED' }}>
                    <td style={{ padding: '10px 6px', color: '#8A94A6', whiteSpace: 'nowrap' }}>{new Date(e.expenseDate || e.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 6px', fontWeight: 500 }}>{e.title}</td>
                    <td style={{ padding: '10px 6px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>{e.category}</span>
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 600 }}>{money(e.amount)}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(e)} style={{ border: 'none', background: '#F4F5F7', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 }}>Edit</button>
                      <button onClick={() => handleDelete(e)} style={{ border: 'none', background: '#FEE2E2', color: '#EF4444', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Delete</button>
                    </td>
                  </tr>
                ))}
                {!loading && summary.list.length === 0 && (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: 28, color: '#8A94A6' }}>No expenses for this period. Click "Add Expense" to record one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {form && (
        <Portal><div onClick={() => setForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{form.id ? 'Edit Expense' : 'Add Expense'}</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Category</label>
              <select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                {!CATEGORIES.includes(form.category) && <option>{form.category}</option>}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Title *</label>
              <input style={inputStyle} placeholder="e.g. March electricity bill" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Amount (₹) *</label>
                <input style={inputStyle} type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
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
