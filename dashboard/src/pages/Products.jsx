import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';

function getStatus(stock, reorder) {
  if (stock === 0) return 'Out of Stock';
  if (stock <= reorder) return 'Low Stock';
  return 'In Stock';
}

const statusColors = {
  'In Stock': { bg: '#D6F5E3', color: '#16A34A', dot: '#2ECC71' },
  'Low Stock': { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Out of Stock': { bg: '#FEE2E2', color: '#EF4444', dot: '#EF4444' },
};


function ProductModal({ product, onClose, fetchProducts }) {
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

export default function Products() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [selected, setSelected] = useState(null);
  const [products, setProducts] = useState([]);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API}/api/stock`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setProducts(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAddProduct = async () => {
    const name = window.prompt("Enter product name:");
    if (!name) return;
    const cat = window.prompt("Enter category (e.g. Dairy, Grocery):", "Grocery");
    const price = window.prompt("Enter price:", "10");
    const stock = window.prompt("Enter opening stock:", "50");
    
    try {
      const res = await fetch(`${API}/api/stock`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ name, category: cat, price, openingStock: stock })
      });
      if (res.ok) fetchProducts();
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = products
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'stock' ? b.quantity - a.quantity : b.price - a.price);

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Products" subtitle="Browse and manage your product catalog" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none' }} />
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ padding: '9px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none' }}>
            <option value="name">Sort: Name</option>
            <option value="stock">Sort: Stock ↓</option>
            <option value="price">Sort: Price ↓</option>
          </select>
          <button onClick={handleAddProduct} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Product</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 18 }}>
          {filtered.map(p => {
            const status = getStatus(p.quantity, p.reorderLevel);
            const sc = statusColors[status];
            const catColor = '#6C63FF';
            return (
              <div key={p.id} onClick={() => setSelected(p)} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', borderTop: `3px solid ${catColor}`, position: 'relative' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.12)'; e.currentTarget.querySelector('.hbtn').style.transform = 'translateY(0)'; e.currentTarget.querySelector('.hbtn').style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)'; e.currentTarget.querySelector('.hbtn').style.transform = 'translateY(100%)'; e.currentTarget.querySelector('.hbtn').style.opacity = '0'; }}>
                <div style={{ textAlign: 'center', paddingTop: 24, paddingBottom: 10, fontSize: 36 }}>{p.emoji || '📦'}</div>
                <div style={{ padding: '0 16px 16px' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{p.name}</h3>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: catColor + '22', color: catColor }}>{p.category?.name || p.category || 'N/A'}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <p style={{ fontSize: 15, fontWeight: 700 }}>₹{p.price}</p>
                    <span style={{ fontSize: 11, color: '#8A94A6' }}>/ {p.unit || 'pcs'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: '#8A94A6' }}>{p.quantity} in stock</span>
                  </div>
                </div>
                <div className="hbtn" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#2ECC71', color: '#fff', padding: '10px', textAlign: 'center', fontSize: 12, fontWeight: 600, transform: 'translateY(100%)', opacity: 0, transition: 'transform 0.2s ease, opacity 0.2s' }}>View Details →</div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#8A94A6' }}>No products found. Click Add Product to create one.</div>
          )}
        </div>
      </div>
      <ProductModal product={selected} onClose={() => setSelected(null)} fetchProducts={fetchProducts} />
    </div>
  );
}
