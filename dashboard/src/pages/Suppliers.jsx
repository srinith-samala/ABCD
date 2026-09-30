import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';

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

  const handleAddSupplier = async () => {
    const name = window.prompt("Enter supplier name:");
    if (!name) return;
    const contact = window.prompt("Enter contact person:");
    const email = window.prompt("Enter email/phone:");

    try {
      const res = await fetch(`${API}/api/suppliers`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ name, contact, email })
      });
      if (res.ok) fetchSuppliers();
      else alert('Failed to add supplier. You may not have admin rights.');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Suppliers" subtitle="Manage your vendor and supplier network" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button onClick={handleAddSupplier} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Supplier</button>
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
                  <button style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: '#F4F5F7', color: '#0F1B2D', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Contact</button>
                </div>
              </div>
            );
          })}
          {suppliers.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#8A94A6' }}>No suppliers found. Click Add Supplier to create one.</div>
          )}
        </div>
      </div>
    </div>
  );
}
