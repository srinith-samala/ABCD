import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { API } from '../config';
import ProductFormModal from './ProductFormModal';

export function getStatus(stock, reorder) {
  if (stock === 0) return 'Out of Stock';
  if (stock <= reorder) return 'Low Stock';
  return 'In Stock';
}

export const statusColors = {
  'In Stock': { bg: '#D6F5E3', color: '#16A34A', dot: '#2ECC71' },
  'Low Stock': { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Out of Stock': { bg: '#FEE2E2', color: '#EF4444', dot: '#EF4444' },
};


export default function ProductDrawer({ product, onClose, fetchProducts }) {
  const [history, setHistory] = useState([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    fetch(`${API}/api/stock/${product.id}/history?offset=${new Date().getTimezoneOffset()}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled && Array.isArray(d)) setHistory(d); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [product]);

  if (!product) return null;
  const status = getStatus(product.quantity, product.reorderLevel);
  const sc = statusColors[status];
  const money = (n) => (n === null || n === undefined || n === '' ? '—' : `₹${n}`);

  const handleDelete = async () => {
    if (!window.confirm("Delete this product?")) return;
    try {
      const res = await fetch(`${API}/api/stock/${product.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        fetchProducts();
        onClose();
      } else {
        alert("Failed to delete. Admins only.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const cells = [
    ['Category', product.category?.name || '—'],
    ['Supplier', product.supplier?.name || '—'],
    ['Buy Price', money(product.costPrice)],
    ['Sell Price', money(product.price)],
    ['Stock', `${product.quantity} ${product.unit || 'pcs'}`],
    ['Reorder Level', product.reorderLevel],
  ];

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }} onClick={onClose}>
        <div style={{ width: 420, maxWidth: '100vw', height: '100vh', background: '#fff', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', padding: 32, animation: 'fadeIn 0.2s ease' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <span style={{ fontSize: 40 }}>{product.emoji || '📦'}</span>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{product.name}</h2>
              <p style={{ color: '#8A94A6', fontSize: 13 }}>{product.sku}</p>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {cells.map(([l, v]) => (
              <div key={l} style={{ background: '#F4F5F7', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 11, color: '#8A94A6', marginBottom: 3, textTransform: 'uppercase', fontWeight: 500 }}>{l}</p>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{v}</p>
              </div>
            ))}
            <div style={{ background: '#F4F5F7', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 11, color: '#8A94A6', marginBottom: 3, textTransform: 'uppercase', fontWeight: 500 }}>Status</p>
              <span className="badge" style={{ background: sc.bg, color: sc.color }}>{status}</span>
            </div>
          </div>

          <div style={{ background: '#F4F5F7', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 11, color: '#8A94A6', marginBottom: 8, fontWeight: 500, textTransform: 'uppercase' }}>Stock history (7 days)</p>
            <div style={{ width: '100%', height: 70 }}>
              <ResponsiveContainer>
                <LineChart data={history} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8A94A6' }} />
                  <Tooltip formatter={(v) => [`${v} ${product.unit || 'pcs'}`, 'Stock']} labelFormatter={(l, p) => p?.[0]?.payload?.date || l} />
                  <Line type="monotone" dataKey="stock" stroke="#2ECC71" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {product.description && (
            <p style={{ fontSize: 13, color: '#8A94A6', marginBottom: 20, lineHeight: 1.5 }}>{product.description}</p>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setEditing(true)} style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }}>Edit Product</button>
            <button onClick={handleDelete} style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#FEE2E2', color: '#EF4444', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }}>Delete</button>
          </div>
        </div>
      </div>
      {editing && (
        <ProductFormModal
          product={product}
          onClose={() => setEditing(false)}
          onSaved={() => { fetchProducts(); onClose(); }}
        />
      )}
    </>
  );
}
