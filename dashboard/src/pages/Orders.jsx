import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';

const statusStyle = {
  SALE: { bg: '#D6F5E3', color: '#16A34A' },
  PURCHASE: { bg: '#EEF0FF', color: '#6C63FF' },
};

const allTabs = ['All', 'SALE', 'PURCHASE'];

const timeline = ['Ordered', 'Dispatched', 'Delivered'];

function OrderDrawer({ order, onClose }) {
  if (!order) return null;
  const step = 2; // Default to delivered for now
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div id="printable-invoice" style={{ width: 460, height: '100vh', background: '#fff', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>TRX-{order.id}</h2>
            <p style={{ color: '#8A94A6', fontSize: 13 }}>{new Date(order.createdAt).toLocaleDateString()}</p>
          </div>
          <button className="no-print" onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Status timeline */}
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

        {/* Items */}
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
              <td style={{ textAlign: 'right', color: '#8A94A6' }}>{order.quantity}</td>
              <td style={{ textAlign: 'right', color: '#8A94A6' }}>₹{order.product?.price || 0}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{order.total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: '2px solid #E8EAED' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Total Amount</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#2ECC71' }}>₹{order.total.toLocaleString()}</span>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }} onClick={() => alert('Editing requires backend implementation')}>Edit Order</button>
          <button onClick={() => window.print()} style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#F4F5F7', color: '#0F1B2D', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }}>Print Invoice</button>
        </div>
      </div>
    </div>
  );
}

export default function Orders() {
  const [tab, setTab] = useState('All');
  const [selected, setSelected] = useState(null);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await fetch(`${API}/api/transactions`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (res.ok) setOrders(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchOrders();
  }, []);

  const counts = { SALE: 0, PURCHASE: 0 };
  orders.forEach(o => counts[o.type]++);

  const filtered = tab === 'All' ? orders : orders.filter(o => o.type === tab);

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API}/api/transactions`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (res.ok) setOrders(data);
    } catch (err) {
      console.error(err);
    }
  };

  const [showAdd, setShowAdd] = useState(false);
  const [products, setProducts] = useState([]);
  const [newOrder, setNewOrder] = useState({ type: 'SALE', productId: '', quantity: '' });

  useEffect(() => {
    fetch(`${API}/api/stock`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(setProducts).catch(console.error);
  }, []);

  const handleAddOrder = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ type: newOrder.type, productId: parseInt(newOrder.productId), quantity: parseInt(newOrder.quantity) })
      });
      if (res.ok) {
        setShowAdd(false);
        fetchOrders();
      } else {
        const data = await res.json();
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Transactions" subtitle="Track and manage all sales and purchases" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {/* Stat chips */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 24, justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 14 }}>
            {[
              { label: 'Sales', value: counts.SALE, bg: '#D6F5E3', color: '#16A34A' },
              { label: 'Purchases', value: counts.PURCHASE, bg: '#EEF0FF', color: '#6C63FF' },
            ].map(({ label, value, bg, color }) => (
              <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <span style={{ padding: '4px 10px', borderRadius: 20, background: bg, color, fontSize: 13, fontWeight: 700 }}>{value}</span>
                <span style={{ fontSize: 13, color: '#8A94A6' }}>{label}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Order</button>
        </div>

        {showAdd && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 400, background: '#fff', borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontSize: 18, marginBottom: 16 }}>New Order</h2>
              <form onSubmit={handleAddOrder} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <select required value={newOrder.type} onChange={e => setNewOrder({...newOrder, type: e.target.value})} style={{ padding: 10, borderRadius: 8, border: '1px solid #ccc' }}>
                  <option value="SALE">SALE (Stock Out)</option>
                  <option value="PURCHASE">PURCHASE (Stock In)</option>
                </select>
                <select required value={newOrder.productId} onChange={e => setNewOrder({...newOrder, productId: e.target.value})} style={{ padding: 10, borderRadius: 8, border: '1px solid #ccc' }}>
                  <option value="" disabled>Select Product...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.quantity}) - ₹{p.price}</option>)}
                </select>
                <input required type="number" placeholder="Quantity" value={newOrder.quantity} onChange={e => setNewOrder({...newOrder, quantity: e.target.value})} style={{ padding: 10, borderRadius: 8, border: '1px solid #ccc' }} />
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <button type="submit" style={{ flex: 1, padding: 10, background: '#2ECC71', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                  <button type="button" onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 10, background: '#F4F5F7', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                </div>
              </form>
            </div>
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
            }}>{t}</button>
          ))}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FAFBFC' }}>
                  {['TRX ID', 'Date', 'Type', 'Product', 'Qty', 'Total Amount', 'Action'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #E8EAED' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <tr key={order.id} style={{ cursor: 'pointer', borderBottom: '1px solid #F4F5F7' }} onClick={() => setSelected(order)}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#6C63FF' }}>TRX-{order.id}</td>
                    <td style={{ padding: '12px 16px', color: '#8A94A6' }}>{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge" style={{ background: statusStyle[order.type]?.bg, color: statusStyle[order.type]?.color }}>{order.type}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{order.product?.name || 'Unknown'}</td>
                    <td style={{ padding: '12px 16px', color: '#8A94A6' }}>{order.quantity}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 700 }}>₹{order.total.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <button style={{ padding: '5px 12px', borderRadius: 6, background: '#F4F5F7', color: '#0F1B2D', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); setSelected(order); }}>View</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#8A94A6' }}>No transactions found. Add some stock purchases or sales.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <OrderDrawer order={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
