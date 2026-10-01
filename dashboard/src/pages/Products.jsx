import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import ProductCard from '../components/ProductCard';
import ProductDrawer from '../components/ProductDrawer';
import ImportProductsModal from '../components/ImportProductsModal';
import ProductFormModal from '../components/ProductFormModal';

export default function Products() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [selected, setSelected] = useState(null);
  const [products, setProducts] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [showForm, setShowForm] = useState(false);

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
          <button onClick={() => setShowImport(true)} style={{ padding: '9px 18px', borderRadius: 10, background: '#fff', color: '#0F1B2D', border: '1.5px solid #E8EAED', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⬆ Import CSV / Excel</button>
          <button onClick={() => setShowForm(true)} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Product</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 18 }}>
          {filtered.map(p => <ProductCard key={p.id} p={p} onClick={() => setSelected(p)} />)}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#8A94A6' }}>No products found. Click Add Product, or Import a CSV / Excel file.</div>
          )}
        </div>
      </div>
      <ProductDrawer product={selected} onClose={() => setSelected(null)} fetchProducts={fetchProducts} />
      {showForm && <ProductFormModal onClose={() => setShowForm(false)} onSaved={fetchProducts} />}
      {showImport && <ImportProductsModal onClose={() => setShowImport(false)} onDone={fetchProducts} />}
    </div>
  );
}
