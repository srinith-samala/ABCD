import React from 'react';
import { API } from '../config';

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
  if (!product) return null;
  const status = getStatus(product.quantity, product.reorderLevel);
  const sc = statusColors[status];
  
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 420, height: '100vh', background: '#fff', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', padding: 32, animation: 'fadeIn 0.2s ease' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <span style={{ fontSize: 40 }}>{product.emoji || '📦'}</span>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{product.name}</h2>
            <p style={{ color: '#8A94A6', fontSize: 13 }}>{product.sku}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[['Category', product.category?.name || product.category || 'N/A'], ['Supplier', 'N/A'], ['Sell Price', `₹${product.price}`], ['Stock', `${product.quantity} ${product.unit || 'pcs'}`], ['Reorder Level', product.reorderLevel]].map(([l, v]) => (
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
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }} onClick={async () => {
            const name = window.prompt("Update product name:", product.name) || product.name;
            const price = window.prompt("Update price:", product.price) || product.price;
            const quantity = window.prompt("Update stock quantity:", product.quantity) || product.quantity;
            try {
              const res = await fetch(`${API}/api/stock/${product.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ name, price, quantity })
              });
              if (res.ok) { fetchProducts(); onClose(); }
              else alert("Failed to update.");
            } catch(e) {}
          }}>Edit Product</button>
          <button onClick={handleDelete} style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#FEE2E2', color: '#EF4444', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}
