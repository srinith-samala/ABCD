import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import Portal from '../components/Portal';

const money = (n) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function Payroll() {
  const [payroll, setPayroll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
  });

  const load = async () => {
    try {
      const res = await fetch(`${API}/api/payroll`, { headers: authHeaders() });
      if (res.ok) setPayroll(await res.json());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.employeeName.trim()) return alert('Employee name is required');
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/payroll`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          month: form.month ? new Date(form.month + '-01') : new Date()
        }),
      });
      if (res.ok) { setForm(null); load(); }
      else alert('Failed to save payroll entry');
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, outline: 'none' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Payroll Management" subtitle="Manage employee attendance, salaries and advances" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button onClick={() => setForm({ employeeName: '', presentDays: 0, salary: 0, advance: 0, netPay: 0, month: new Date().toISOString().slice(0, 7) })} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>+ Add Payroll Entry</button>
        </div>
        
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#8A94A6', textTransform: 'uppercase', fontSize: 11 }}>
                <th style={{ padding: '10px' }}>Month</th>
                <th style={{ padding: '10px' }}>Employee</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Present Days</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Base Salary</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Advance</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {payroll.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid #E8EAED' }}>
                  <td style={{ padding: '12px 10px', color: '#8A94A6' }}>{new Date(p.month).toLocaleString('default', { month: 'short', year: 'numeric' })}</td>
                  <td style={{ padding: '12px 10px', fontWeight: 600 }}>{p.employeeName}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'center' }}>{p.presentDays}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right' }}>{money(p.salary)}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: '#EF4444' }}>{money(p.advance)}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{money(p.netPay)}</td>
                </tr>
              ))}
              {!loading && payroll.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#8A94A6' }}>No payroll data found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Portal><div onClick={() => setForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 450 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Add Payroll Entry</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Employee Name</label>
                <input style={inputStyle} value={form.employeeName} onChange={e => setForm({ ...form, employeeName: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Month</label>
                <input type="month" style={inputStyle} value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Present Days</label>
                <input type="number" step="0.5" style={inputStyle} value={form.presentDays} onChange={e => setForm({ ...form, presentDays: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Base Salary</label>
                <input type="number" style={inputStyle} value={form.salary} onChange={e => {
                  const s = parseFloat(e.target.value) || 0;
                  const a = parseFloat(form.advance) || 0;
                  setForm({ ...form, salary: e.target.value, netPay: s - a });
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Advance Deducted</label>
                <input type="number" style={inputStyle} value={form.advance} onChange={e => {
                  const a = parseFloat(e.target.value) || 0;
                  const s = parseFloat(form.salary) || 0;
                  setForm({ ...form, advance: e.target.value, netPay: s - a });
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Net Pay</label>
                <input type="number" style={{ ...inputStyle, background: '#F4F5F7', fontWeight: 700 }} value={form.netPay} readOnly />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  );
}
