import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import ProductCard from '../components/ProductCard';
import ProductDrawer, { getStatus } from '../components/ProductDrawer';
import ImportProductsModal from '../components/ImportProductsModal';
import ProductFormModal from '../components/ProductFormModal';
import { fmtQty } from '../utils';

export default function Inventory() {
  const [tab, setTab] = useState('All Items');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [catFilter, setCatFilter] = useState('All');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [transactions, setTransactions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
      const [resProd, resCat, resTrans] = await Promise.all([
        fetch(`${API}/api/stock`, { headers }),
        fetch(`${API}/api/categories`, { headers }),
        fetch(`${API}/api/transactions`, { headers }),
      ]);
      if (resProd.ok) setProducts(await resProd.json());
      if (resCat.ok) setCategories(['All', ...(await resCat.json()).map(c => c.name)]);
      if (resTrans.ok) setTransactions((await resTrans.json()).filter(t => t.type === 'PURCHASE'));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const tabs = ['All Items', 'Low Stock', 'Receiving Log'];

  const filtered = products
    .filter(p => {
      const q = search.toLowerCase();
      const matchSearch = p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q));
      const matchCat = catFilter === 'All' || p.category === catFilter || (p.category && p.category.name === catFilter);
      const matchTab = tab === 'Low Stock' ? getStatus(p.quantity, p.reorderLevel) !== 'In Stock' : true;
      return matchSearch && matchCat && matchTab;
    })
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'stock' ? b.quantity - a.quantity : b.price - a.price);

  const inStock = products.filter(p => getStatus(p.quantity, p.reorderLevel) === 'In Stock').length;
  const lowStock = products.filter(p => getStatus(p.quantity, p.reorderLevel) === 'Low Stock').length;
  const outOfStock = products.filter(p => getStatus(p.quantity, p.reorderLevel) === 'Out of Stock').length;

  const fieldStyle = { padding: '9px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none' };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Inventory" subtitle="Manage your stock levels and receiving logs" />

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {/* Stock summary */}
        <div style={{
          display: 'flex', gap: 16, marginBottom: 20,
          background: '#fff', borderRadius: 12, padding: '12px 20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)', flexWrap: 'wrap',
        }}>
          {[
            { label: 'Total SKUs', value: products.length, bg: '#EEF0FF', color: '#6C63FF' },
            { label: 'In Stock', value: inStock, bg: '#D6F5E3', color: '#16A34A' },
            { label: 'Low Stock', value: lowStock, bg: '#FEF3C7', color: '#92400E' },
            { label: 'Out of Stock', value: outOfStock, bg: '#FEE2E2', color: '#EF4444' },
          ].map(({ label, value, bg, color }) => (
            <span key={label} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: bg, color }}>
              {label}: {value}
            </span>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: '#F4F5F7', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 20 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#0F1B2D' : '#8A94A6',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>{t}</button>
          ))}
        </div>

        {tab !== 'Receiving Log' ? (
          <>
            {/* Same toolbar + card grid as the Products page */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or SKU..." style={{ ...fieldStyle, flex: 1, minWidth: 180 }} />
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={fieldStyle}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={sort} onChange={e => setSort(e.target.value)} style={fieldStyle}>
                <option value="name">Sort: Name</option>
                <option value="stock">Sort: Stock ↓</option>
                <option value="price">Sort: Price ↓</option>
              </select>
              <button onClick={() => setShowImport(true)} style={{ padding: '9px 18px', borderRadius: 10, background: '#fff', color: '#0F1B2D', border: '1.5px solid #E8EAED', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⬆ Import CSV / Excel</button>
              <button onClick={() => setShowForm(true)} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Item</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 18 }}>
              {filtered.map(p => <ProductCard key={p.id} p={p} onClick={() => setSelected(p)} />)}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#8A94A6' }}>
                  {tab === 'Low Stock' ? 'No low stock items.' : 'No products found. Click Add Item, or Import a CSV / Excel file.'}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ margin: 0, width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#FAFBFC' }}>
                    {['Date', 'Product', 'Qty Received', 'Total Cost', 'Logged By'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #E8EAED' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F4F5F7' }}>
                      <td style={{ padding: '12px 16px', color: '#8A94A6' }}>{new Date(row.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{row.product?.name || 'Unknown'}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#2ECC71' }}>+{fmtQty(row.quantity)}</td>
                      <td style={{ padding: '12px 16px', color: '#8A94A6' }}>₹{row.total}</td>
                      <td style={{ padding: '12px 16px', color: '#8A94A6' }}>User ID {row.userId}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#8A94A6' }}>No receiving logs found. Make a purchase to see logs here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ProductDrawer product={selected} onClose={() => setSelected(null)} fetchProducts={fetchData} />
      {showForm && <ProductFormModal onClose={() => setShowForm(false)} onSaved={fetchData} />}
      {showImport && <ImportProductsModal onClose={() => setShowImport(false)} onDone={fetchData} />}
    </div>
  );
}
