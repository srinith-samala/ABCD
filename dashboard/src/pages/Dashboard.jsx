import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const KpiCard = ({ label, value, valueColor = '#0F1B2D', icon }) => (
  <div className="card" style={{ flex: 1, minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
      <p style={{ fontSize: 12, color: '#8A94A6', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <span style={{ fontSize: 20 }}>{icon}</span>
    </div>
    <p style={{ fontSize: 26, fontWeight: 700, color: valueColor, lineHeight: 1 }}>{value}</p>
  </div>
);

const inr = (n) => `₹${Math.abs(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const EmptyState = ({ text }) => (
  <p style={{ fontSize: 13, color: '#8A94A6', textAlign: 'center', padding: '28px 0' }}>{text}</p>
);

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalSales: 0,
    totalPurchases: 0,
    totalExpenses: 0,
    profit: 0,
    closingStockValue: 0
  });

  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
    fetch(`${API}/api/stock`, { headers }).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) && setProducts(d)).catch(console.error);
    fetch(`${API}/api/transactions`, { headers }).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) && setTransactions(d)).catch(console.error);
  }, []);

  const monthly = React.useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleString('en-US', { month: 'short' }), Sales: 0, Purchases: 0 });
    }
    transactions.forEach(t => {
      const d = new Date(t.createdAt);
      const row = out.find(r => r.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (!row) return;
      if (t.type === 'SALE') row.Sales += t.total;
      if (t.type === 'PURCHASE') row.Purchases += t.total;
    });
    return out;
  }, [transactions]);

  const hasChartData = monthly.some(m => m.Sales > 0 || m.Purchases > 0);
  const recent = [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  const lowStock = products.filter(p => p.quantity <= (p.reorderLevel ?? 10)).sort((a, b) => a.quantity - b.quantity).slice(0, 8);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API}/api/reports/dashboard`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (res.ok) {
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to load dashboard stats", err);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Live pulse bar */}
      <div className="pulse-bar" style={{
        height: 3, background: 'linear-gradient(90deg, #2ECC71, #27AE60, #2ECC71)',
        flexShrink: 0,
      }} />

      <Header title="Dashboard" subtitle={`Welcome back, ${localStorage.getItem('name') || 'Admin'} 👋`} />

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {/* KPI Row */}
        <div style={{ display: 'flex', gap: 18, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard label="Closing Stock Value" value={inr(stats.closingStockValue)} icon="📦" />
          <KpiCard label="Total Expenses" value={inr(stats.totalExpenses)} valueColor="#F59E0B" icon="🧾" />
          <KpiCard label="Total Sales" value={inr(stats.totalSales)} icon="🛒" />
          <KpiCard
            label={stats.profit < 0 ? 'Total Loss' : 'Total Profit'}
            value={`${stats.profit < 0 ? '-' : ''}${inr(stats.profit)}`}
            valueColor={stats.profit < 0 ? '#EF4444' : '#16A34A'}
            icon="💰"
          />
        </div>

        {/* Sales vs Purchases */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Sales vs Purchases (last 6 months)</h3>
          {hasChartData ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={monthly} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EAED" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8A94A6' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8A94A6' }} />
                  <Tooltip formatter={(v) => inr(v)} />
                  <Legend />
                  <Bar dataKey="Sales" fill="#2ECC71" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Purchases" fill="#0F1B2D" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState text="No sales or purchases recorded yet." />
          )}
        </div>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Recent activity */}
          <div className="card" style={{ flex: '1 1 340px', minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent activity</h3>
            {recent.length === 0 && <EmptyState text="No transactions yet." />}
            {recent.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid #E8EAED', fontSize: 13 }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{t.product?.name || 'Product'} <span style={{ color: '#8A94A6', fontWeight: 400 }}>× {t.quantity}</span></p>
                  <p style={{ fontSize: 11, color: '#8A94A6', marginTop: 2 }}>{new Date(t.createdAt).toLocaleString()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 700, color: t.type === 'SALE' ? '#16A34A' : '#0F1B2D' }}>{t.type === 'SALE' ? '+' : '-'}{inr(t.total)}</p>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 6, background: t.type === 'SALE' ? '#D6F5E3' : '#EEF0FF', color: t.type === 'SALE' ? '#16A34A' : '#6C63FF' }}>{t.type}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Right column: low stock + export */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Low stock</h3>
              {lowStock.length === 0 && <EmptyState text={products.length === 0 ? 'No products added yet.' : 'All products are well stocked.'} />}
              {lowStock.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid #E8EAED', fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{p.emoji} {p.name}</span>
                  <span style={{ fontWeight: 700, color: p.quantity === 0 ? '#EF4444' : '#F59E0B' }}>{p.quantity} {p.unit || ''}</span>
                </div>
              ))}
            </div>
            <button 
              onClick={async () => {
                try {
                  const res = await fetch(`${API}/api/reports/export`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                  });
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'Detailed_Statistics.xlsx';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                } catch (err) {
                  console.error(err);
                  alert('Export failed');
                }
              }}
              style={{
              width: '100%', padding: '13px 0', borderRadius: 12,
              background: '#0F1B2D', color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: 'DM Sans', transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 11h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Export statistics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
