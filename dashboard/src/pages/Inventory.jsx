import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';

const STATUS = {
  'In Stock': { bg: '#D6F5E3', color: '#16A34A' },
  'Low Stock': { bg: '#FEF3C7', color: '#92400E' },
  'Out of Stock': { bg: '#FEE2E2', color: '#EF4444' },
};

function getStatus(stock, reorder) {
  if (stock === 0) return 'Out of Stock';
  if (stock <= reorder) return 'Low Stock';
  return 'In Stock';
}

const Badge = ({ status }) => (
  <span className="badge" style={{ background: STATUS[status]?.bg, color: STATUS[status]?.color }}>
    {status}
  </span>
);

export default function Inventory() {
  const [tab, setTab] = useState('All Items');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
      const [resProd, resCat, resTrans] = await Promise.all([
        fetch(`${API}/api/stock`, { headers }),
        fetch(`${API}/api/categories`, { headers }),
        fetch(`${API}/api/transactions`, { headers })
      ]);
      if (resProd.ok) {
        const prodData = await resProd.json();
        setProducts(prodData);
      }
      if (resCat.ok) {
        const catData = await resCat.json();
        setCategories(['All', ...catData.map(c => c.name)]);
      }
      if (resTrans.ok) {
        const transData = await resTrans.json();
        setTransactions(transData.filter(t => t.type === 'PURCHASE'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddItem = async () => {
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
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      const res = await fetch(`${API}/api/stock/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) fetchData();
      else alert("Only Admins can delete products.");
    } catch (err) {
      console.error(err);
    }
  };

  const tabs = ['All Items', 'Low Stock', 'Receiving Log'];

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    const matchCat = catFilter === 'All' || p.category === catFilter || (p.category && p.category.name === catFilter);
    const matchTab = tab === 'Low Stock' ? getStatus(p.quantity, p.reorderLevel) !== 'In Stock' : true;
    return matchSearch && matchCat && matchTab;
  });

  const inStock = products.filter(p => getStatus(p.quantity, p.reorderLevel) === 'In Stock').length;
  const lowStock = products.filter(p => getStatus(p.quantity, p.reorderLevel) === 'Low Stock').length;
  const outOfStock = products.filter(p => getStatus(p.quantity, p.reorderLevel) === 'Out of Stock').length;

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Inventory" subtitle="Manage your stock levels and receiving logs" />

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
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
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: bg, color }}>
                {label}: {value}
              </span>
            </div>
          ))}
        </div>

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

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {tab !== 'Receiving Log' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #E8EAED' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or SKU..."
                  style={{
                    flex: 1, padding: '8px 14px', borderRadius: 8,
                    border: '1.5px solid #E8EAED', fontSize: 13,
                    fontFamily: 'DM Sans', outline: 'none', color: '#0F1B2D',
                  }}
                />
                <select
                  value={catFilter}
                  onChange={e => setCatFilter(e.target.value)}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: '1.5px solid #E8EAED',
                    fontSize: 13, fontFamily: 'DM Sans', color: '#0F1B2D', outline: 'none',
                  }}
                >
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
                <button onClick={handleAddItem} style={{
                  padding: '8px 18px', borderRadius: 8,
                  background: '#2ECC71', color: '#fff', border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans',
                }}>+ Add Item</button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ margin: 0, width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#FAFBFC' }}>
                      {['SKU', 'Product', 'Category', 'Stock', 'Unit', 'Reorder Level', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #E8EAED' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => {
                      const status = getStatus(p.quantity, p.reorderLevel);
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #F4F5F7' }}>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: '#8A94A6', fontWeight: 500 }}>{p.sku || `SKU-${p.id}`}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 18 }}>{p.emoji || '📦'}</span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#F4F5F7', color: '#8A94A6', fontWeight: 500 }}>{p.category?.name || p.category || 'N/A'}</span>
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.quantity}</td>
                          <td style={{ padding: '12px 16px', color: '#8A94A6' }}>{p.unit || 'pcs'}</td>
                          <td style={{ padding: '12px 16px', color: '#8A94A6' }}>{p.reorderLevel}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <Badge status={status} />
                            {tab === 'Low Stock' && (
                              <div style={{ marginTop: 6, background: '#E8EAED', borderRadius: 4, height: 4, width: 80, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, Math.round(p.quantity / p.reorderLevel * 100))}%`, background: '#F59E0B', borderRadius: 4 }} />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              {tab === 'Low Stock' && (
                                <button style={{
                                  padding: '5px 12px', borderRadius: 6,
                                  background: '#FEF3C7', color: '#92400E', border: 'none',
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                }} onClick={() => alert('Order functionality coming soon')}>Reorder</button>
                              )}
                              <button onClick={() => handleDelete(p.id)} title="Delete" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2h4v1.5M5.5 6v4.5M8.5 6v4.5M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: '#8A94A6' }}>No products found. Click Add Item to create one.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
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
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#2ECC71' }}>+{row.quantity}</td>
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
          )}
        </div>
      </div>
    </div>
  );
}
