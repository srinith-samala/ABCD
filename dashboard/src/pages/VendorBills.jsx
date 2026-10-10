import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import Portal from '../components/Portal';

const money = (n) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function VendorBills() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
  });

  const load = async () => {
    try {
      const res = await fetch(`${API}/api/vendorbills`, { headers: authHeaders() });
      if (res.ok) setBills(await res.json());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.vendorName.trim()) return alert('Vendor name is required');
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/vendorbills${form.id ? `/${form.id}` : ''}`, {
        method: form.id ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (res.ok) { setForm(null); load(); }
      else alert('Failed to save vendor bill');
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, outline: 'none' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Vendor Payables" subtitle="Track supplier bills, payments, and holds" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button onClick={() => setForm({ vendorName: '', invoiceNo: '', amount: 0, paid: 0, pending: 0, status: 'Pending', date: new Date().toISOString().slice(0, 10) })} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>+ Add Vendor Bill</button>
        </div>
        
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#8A94A6', textTransform: 'uppercase', fontSize: 11 }}>
                <th style={{ padding: '10px' }}>Date</th>
                <th style={{ padding: '10px' }}>Vendor & Invoice</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Total Amt</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Paid</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Pending</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.id} style={{ borderTop: '1px solid #E8EAED' }}>
                  <td style={{ padding: '12px 10px', color: '#8A94A6' }}>{new Date(b.date || b.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 10px', fontWeight: 600 }}>
                    {b.vendorName}
                    {b.invoiceNo && <div style={{ fontSize: 10, color: '#8A94A6', marginTop: 2, fontWeight: 400 }}>Inv: {b.invoiceNo}</div>}
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right' }}>{money(b.amount)}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: '#16A34A' }}>{money(b.paid)}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: '#EF4444', fontWeight: 600 }}>{money(b.pending)}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 600, 
                      background: b.status === 'Paid' ? '#D6F5E3' : b.status === 'Hold' ? '#FEF3C7' : '#FEE2E2',
                      color: b.status === 'Paid' ? '#16A34A' : b.status === 'Hold' ? '#D97706' : '#EF4444' }}>
                      {b.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                    <button onClick={() => setForm({ ...b, date: new Date(b.date || b.createdAt).toISOString().slice(0, 10) })} style={{ border: 'none', background: '#F4F5F7', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Edit</button>
                  </td>
                </tr>
              ))}
              {!loading && bills.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: '#8A94A6' }}>No vendor bills found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Portal><div onClick={() => setForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 450 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{form.id ? 'Edit Bill' : 'Add Bill'}</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Vendor Name</label>
                <input style={inputStyle} value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Invoice No (Optional)</label>
                <input style={inputStyle} value={form.invoiceNo || ''} onChange={e => setForm({ ...form, invoiceNo: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Total Amount</label>
                <input type="number" style={inputStyle} value={form.amount} onChange={e => {
                  const amt = parseFloat(e.target.value) || 0;
                  const paid = parseFloat(form.paid) || 0;
                  setForm({ ...form, amount: e.target.value, pending: amt - paid });
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Paid</label>
                <input type="number" style={inputStyle} value={form.paid} onChange={e => {
                  const paid = parseFloat(e.target.value) || 0;
                  const amt = parseFloat(form.amount) || 0;
                  setForm({ ...form, paid: e.target.value, pending: amt - paid });
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Pending</label>
                <input type="number" style={{ ...inputStyle, background: '#F4F5F7', fontWeight: 700 }} value={form.pending} readOnly />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Status</label>
                <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option>Pending</option>
                  <option>Hold</option>
                  <option>Paid</option>
                </select>
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
