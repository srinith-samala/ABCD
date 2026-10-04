import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import Portal from '../components/Portal';

const COLORS = [
  { border: '#6C63FF', avatar: '#EEF0FF' },
  { border: '#16A34A', avatar: '#D6F5E3' },
  { border: '#92400E', avatar: '#FEF3C7' },
  { border: '#EF4444', avatar: '#FEE2E2' },
];

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch(`${API}/api/suppliers`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setSuppliers(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const isAdmin = localStorage.getItem('role') === 'ADMIN';
  const [modal, setModal] = useState(null); // null | { id?, name, contact, email, status }
  const [saving, setSaving] = useState(false);

  const openAdd = () => setModal({ name: '', contact: '', email: '', status: 'Active' });
  const openEdit = (s) => setModal({ id: s.id, name: s.name, contact: s.contact || '', email: s.email || '', status: s.status || 'Active' });

  const handleSave = async () => {
    if (!modal.name.trim()) { alert('Supplier name is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/suppliers${modal.id ? `/${modal.id}` : ''}`, {
        method: modal.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name: modal.name, contact: modal.contact, email: modal.email, status: modal.status })
      });
      if (res.ok) { setModal(null); fetchSuppliers(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to save supplier'); }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete supplier "${s.name}"?`)) return;
    try {
      const res = await fetch(`${API}/api/suppliers/${s.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) fetchSuppliers(); else alert('Failed to delete supplier');
    } catch (err) { console.error(err); }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, fontFamily: 'inherit', outline: 'none' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Suppliers" subtitle="Manage your vendor and supplier network" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button onClick={openAdd} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Supplier</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {suppliers.map((s, i) => {
            const style = COLORS[i % COLORS.length];
            return (
              <div key={s.id} style={{
                background: '#fff', borderRadius: 16,
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                padding: 22,
                borderLeft: `4px solid ${style.border}`,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)'; }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: style.border, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{s.name[0]}</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{s.name}</h3>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: style.avatar, color: style.border, fontWeight: 600 }}>{s.status}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}>👤</span>
                  <span style={{ fontSize: 13, color: '#8A94A6' }}>{s.contact || 'No contact specified'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 14 }}>📞</span>
                  <span style={{ fontSize: 13, color: '#0F1B2D', fontWeight: 500 }}>{s.email || 'No email specified'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #E8EAED', borderBottom: '1px solid #E8EAED', marginBottom: 14 }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#8A94A6', marginBottom: 2 }}>Added On</p>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{new Date(s.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => openEdit(s)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: '#F4F5F7', color: '#0F1B2D', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✏️ Edit</button>
                  {isAdmin && (
                    <button onClick={() => handleDelete(s)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: '#FEE2E2', color: '#EF4444', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                  )}
                </div>
              </div>
            );
          })}
          {suppliers.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#8A94A6' }}>No suppliers found. Click Add Supplier to create one.</div>
          )}
        </div>
      </div>

      {modal && (
        <Portal><div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{modal.id ? 'Edit Supplier' : 'Add Supplier'}</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Supplier name *</label>
              <input style={inputStyle} value={modal.name} onChange={e => setModal({ ...modal, name: e.target.value })} autoFocus />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Contact person</label>
              <input style={inputStyle} value={modal.contact} onChange={e => setModal({ ...modal, contact: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email / phone</label>
              <input style={inputStyle} value={modal.email} onChange={e => setModal({ ...modal, email: e.target.value })} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={modal.status} onChange={e => setModal({ ...modal, status: e.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  );
}
