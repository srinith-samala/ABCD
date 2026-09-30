import React, { useState, useEffect } from 'react';
import { API } from '../config';
import { Link } from 'react-router-dom';
import Header from '../components/Header';

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

  const handleAddCat = async () => {
    const name = window.prompt('Enter new category name:');
    if (!name) return;
    try {
      const res = await fetch(`${API}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name })
      });
      if (res.ok) fetchCategories();
      else alert('Failed to create category. You may not have admin rights.');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Categories" subtitle="Manage your product categories" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button onClick={handleAddCat} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Category</button>
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
    </div>
  );
}
