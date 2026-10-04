import React, { useState, useEffect } from 'react';
import { API } from '../config';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Portal from '../components/Portal';

const COLORS = [
  { bg: '#EEF0FF', border: '#6C63FF', emoji: '📁' },
  { bg: '#D6F5E3', border: '#16A34A', emoji: '🥑' },
  { bg: '#FEF3C7', border: '#92400E', emoji: '🍎' },
  { bg: '#FEE2E2', border: '#EF4444', emoji: '🛒' },
];

export default function Categories() {
  const [categories, setCategories] = useState([]);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API}/api/categories`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setCategories(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const [showAdd, setShowAdd] = useState(false);
  const [catName, setCatName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveCat = async () => {
    if (!catName.trim()) { alert('Category name is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name: catName })
      });
      if (res.ok) { setShowAdd(false); setCatName(''); fetchCategories(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to create category'); }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Categories" subtitle="Manage your product categories" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button onClick={() => setShowAdd(true)} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Category</button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
          {categories.map((cat, i) => {
            const style = COLORS[i % COLORS.length];
            return (
              <div key={cat.id} style={{
                background: style.bg,
                borderRadius: 16,
                padding: 24,
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                transition: 'transform 0.15s, box-shadow 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)'; }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
                  <span style={{ fontSize: 40 }}>{style.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F1B2D', marginBottom: 4 }}>{cat.name}</h3>
                    <p style={{ fontSize: 13, color: '#8A94A6' }}>{new Date(cat.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#8A94A6', fontWeight: 500 }}>Status</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: style.border }}>Active</span>
                  </div>
                </div>

                <Link to={`/products?category=${encodeURIComponent(cat.name)}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '9px 18px', borderRadius: 8,
                    background: '#fff', color: style.border,
                    fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    transition: 'box-shadow 0.15s',
                  }}>
                  View Products →
                </Link>
              </div>
            );
          })}
          {categories.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#8A94A6' }}>No categories found. Click Add Category to create one.</div>
          )}
        </div>
      </div>

      {showAdd && (
        <Portal><div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>Add Category</h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 }}>Category name *</label>
              <input
                value={catName}
                onChange={e => setCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveCat(); }}
                autoFocus
                placeholder="e.g. Dairy"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveCat} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  );
}
