import React, { useState, useEffect, useMemo } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import ProductCard from '../components/ProductCard';
import ProductDrawer, { getStatus } from '../components/ProductDrawer';
import ImportProductsModal from '../components/ImportProductsModal';
import ProductFormModal from '../components/ProductFormModal';
import { fmtQty } from '../utils';
import Portal from '../components/Portal';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const inr0 = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const toDayStr = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};
const fmtDay = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

export default function Inventory() {
  const [tab, setTab] = useState('All Items'); // 'All Items' | 'Daily Inventory' | 'Low Stock' | 'Receiving Log'
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [catFilter, setCatFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [transactions, setTransactions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Quick Convert/Log Current Stock as Dated Bill Modal
  const [showQuickBillModal, setShowQuickBillModal] = useState(false);
  const [quickBillDate, setQuickBillDate] = useState('2026-10-01');
  const [quickBillTotal, setQuickBillTotal] = useState('');
  const [creatingBill, setCreatingBill] = useState(false);

  // Quick Add Stock Item Modal
  const [showAddStock, setShowAddStock] = useState(false);
  const [stockEntry, setStockEntry] = useState({
    productId: '',
    quantity: '',
    total: '',
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
  });
  const [savingStock, setSavingStock] = useState(false);

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
      if (resTrans.ok) {
        const txs = await resTrans.json();
        setTransactions(txs.filter(t => t.type === 'PURCHASE'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveStockEntry = async (e) => {
    e.preventDefault();
    if (!stockEntry.productId) return alert('Please select a product');
    setSavingStock(true);
    try {
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` };
      const res = await fetch(`${API}/api/transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'PURCHASE',
          productId: parseInt(stockEntry.productId),
          quantity: parseFloat(stockEntry.quantity),
          total: stockEntry.total !== '' ? parseFloat(stockEntry.total) : undefined,
          date: stockEntry.date ? `${stockEntry.date}T12:00:00.000Z` : undefined,
        }),
      });
      if (res.ok) {
        setShowAddStock(false);
        setStockEntry({ productId: '', quantity: '', total: '', date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) });
        fetchData();
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error || 'Failed to save inventory entry');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setSavingStock(false);
    }
  };

  const handleCreateDailyBill = async (e) => {
    e.preventDefault();
    setCreatingBill(true);
    try {
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` };
      const res = await fetch(`${API}/api/stock/create-daily-bill`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          date: quickBillDate,
          customTotal: quickBillTotal !== '' ? parseFloat(quickBillTotal) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setShowQuickBillModal(false);
        alert(`Successfully logged ${data.itemsCount} items as ${fmtDay(quickBillDate)} inventory bill (${inr(data.totalCost)})!`);
        fetchData();
      } else {
        alert(data.error || 'Failed to create daily bill');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setCreatingBill(false);
    }
  };

  const tabs = ['All Items', '📅 Daily Inventory', 'Low Stock', 'Receiving Log'];

  // Master stock list filtering
  const filtered = products
    .filter(p => {
      const q = search.toLowerCase();
      const matchSearch = p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q));
      const matchCat = catFilter === 'All' || p.category === catFilter || (p.category && p.category.name === catFilter);
      const matchTab = tab === 'Low Stock' ? getStatus(p.quantity, p.reorderLevel) !== 'In Stock' : true;
      return matchSearch && matchCat && matchTab;
    })
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'stock' ? b.quantity - a.quantity : b.price - a.price);

  // Group receiving logs by Date using Indian local time
  const dailyGroups = useMemo(() => {
    const map = new Map();
    transactions.forEach(t => {
      const d = toDayStr(t.createdAt);
      if (!d) return;
      if (!map.has(d)) {
        map.set(d, { date: d, items: [], totalAmount: 0, totalUnits: 0 });
      }
      const g = map.get(d);
      g.items.push(t);
      g.totalAmount += Number(t.total || 0);
      g.totalUnits += Number(t.quantity || 0);
    });
    let list = [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
    if (dateFilter) {
      list = list.filter(g => g.date === dateFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.map(g => ({
        ...g,
        items: g.items.filter(it => (it.product?.name || '').toLowerCase().includes(q))
      })).filter(g => g.items.length > 0);
    }
    return list;
  }, [transactions, dateFilter, search]);

  // each day is a dropdown: click to open / close, any number of days can be open at the same time
  const [openDays, setOpenDays] = useState(() => new Set());
  const [openInit, setOpenInit] = useState(false);
  useEffect(() => {
    if (!openInit && dailyGroups.length) { setOpenDays(new Set([dailyGroups[0].date])); setOpenInit(true); }
  }, [dailyGroups, openInit]);
  const toggleDay = (d) => setOpenDays(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  const forceOpen = !!(search.trim() || dateFilter); // while searching / filtering by date, matching days stay open

  const inStock = products.filter(p => getStatus(p.quantity, p.reorderLevel) === 'In Stock').length;
  const lowStock = products.filter(p => getStatus(p.quantity, p.reorderLevel) === 'Low Stock').length;
  const outOfStock = products.filter(p => getStatus(p.quantity, p.reorderLevel) === 'Out of Stock').length;
  const totalStockValue = products.reduce((sum, p) => sum + (p.quantity * (p.price || 0)), 0);

  const fieldStyle = { padding: '9px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', background: '#fff' };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Inventory" subtitle="Manage master stock, date-categorized daily inventory bills, and receiving logs" />

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {/* Stock summary badges */}
        <div style={{
          display: 'flex', gap: 14, marginBottom: 20,
          background: '#fff', borderRadius: 12, padding: '14px 20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Total SKUs', value: products.length, bg: '#EEF0FF', color: '#6C63FF' },
              { label: 'In Stock', value: inStock, bg: '#D6F5E3', color: '#16A34A' },
              { label: 'Low Stock', value: lowStock, bg: '#FEF3C7', color: '#92400E' },
              { label: 'Out of Stock', value: outOfStock, bg: '#FEE2E2', color: '#EF4444' },
            ].map(({ label, value, bg, color }) => (
              <span key={label} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: bg, color }}>
                {label}: {value}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F1B2D' }}>
            Total Stock Value: <span style={{ color: '#16A34A', fontWeight: 800 }}>{inr(totalStockValue)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: '#F4F5F7', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 20 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#0F1B2D' : '#8A94A6',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>{t}</button>
          ))}
        </div>

        {/* ===================== TAB 1: DAILY INVENTORY & BILLS ===================== */}
        {tab === '📅 Daily Inventory' && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 260 }}>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  style={{ ...fieldStyle, minWidth: 150 }}
                  title="Filter by specific date"
                />
                {dateFilter && (
                  <button onClick={() => setDateFilter('')} style={{ padding: '8px 12px', borderRadius: 10, background: '#F4F5F7', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    Clear Date ✕
                  </button>
                )}
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search item in bills..."
                  style={{ ...fieldStyle, flex: 1, minWidth: 180 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setQuickBillDate(dateFilter || '2026-10-01'); setShowQuickBillModal(true); }}
                  style={{ padding: '9px 16px', borderRadius: 10, background: '#EEF0FF', color: '#6C63FF', border: '1.5px solid #C7D2FE', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  title="Record existing master stock as an inventory bill for any date"
                >
                  ⚡ Record Stock as Dated Bill
                </button>
                <button onClick={() => setShowImport(true)} style={{ padding: '9px 18px', borderRadius: 10, background: '#fff', color: '#0F1B2D', border: '1.5px solid #E8EAED', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⬆ Import CSV / Excel</button>
                <button onClick={() => setShowAddStock(true)} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Daily Bill / Item</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {dailyGroups.length > 1 && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: -6 }}>
                  <button onClick={() => setOpenDays(new Set(dailyGroups.map(g => g.date)))} style={{ padding: '6px 12px', borderRadius: 8, background: '#F4F5F7', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Open all days</button>
                  <button onClick={() => setOpenDays(new Set())} style={{ padding: '6px 12px', borderRadius: 8, background: '#F4F5F7', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Close all</button>
                </div>
              )}
              {dailyGroups.map(group => {
                const open = forceOpen || openDays.has(group.date);
                // lines of this day grouped by supplier bill
                const bills = [];
                const byRef = new Map();
                group.items.forEach(it => {
                  const ref = it.note || 'Other entries';
                  if (!byRef.has(ref)) { const g = { ref, rows: [], total: 0, units: 0 }; byRef.set(ref, g); bills.push(g); }
                  const g = byRef.get(ref);
                  g.rows.push(it); g.total += Number(it.total || 0); g.units += Number(it.quantity || 0);
                });
                const billCount = bills.filter(b => b.ref !== 'Other entries').length;
                return (
                <div key={group.date} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Day header - click to open / close */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => toggleDay(group.date)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDay(group.date); } }}
                    style={{
                      padding: '14px 20px', background: open ? '#F0F7F3' : '#FAFBFC', borderBottom: open ? '1.5px solid #E8EAED' : 'none', cursor: 'pointer', userSelect: 'none',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 14, color: '#6C63FF', width: 18, display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                      <span style={{ fontSize: 18 }}>📅</span>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0F1B2D' }}>{fmtDay(group.date)}</h3>
                        <p style={{ fontSize: 12, color: '#8A94A6', marginTop: 2 }}>
                          {group.items.length} item{group.items.length === 1 ? '' : 's'}{billCount > 0 ? ` · ${billCount} bill${billCount === 1 ? '' : 's'}` : ''} · click to {open ? 'close' : 'open'}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ padding: '4px 12px', borderRadius: 16, background: '#EEF0FF', color: '#6C63FF', fontSize: 12, fontWeight: 700 }}>
                        Total Units: {fmtQty(group.totalUnits)}
                      </span>
                      <span style={{ padding: '6px 14px', borderRadius: 16, background: '#D6F5E3', color: '#16A34A', fontSize: 15, fontWeight: 800 }}>
                        Total Bill Amount: {inr(group.totalAmount)}
                      </span>
                    </div>
                  </div>

                  {open && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#fff', borderBottom: '1px solid #E8EAED', color: '#8A94A6', fontSize: 11, textTransform: 'uppercase' }}>
                            <th style={{ padding: '10px 18px' }}>Product</th>
                            <th style={{ padding: '10px 18px', textAlign: 'right' }}>Quantity</th>
                            <th style={{ padding: '10px 18px', textAlign: 'right' }}>Rate</th>
                            <th style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 700, color: '#0F1B2D' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bills.map(b => (
                            <React.Fragment key={b.ref}>
                              {(bills.length > 1 || b.ref !== 'Other entries') && (
                                <tr style={{ background: '#F8FAFC' }}>
                                  <td colSpan={3} style={{ padding: '9px 18px', fontWeight: 700, color: '#334155', borderTop: '1px solid #E8EAED' }}>
                                    🧾 {b.ref} <span style={{ fontWeight: 500, color: '#8A94A6', marginLeft: 8 }}>{b.rows.length} item{b.rows.length === 1 ? '' : 's'}</span>
                                  </td>
                                  <td style={{ padding: '9px 18px', textAlign: 'right', fontWeight: 800, color: '#0F1B2D', borderTop: '1px solid #E8EAED' }}>{inr(b.total)}</td>
                                </tr>
                              )}
                              {b.rows.map(row => (
                                <tr key={row.id} style={{ borderBottom: '1px solid #F4F5F7' }}>
                                  <td style={{ padding: '11px 18px 11px 30px', fontWeight: 600 }}>
                                    <span style={{ marginRight: 6 }}>{row.product?.emoji || '📦'}</span>
                                    {row.product?.name || 'Unknown'}
                                    {row.product?.category && (
                                      <span style={{ marginLeft: 8, fontSize: 11, color: '#8A94A6', background: '#F4F5F7', padding: '2px 8px', borderRadius: 6 }}>
                                        {row.product.category.name || row.product.category}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 700, color: '#2ECC71' }}>
                                    +{fmtQty(row.quantity)} <span style={{ fontSize: 12, fontWeight: 500, color: '#8A94A6' }}>{row.product?.unit || 'pcs'}</span>
                                  </td>
                                  <td style={{ padding: '11px 18px', textAlign: 'right', color: '#8A94A6' }}>
                                    {row.quantity > 0 ? `₹${(Number(row.total || 0) / Number(row.quantity)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-'}
                                  </td>
                                  <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 800, color: '#0F1B2D' }}>
                                    {inr(row.total)}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '2px solid #0F1B2D', background: '#FAFBFC' }}>
                            <td style={{ padding: '12px 18px', fontWeight: 800 }}>Day total</td>
                            <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 700 }}>{fmtQty(group.totalUnits)}</td>
                            <td></td>
                            <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 800, color: '#16A34A' }}>{inr(group.totalAmount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
                );
              })}

              {dailyGroups.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#8A94A6' }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#0F1B2D', marginBottom: 6 }}>No date-categorized inventory bills found.</p>
                  <p style={{ fontSize: 13, marginBottom: 20, maxWidth: 520, margin: '0 auto 20px', lineHeight: 1.5 }}>
                    Log your inventory bills by date to see day-by-day units, bill costs, and calculate daily net profit.
                  </p>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {products.length > 0 && (
                      <button
                        onClick={() => { setQuickBillDate('2026-10-01'); setShowQuickBillModal(true); }}
                        style={{ padding: '11px 22px', borderRadius: 10, background: '#6C63FF', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(108, 99, 255, 0.3)' }}
                      >
                        ⚡ Log Current Stock as October 1 Bill ({products.length} Items · {inr(totalStockValue)})
                      </button>
                    )}
                    <button
                      onClick={() => setShowImport(true)}
                      style={{ padding: '11px 22px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      ⬆ Import October 1 Bill (.xlsx / .csv)
                    </button>
                    <button
                      onClick={() => setShowAddStock(true)}
                      style={{ padding: '11px 20px', borderRadius: 10, background: '#fff', color: '#0F1B2D', border: '1.5px solid #CBD5E1', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      + Add Individual Item
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB 2 & 3: MASTER PRODUCTS / LOW STOCK ===================== */}
        {(tab === 'All Items' || tab === 'Low Stock') && (
          <>
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
        )}

        {/* ===================== TAB 4: RECEIVING LOG ===================== */}
        {tab === 'Receiving Log' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ margin: 0, width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#FAFBFC' }}>
                    {['Date', 'Product', 'Qty Received', 'Total Bill Cost', 'Logged By'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #E8EAED' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F4F5F7' }}>
                      <td style={{ padding: '12px 16px', color: '#8A94A6', fontWeight: 600 }}>{fmtDay(row.createdAt)}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        <span style={{ marginRight: 6 }}>{row.product?.emoji || '📦'}</span>
                        {row.product?.name || 'Unknown'}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#2ECC71' }}>+{fmtQty(row.quantity)} {row.product?.unit || ''}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F1B2D' }}>{inr(row.total)}</td>
                      <td style={{ padding: '12px 16px', color: '#8A94A6' }}>User ID {row.userId}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#8A94A6' }}>No receiving logs found. Make a purchase or import a bill to see logs here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* QUICK ADD STOCK BILL / ITEM MODAL */}
      {showAddStock && (
        <Portal><div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 440, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 18, marginBottom: 16, fontWeight: 700 }}>Add Inventory Item from Bill</h3>
            <form onSubmit={handleSaveStockEntry} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>Bill Date
                <input
                  required
                  type="date"
                  value={stockEntry.date}
                  onChange={e => setStockEntry({ ...stockEntry, date: e.target.value })}
                  style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>Product
                <select
                  required
                  value={stockEntry.productId}
                  onChange={e => {
                    const pid = e.target.value;
                    const p = products.find(x => x.id === parseInt(pid));
                    const qty = parseFloat(stockEntry.quantity) || 1;
                    const rate = p ? (p.costPrice || p.price || 0) : 0;
                    setStockEntry({
                      ...stockEntry,
                      productId: pid,
                      total: stockEntry.total === '' ? String(Math.round(qty * rate * 100) / 100) : stockEntry.total,
                    });
                  }}
                  style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
                >
                  <option value="" disabled>Select Product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {fmtQty(p.quantity)} {p.unit || ''}) - ₹{p.price}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>Quantity
                    <input
                      required
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 10"
                      value={stockEntry.quantity}
                      onChange={e => {
                        const q = e.target.value;
                        const p = products.find(x => x.id === parseInt(stockEntry.productId));
                        const rate = p ? (p.costPrice || p.price || 0) : 0;
                        setStockEntry({
                          ...stockEntry,
                          quantity: q,
                          total: (!stockEntry.total || stockEntry.total === '') && q ? String(Math.round(parseFloat(q) * rate * 100) / 100) : stockEntry.total,
                        });
                      }}
                      style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                  </label>
                </div>
                <div style={{ flex: 1.2 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>Total Bill Price (₹)
                    <input
                      required
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 2000"
                      value={stockEntry.total}
                      onChange={e => setStockEntry({ ...stockEntry, total: e.target.value })}
                      style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc', fontWeight: 700, boxSizing: 'border-box' }}
                    />
                  </label>
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#8A94A6' }}>
                Note: This saves the exact bill total into {fmtDay(stockEntry.date)} inventory, directly quantifying your inventory cost for that date.
              </p>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="submit" disabled={savingStock} style={{ flex: 1, padding: 10, background: '#2ECC71', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
                  {savingStock ? 'Saving...' : 'Add to Inventory'}
                </button>
                <button type="button" onClick={() => setShowAddStock(false)} style={{ flex: 1, padding: 10, background: '#F4F5F7', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div></Portal>
      )}

      {showQuickBillModal && (
        <Portal><div onClick={() => setShowQuickBillModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>Record Inventory Bill by Date</h3>
              <button onClick={() => setShowQuickBillModal(false)} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 15 }}>✕</button>
            </div>
            <form onSubmit={handleCreateDailyBill}>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 14, lineHeight: 1.5 }}>
                Record all <b>{products.length} current master stock items</b> (Total Value: <b>{inr(totalStockValue)}</b>) as an official Inventory Bill for the selected date. It will appear under <b>📅 Daily Inventory</b> and deduct from <b>📊 Daily Profit</b> for that date.
              </p>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F1B2D', marginBottom: 4 }}>Bill Date</label>
                <input
                  type="date"
                  required
                  value={quickBillDate}
                  onChange={e => setQuickBillDate(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #CBD5E1', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F1B2D', marginBottom: 4 }}>
                  Bill Total Cost (₹) <span style={{ fontWeight: 400, color: '#8A94A6' }}>(optional override)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder={`Calculated: ${totalStockValue.toFixed(2)}`}
                  value={quickBillTotal}
                  onChange={e => setQuickBillTotal(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #CBD5E1', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowQuickBillModal(false)} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={creatingBill} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {creatingBill ? 'Recording...' : `Record Bill for ${fmtDay(quickBillDate)}`}
                </button>
              </div>
            </form>
          </div>
        </div></Portal>
      )}

      <ProductDrawer product={selected} onClose={() => setSelected(null)} fetchProducts={fetchData} />
      {showForm && <ProductFormModal onClose={() => setShowForm(false)} onSaved={fetchData} />}
      {showImport && <ImportProductsModal onClose={() => setShowImport(false)} onDone={fetchData} initialDate={dateFilter || '2026-10-01'} />}
    </div>
  );
}
