import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import ImportOrdersModal from '../components/ImportOrdersModal';
import SalesBills, { OrdersTabs } from './SalesBills';
import MonthPicker from '../components/MonthPicker';
import { fmtQty } from '../utils';
import Portal from '../components/Portal';

const statusStyle = {
  SALE: { bg: '#D6F5E3', color: '#16A34A' },
  PURCHASE: { bg: '#EEF0FF', color: '#6C63FF' },
};

const allTabs = ['All', 'SALE', 'PURCHASE'];
const typeLabel = (t) => (t === 'SALE' ? 'Stock Out' : t === 'PURCHASE' ? 'Stock In' : t);
const inr = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const inr0 = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const signedInr = (n) => `${Number(n) < 0 ? '-' : '+'}${inr(n)}`;
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const timeline = ['Ordered', 'Dispatched', 'Delivered'];

function OrderDrawer({ order, onClose, onEdit, onDelete, isAdmin }) {
  if (!order) return null;
  const step = 2;
  return (
    <Portal><div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div id="printable-invoice" style={{ width: 460, height: '100vh', background: '#fff', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>TRX-{order.id}</h2>
            <p style={{ color: '#8A94A6', fontSize: 13 }}>{new Date(order.createdAt).toLocaleDateString()}</p>
          </div>
          <button className="no-print" onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, padding: '16px 0' }}>
          {timeline.map((t, i) => (
            <React.Fragment key={t}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: i <= step ? '#2ECC71' : '#E8EAED',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.3s',
                }}>
                  {i <= step && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
                </div>
                <span style={{ fontSize: 11, color: i <= step ? '#2ECC71' : '#8A94A6', fontWeight: 600, whiteSpace: 'nowrap' }}>{t}</span>
              </div>
              {i < timeline.length - 1 && (
                <div style={{ flex: 1, height: 2, background: i < step ? '#2ECC71' : '#E8EAED', margin: '0 4px', marginBottom: 20, transition: 'background 0.3s' }} />
              )}
            </React.Fragment>
          ))}
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Transaction Details</h3>
        <table style={{ marginBottom: 20, width: '100%', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Product</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{order.product?.name || 'Unknown'}</td>
              <td style={{ textAlign: 'right', color: '#8A94A6' }}>{fmtQty(order.quantity)}</td>
              <td style={{ textAlign: 'right', color: '#8A94A6' }}>₹{order.product?.price || 0}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{Number(order.total || 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: '2px solid #E8EAED' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Total Amount</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#2ECC71' }}>₹{Number(order.total || 0).toLocaleString()}</span>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          {isAdmin && <button style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }} onClick={() => onEdit(order)}>Edit Order</button>}
          {isAdmin && <button style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#FEE2E2', color: '#B91C1C', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }} onClick={() => onDelete([order.id])}>Delete</button>}
          <button onClick={() => window.print()} style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#F4F5F7', color: '#0F1B2D', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }}>Print Invoice</button>
        </div>
      </div>
    </div></Portal>
  );
}

export default function Orders() {
  const [tab, setTab] = useState('All');
  const [selected, setSelected] = useState(null);
  const [orders, setOrders] = useState([]);
  const [section, setSection] = useState('daily'); // 'daily' | 'stock' | 'bills'
  const [handoverFiles, setHandoverFiles] = useState([]);
  const [products, setProducts] = useState([]);

  // Daily Ledger State
  const [ledger, setLedger] = useState(null);
  const [ledgerMonth, setLedgerMonth] = useState(null);
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [loadingLedger, setLoadingLedger] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newOrder, setNewOrder] = useState({
    type: 'PURCHASE',
    productId: '',
    quantity: '',
    total: '',
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
  });

  const isAdmin = localStorage.getItem('role') === 'ADMIN';
  const authH = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` });

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API}/api/transactions`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      const data = await res.json();
      if (res.ok) setOrders(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLedger = useCallback(async (m) => {
    setLoadingLedger(true);
    try {
      const q = m && m !== 'all' ? `?month=${m}` : (m === 'all' ? '?month=all' : '');
      const res = await fetch(`${API}/api/accounts/daily-ledger${q}`, { headers: authH() });
      const data = await res.json();
      if (res.ok) {
        setLedger(data);
        if (!ledgerMonth && data.month) setLedgerMonth(data.month);
      }
    } catch (err) {
      console.error("Failed to load daily ledger", err);
    } finally {
      setLoadingLedger(false);
    }
  }, [ledgerMonth]);

  const refreshProducts = () => {
    fetch(`${API}/api/stock`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(d => Array.isArray(d) && setProducts(d)).catch(console.error);
  };

  useEffect(() => {
    fetchOrders();
    fetchLedger(null);
    refreshProducts();
  }, [fetchLedger]);

  const counts = { SALE: 0, PURCHASE: 0 };
  orders.forEach(o => counts[o.type] ? counts[o.type]++ : (counts[o.type] = 1));
  const filtered = tab === 'All' ? orders : orders.filter(o => o.type === tab);

  // Edit order modal
  const [editing, setEditing] = useState(null);
  const [editErr, setEditErr] = useState('');
  const [busy, setBusy] = useState(false);
  const openEdit = (o) => {
    setSelected(null);
    setEditErr('');
    setEditing({
      id: o.id, type: o.type, productId: String(o.productId), quantity: String(o.quantity),
      total: String(o.total), date: new Date(o.createdAt).toISOString().slice(0, 10), adjustStock: true,
    });
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    setBusy(true); setEditErr('');
    try {
      const res = await fetch(`${API}/api/transactions/${editing.id}`, {
        method: 'PUT', headers: authH(),
        body: JSON.stringify({
          type: editing.type, productId: parseInt(editing.productId), quantity: parseFloat(editing.quantity),
          total: editing.total === '' ? undefined : parseFloat(editing.total), date: editing.date,
          adjustStock: editing.adjustStock,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setEditErr(data.error || 'Could not save'); return; }
      setEditing(null);
      fetchOrders();
      fetchLedger(ledgerMonth);
      refreshProducts();
    } catch (err) { setEditErr(err.message); } finally { setBusy(false); }
  };

  // Delete orders
  const [checked, setChecked] = useState([]);
  const [delIds, setDelIds] = useState(null);
  const [revertStock, setRevertStock] = useState(false);
  const [delErr, setDelErr] = useState('');
  const askDelete = (ids) => { setSelected(null); setDelErr(''); setRevertStock(false); setDelIds(ids); };
  const confirmDelete = async () => {
    setBusy(true); setDelErr('');
    try {
      const res = await fetch(`${API}/api/transactions`, {
        method: 'DELETE', headers: authH(), body: JSON.stringify({ ids: delIds, revertStock }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setDelErr(data.error || 'Could not delete'); return; }
      setDelIds(null); setChecked(c => c.filter(id => !delIds.includes(id)));
      fetchOrders();
      fetchLedger(ledgerMonth);
      refreshProducts();
    } catch (err) { setDelErr(err.message); } finally { setBusy(false); }
  };

  const handleAddOrder = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          type: newOrder.type,
          productId: parseInt(newOrder.productId),
          quantity: parseFloat(newOrder.quantity),
          total: newOrder.total !== '' ? parseFloat(newOrder.total) : undefined,
          date: newOrder.date ? `${newOrder.date}T12:00:00.000Z` : undefined,
        })
      });
      if (res.ok) {
        setShowAdd(false);
        setNewOrder({ type: 'PURCHASE', productId: '', quantity: '', total: '', date: new Date().toISOString().slice(0, 10) });
        fetchOrders();
        fetchLedger(ledgerMonth);
        refreshProducts();
      } else {
        const data = await res.json();
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleDay = (d) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  if (section === 'bills' && isAdmin) {
    return <SalesBills tab={section} onTab={setSection} initialFiles={handoverFiles} key={handoverFiles.length} />;
  }

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Orders & Daily Ledger" subtitle="Track daily sales, daily inventory bought, and your exact day-by-day profits" />

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {isAdmin && <OrdersTabs tab={section} onChange={setSection} />}

        {/* ===================== TAB 1: DAILY PROFIT & LEDGER ===================== */}
        {section === 'daily' && (
          <div>
            {/* Top Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <MonthPicker
                months={ledger?.months || []}
                value={ledgerMonth}
                onChange={(m) => { setLedgerMonth(m); fetchLedger(m); }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                {isAdmin && (
                  <button onClick={() => setShowImport(true)} style={{ padding: '9px 18px', borderRadius: 10, background: '#fff', color: '#0F1B2D', border: '1.5px solid #E8EAED', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⬆ Import bills (CSV / Excel)</button>
                )}
                <button onClick={() => {
                  setNewOrder({ type: 'PURCHASE', productId: '', quantity: '', total: '', date: new Date().toISOString().slice(0, 10) });
                  setShowAdd(true);
                }} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Bill / Order</button>
              </div>
            </div>

            {/* Summary Stat Cards */}
            {ledger && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div className="card">
                  <p style={{ fontSize: 11, color: '#8A94A6', textTransform: 'uppercase', fontWeight: 600 }}>Period Sales</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 6 }}>{inr(ledger.totalSales)}</p>
                  <p style={{ fontSize: 11, color: '#8A94A6', marginTop: 4 }}>from uploaded daily sales</p>
                </div>
                <div className="card">
                  <p style={{ fontSize: 11, color: '#8A94A6', textTransform: 'uppercase', fontWeight: 600 }}>Inventory Bought</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: '#F59E0B', marginTop: 6 }}>{inr(ledger.totalInventory)}</p>
                  <p style={{ fontSize: 11, color: '#8A94A6', marginTop: 4 }}>stock purchased in bills</p>
                </div>
                <div className="card" style={{ background: '#F8FFF9', border: '1.5px solid #D6F5E3' }}>
                  <p style={{ fontSize: 11, color: '#16A34A', textTransform: 'uppercase', fontWeight: 700 }}>Gross Profit (Sales - Inventory)</p>
                  <p style={{ fontSize: 26, fontWeight: 900, color: ledger.grossProfit >= 0 ? '#16A34A' : '#EF4444', marginTop: 6 }}>
                    {signedInr(ledger.grossProfit)}
                  </p>
                  <p style={{ fontSize: 11, color: '#16A34A', marginTop: 4, fontWeight: 600 }}>{ledger.grossMargin?.toFixed(1) || 0}% profit margin</p>
                </div>
                <div className="card">
                  <p style={{ fontSize: 11, color: '#8A94A6', textTransform: 'uppercase', fontWeight: 600 }}>Salaries & Other Expenses</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#6C63FF', marginTop: 6 }}>{inr(ledger.salaryCost + ledger.otherExpenses)}</p>
                  <p style={{ fontSize: 11, color: '#8A94A6', marginTop: 4 }}>{inr(ledger.salaryCost)} salaries + {inr(ledger.otherExpenses)} misc</p>
                </div>
                <div className="card" style={{ background: ledger.netProfit >= 0 ? '#F0FBF4' : '#FEE2E2', borderLeft: `5px solid ${ledger.netProfit >= 0 ? '#16A34A' : '#EF4444'}` }}>
                  <p style={{ fontSize: 11, color: '#8A94A6', textTransform: 'uppercase', fontWeight: 700 }}>Net Profit (After All Costs)</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: ledger.netProfit >= 0 ? '#16A34A' : '#EF4444', marginTop: 6 }}>
                    {signedInr(ledger.netProfit)}
                  </p>
                  <p style={{ fontSize: 11, color: '#8A94A6', marginTop: 4 }}>profit after worker salary & expenses</p>
                </div>
              </div>
            )}

            {/* Day-by-Day Profit & Accumulated Ledger */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>Day-by-Day Sales, Inventory & Profit Breakdown</h3>
                  <p style={{ fontSize: 12, color: '#8A94A6', marginTop: 2 }}>
                    Profit of each day = Daily Sales − Daily Inventory Bought. See daily profit and accumulated running total.
                  </p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6C63FF', background: '#EEF0FF', padding: '4px 12px', borderRadius: 20 }}>
                  {ledger?.byDay?.length || 0} active days
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#FAFBFC', borderBottom: '1.5px solid #E8EAED' }}>
                      <th style={{ padding: '12px 14px', fontWeight: 600, color: '#0F1B2D' }}>Date</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#16A34A' }}>Sales (₹)</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#F59E0B' }}>Inventory (₹)</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0F1B2D' }}>Day's Profit (₹)</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#8A94A6' }}>Margin</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#16A34A' }}>Acc. Sales</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#F59E0B' }}>Acc. Inventory</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0F1B2D' }}>Acc. Profit</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger?.byDay?.map((d) => {
                      const isExpanded = expandedDays.has(d.date);
                      const isProfitable = d.profit >= 0;
                      return (
                        <React.Fragment key={d.date}>
                          <tr style={{ borderBottom: '1px solid #F0F1F4', background: isExpanded ? '#F8FAFC' : 'transparent', transition: 'background 0.15s' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F1B2D' }}>
                              {fmtDay(d.date)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#16A34A' }}>
                              {inr0(d.sales)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#F59E0B' }}>
                              {inr0(d.inventory)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: isProfitable ? '#16A34A' : '#EF4444' }}>
                              {signedInr(d.profit)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#8A94A6' }}>
                              {d.sales > 0 ? `${d.margin.toFixed(1)}%` : '—'}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', color: '#16A34A', fontWeight: 600 }}>
                              {inr0(d.accumulatedSales)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', color: '#F59E0B', fontWeight: 600 }}>
                              {inr0(d.accumulatedInventory)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: d.accumulatedProfit >= 0 ? '#16A34A' : '#EF4444' }}>
                              {signedInr(d.accumulatedProfit)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <button
                                onClick={() => toggleDay(d.date)}
                                style={{
                                  border: 'none', background: isExpanded ? '#0F1B2D' : '#F4F5F7',
                                  color: isExpanded ? '#fff' : '#0F1B2D',
                                  borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer'
                                }}
                              >
                                {isExpanded ? 'Hide ▲' : 'View ▼'}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Day Details: inventory items bought & sales breakdown */}
                          {isExpanded && (
                            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E8EAED' }}>
                              <td colSpan="9" style={{ padding: '16px 24px' }}>
                                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                  {/* Left: Inventory items bought on this day */}
                                  <div style={{ flex: '1 1 360px', background: '#fff', borderRadius: 10, padding: 16, border: '1px solid #E8EAED' }}>
                                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#F59E0B', display: 'flex', justifyContent: 'space-between' }}>
                                      <span>📦 Inventory Bought ({d.items?.length || 0} items)</span>
                                      <span>Total: {inr(d.inventory)}</span>
                                    </h4>
                                    {(!d.items || d.items.length === 0) ? (
                                      <p style={{ fontSize: 12, color: '#8A94A6' }}>No inventory purchases logged on this day.</p>
                                    ) : (
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                          <tr style={{ color: '#8A94A6', borderBottom: '1px solid #E8EAED', textAlign: 'left' }}>
                                            <th style={{ padding: '6px 0' }}>Item</th>
                                            <th style={{ padding: '6px 0', textAlign: 'right' }}>Qty</th>
                                            <th style={{ padding: '6px 0', textAlign: 'right' }}>Rate</th>
                                            <th style={{ padding: '6px 0', textAlign: 'right' }}>Bill Total</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {d.items.map((it, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #F4F5F7' }}>
                                              <td style={{ padding: '6px 0', fontWeight: 600 }}>{it.productName}</td>
                                              <td style={{ padding: '6px 0', textAlign: 'right', color: '#8A94A6' }}>{fmtQty(it.quantity)} {it.unit}</td>
                                              <td style={{ padding: '6px 0', textAlign: 'right', color: '#8A94A6' }}>₹{it.price}</td>
                                              <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#0F1B2D' }}>{inr(it.total)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>

                                  {/* Right: Sales Channels for this day */}
                                  <div style={{ flex: '1 1 300px', background: '#fff', borderRadius: 10, padding: 16, border: '1px solid #E8EAED' }}>
                                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#16A34A', display: 'flex', justifyContent: 'space-between' }}>
                                      <span>🛒 Sales Breakdown</span>
                                      <span>Total: {inr(d.sales)}</span>
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                      <div style={{ background: '#F4F5F7', padding: '8px 12px', borderRadius: 8 }}>
                                        <p style={{ fontSize: 11, color: '#8A94A6' }}>Cash</p>
                                        <p style={{ fontSize: 14, fontWeight: 700 }}>{inr(d.cash)}</p>
                                      </div>
                                      <div style={{ background: '#F4F5F7', padding: '8px 12px', borderRadius: 8 }}>
                                        <p style={{ fontSize: 11, color: '#8A94A6' }}>UPI / Digital</p>
                                        <p style={{ fontSize: 14, fontWeight: 700 }}>{inr(d.upi)}</p>
                                      </div>
                                      <div style={{ background: '#F4F5F7', padding: '8px 12px', borderRadius: 8 }}>
                                        <p style={{ fontSize: 11, color: '#8A94A6' }}>Card</p>
                                        <p style={{ fontSize: 14, fontWeight: 700 }}>{inr(d.card)}</p>
                                      </div>
                                      <div style={{ background: '#F4F5F7', padding: '8px 12px', borderRadius: 8 }}>
                                        <p style={{ fontSize: 11, color: '#8A94A6' }}>Zomato</p>
                                        <p style={{ fontSize: 14, fontWeight: 700 }}>{inr(d.zomato)}</p>
                                      </div>
                                    </div>
                                    <p style={{ fontSize: 12, color: '#16A34A', fontWeight: 600, marginTop: 12 }}>
                                      Day's Gross Profit = {inr(d.sales)} − {inr(d.inventory)} = <b>{signedInr(d.profit)}</b>
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {(!ledger?.byDay || ledger.byDay.length === 0) && (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: 40, color: '#8A94A6' }}>
                          No daily sales or inventory transactions recorded yet for this period. Click <b>+ Add Bill / Order</b> or <b>Import bills</b> to begin!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: STOCK IN & OUT (INDIVIDUAL ORDERS) ===================== */}
        {section === 'stock' && (
          <div>
            {/* Stat chips */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 24, justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 14 }}>
                {[
                  { label: 'Stock Out', value: counts.SALE || 0, bg: '#D6F5E3', color: '#16A34A' },
                  { label: 'Stock In (Purchases)', value: counts.PURCHASE || 0, bg: '#EEF0FF', color: '#6C63FF' },
                ].map(({ label, value, bg, color }) => (
                  <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 20, background: bg, color, fontSize: 13, fontWeight: 700 }}>{value}</span>
                    <span style={{ fontSize: 13, color: '#8A94A6' }}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {isAdmin && (
                  <button onClick={() => setShowImport(true)} style={{ padding: '9px 18px', borderRadius: 10, background: '#fff', color: '#0F1B2D', border: '1.5px solid #E8EAED', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⬆ Import bills (CSV / Excel)</button>
                )}
                <button onClick={() => setShowAdd(true)} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Order</button>
              </div>
            </div>

            {isAdmin && checked.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FEF3C7', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                <b>{checked.length} selected</b>
                <button onClick={() => askDelete(checked)} style={{ padding: '6px 14px', borderRadius: 8, background: '#DC2626', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Delete selected</button>
                <button onClick={() => setChecked([])} style={{ padding: '6px 14px', borderRadius: 8, background: '#fff', border: '1px solid #E8EAED', fontWeight: 600, cursor: 'pointer' }}>Clear</button>
              </div>
            )}

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 2, background: '#F4F5F7', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 20 }}>
              {allTabs.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
                  background: tab === t ? '#fff' : 'transparent',
                  color: tab === t ? '#0F1B2D' : '#8A94A6',
                  boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}>{typeLabel(t)}</button>
              ))}
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#FAFBFC' }}>
                      {isAdmin && (
                        <th style={{ padding: '12px 16px', borderBottom: '1px solid #E8EAED', width: 36 }}>
                          <input type="checkbox" title="Select all shown"
                            checked={filtered.length > 0 && filtered.every(o => checked.includes(o.id))}
                            onChange={e => setChecked(e.target.checked ? [...new Set([...checked, ...filtered.map(o => o.id)])] : checked.filter(id => !filtered.some(o => o.id === id)))} />
                        </th>
                      )}
                      {['TRX ID', 'Date', 'Type', 'Product', 'Qty', 'Total Bill Amount', 'Action'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #E8EAED' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(order => (
                      <tr key={order.id} style={{ cursor: 'pointer', borderBottom: '1px solid #F4F5F7' }} onClick={() => setSelected(order)}>
                        {isAdmin && (
                          <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={checked.includes(order.id)} onChange={e => setChecked(e.target.checked ? [...checked, order.id] : checked.filter(id => id !== order.id))} />
                          </td>
                        )}
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#6C63FF' }}>TRX-{order.id}</td>
                        <td style={{ padding: '12px 16px', color: '#8A94A6' }}>{new Date(order.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className="badge" style={{ background: statusStyle[order.type]?.bg, color: statusStyle[order.type]?.color }}>{typeLabel(order.type)}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{order.product?.name || 'Unknown'}</td>
                        <td style={{ padding: '12px 16px', color: '#8A94A6' }}>{fmtQty(order.quantity)} {order.product?.unit || ''}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>₹{Number(order.total || 0).toLocaleString()}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <button style={{ padding: '5px 12px', borderRadius: 6, background: '#F4F5F7', color: '#0F1B2D', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); setSelected(order); }}>View</button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: '24px', color: '#8A94A6' }}>No transactions found. Add some stock purchases or sales.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Add Order with Date & Exact Bill Total */}
        {showAdd && (
          <Portal><div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 440, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
              <h2 style={{ fontSize: 18, marginBottom: 16, fontWeight: 700 }}>New Order / Bill Entry</h2>
              <form onSubmit={handleAddOrder} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>Order Type
                  <select required value={newOrder.type} onChange={e => setNewOrder({...newOrder, type: e.target.value})} style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}>
                    <option value="PURCHASE">STOCK IN (Purchased / Received from bill)</option>
                    <option value="SALE">STOCK OUT (Used in Kitchen / Sale)</option>
                  </select>
                </label>

                <label style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>Bill Date
                  <input
                    required
                    type="date"
                    value={newOrder.date}
                    onChange={e => setNewOrder({...newOrder, date: e.target.value})}
                    style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}
                  />
                </label>

                <label style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>Product
                  <select required value={newOrder.productId} onChange={e => {
                    const pid = e.target.value;
                    const p = products.find(x => x.id === parseInt(pid));
                    const qty = parseFloat(newOrder.quantity) || 1;
                    const rate = p ? (p.costPrice || p.price || 0) : 0;
                    setNewOrder({
                      ...newOrder,
                      productId: pid,
                      total: newOrder.total === '' ? String(Math.round(qty * rate * 100) / 100) : newOrder.total,
                    });
                  }} style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}>
                    <option value="" disabled>Select Product...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {fmtQty(p.quantity)} {p.unit || ''}) - ₹{p.price}</option>)}
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
                        placeholder="e.g. 5"
                        value={newOrder.quantity}
                        onChange={e => {
                          const q = e.target.value;
                          const p = products.find(x => x.id === parseInt(newOrder.productId));
                          const rate = p ? (p.costPrice || p.price || 0) : 0;
                          setNewOrder({
                            ...newOrder,
                            quantity: q,
                            total: (!newOrder.total || newOrder.total === '') && q ? String(Math.round(parseFloat(q) * rate * 100) / 100) : newOrder.total,
                          });
                        }}
                        style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}
                      />
                    </label>
                  </div>
                  <div style={{ flex: 1.2 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>Total Amount from Bill (₹)
                      <input
                        required
                        type="number"
                        min="0"
                        step="any"
                        placeholder="e.g. 2000"
                        value={newOrder.total}
                        onChange={e => setNewOrder({...newOrder, total: e.target.value})}
                        style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc', fontWeight: 700, boxSizing: 'border-box' }}
                      />
                    </label>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: '#8A94A6' }}>
                  Tip: You can enter the exact bill total directly rather than relying on multiplied unit rates.
                </p>

                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <button type="submit" style={{ flex: 1, padding: 10, background: '#2ECC71', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Save Order</button>
                  <button type="button" onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 10, background: '#F4F5F7', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                </div>
              </form>
            </div>
          </div></Portal>
        )}

        {/* MODAL: Import */}
        {showImport && (
          <ImportOrdersModal
            onClose={() => setShowImport(false)}
            onDone={() => { fetchOrders(); fetchLedger(ledgerMonth); }}
            onSalesReport={(files) => { setShowImport(false); setHandoverFiles(files); setSection('bills'); }}
          />
        )}

        {/* MODAL: Edit */}
        {editing && (
          <Portal><div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 420, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontSize: 18, marginBottom: 16 }}>Edit TRX-{editing.id}</h2>
              <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: 12, color: '#8A94A6' }}>Type
                  <select required value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })} style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}>
                    <option value="SALE">STOCK OUT (used / consumed)</option>
                    <option value="PURCHASE">STOCK IN (purchased / received)</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#8A94A6' }}>Product
                  <select required value={editing.productId} onChange={e => setEditing({ ...editing, productId: e.target.value })} style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {fmtQty(p.quantity)}) - ₹{p.price}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#8A94A6' }}>Quantity
                  <input required type="number" min="0" step="any" value={editing.quantity} onChange={e => setEditing({ ...editing, quantity: e.target.value })} style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </label>
                <label style={{ fontSize: 12, color: '#8A94A6' }}>Total amount (₹)
                  <input required type="number" min="0" step="any" value={editing.total} onChange={e => setEditing({ ...editing, total: e.target.value })} style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </label>
                <label style={{ fontSize: 12, color: '#8A94A6' }}>Date
                  <input required type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, background: '#FAFBFC', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!editing.adjustStock} onChange={e => setEditing({ ...editing, adjustStock: !e.target.checked })} style={{ marginTop: 3 }} />
                  <span><b>Don't change stock</b><span style={{ display: 'block', color: '#8A94A6' }}>Only fix this order record. Product stock stays as it is.</span></span>
                </label>
                {editErr && <p style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 13, padding: '10px 12px', borderRadius: 10 }}>{editErr}</p>}
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button type="submit" disabled={busy} style={{ flex: 1, padding: 10, background: '#2ECC71', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving...' : 'Save changes'}</button>
                  <button type="button" onClick={() => setEditing(null)} style={{ flex: 1, padding: 10, background: '#F4F5F7', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                </div>
              </form>
            </div>
          </div></Portal>
        )}

        {/* MODAL: Confirm Delete */}
        {delIds && (
          <Portal><div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontSize: 18, marginBottom: 8 }}>Delete {delIds.length} order{delIds.length > 1 ? 's' : ''}?</h2>
              <p style={{ fontSize: 13, color: '#8A94A6', marginBottom: 14 }}>This cannot be undone.</p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, background: '#FAFBFC', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={revertStock} onChange={e => setRevertStock(e.target.checked)} style={{ marginTop: 3 }} />
                <span><b>Also reverse the stock change</b><span style={{ display: 'block', color: '#8A94A6' }}>Leave unticked to keep inventory exactly as it is (only the order entry is removed).</span></span>
              </label>
              {delErr && <p style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 13, padding: '10px 12px', borderRadius: 10, marginBottom: 12 }}>{delErr}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={confirmDelete} disabled={busy} style={{ flex: 1, padding: 10, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', opacity: busy ? 0.6 : 1 }}>{busy ? 'Deleting...' : 'Delete'}</button>
                <button onClick={() => setDelIds(null)} style={{ flex: 1, padding: 10, background: '#F4F5F7', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              </div>
            </div>
          </div></Portal>
        )}
      </div>

      <OrderDrawer order={selected} onClose={() => setSelected(null)} onEdit={openEdit} onDelete={askDelete} isAdmin={isAdmin} />
    </div>
  );
}
