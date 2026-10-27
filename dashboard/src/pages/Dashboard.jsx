import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmtQty } from '../utils';
import { getRelevantEmoji } from '../emojiMap';
import MonthPicker from '../components/MonthPicker';
import { downloadStatistics } from '../components/downloadExport';

const KpiCard = ({ label, value, sub, valueColor = '#0F1B2D', icon, bg }) => (
  <div className="card" style={{ flex: '1 1 200px', minWidth: 0, background: bg || '#fff' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
      <p style={{ fontSize: 11, color: '#8A94A6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <span style={{ fontSize: 20 }}>{icon}</span>
    </div>
    <p style={{ fontSize: 24, fontWeight: 800, color: valueColor, lineHeight: 1.1 }}>{value}</p>
    {sub && <p style={{ fontSize: 11, color: '#8A94A6', marginTop: 4 }}>{sub}</p>}
  </div>
);

const isAdmin = () => localStorage.getItem('role') === 'ADMIN';
const inr = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const inr0 = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const signedInr = (n) => `${Number(n) < 0 ? '-' : ''}${inr(n)}`;

const EmptyState = ({ text }) => (
  <p style={{ fontSize: 13, color: '#8A94A6', textAlign: 'center', padding: '28px 0' }}>{text}</p>
);

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalSales: 0,
    totalInventory: 0,
    totalPurchases: 0,
    grossProfit: 0,
    grossMargin: 0,
    salaryCost: 0,
    otherExpenses: 0,
    totalExpenses: 0,
    profit: 0,
    closingStockValue: 0,
    months: [],
    monthly: [],
    byDay: [],
  });
  const [month, setMonth] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [chartView, setChartView] = useState('daily'); // 'daily' | 'monthly'

  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
    fetch(`${API}/api/stock`, { headers }).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) && setProducts(d)).catch(console.error);
    fetch(`${API}/api/transactions`, { headers }).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) && setTransactions(d)).catch(console.error);
  }, []);

  const recent = [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  const lowStock = products.filter(p => p.quantity <= (p.reorderLevel ?? 10)).sort((a, b) => a.quantity - b.quantity).slice(0, 8);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API}/api/reports/dashboard${month ? `?month=${month}` : ''}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (res.ok) {
          setStats(data);
          if (!month) setMonth(data.month || 'all');
        }
      } catch (err) {
        console.error("Failed to load dashboard stats", err);
      }
    };
    fetchStats();
  }, [month]);

  const doExport = async () => {
    setExporting(true);
    try { await downloadStatistics(month); } catch (err) { console.error(err); alert(err.message || 'Export failed'); } finally { setExporting(false); }
  };

  const dailyChartData = (stats.byDay || []).map(d => ({
    day: d.date.slice(8, 10) + '/' + d.date.slice(5, 7),
    fullDate: d.date,
    Sales: d.sales,
    Inventory: d.inventory,
    Profit: d.profit,
  }));

  const overheadsTotal = (stats.salaryCost || 0) + (stats.otherExpenses || 0);

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="pulse-bar" style={{
        height: 3, background: 'linear-gradient(90deg, #2ECC71, #27AE60, #2ECC71)',
        flexShrink: 0,
      }} />

      <Header title="Dashboard" subtitle={`Welcome back, ${localStorage.getItem('name') || 'Admin'} 👋`} />

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {isAdmin() && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <MonthPicker months={stats.months || []} value={month} onChange={setMonth} />
            <p style={{ fontSize: 12, color: '#8A94A6' }}>Showing <b>{stats.label || '—'}</b> · Live sales, inventory costs &amp; profits</p>
          </div>
        )}

        {/* Primary KPI Row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          {isAdmin() && (
            <KpiCard
              label="Total Sales"
              value={inr(stats.totalSales)}
              sub="from daily sales / POS bills"
              valueColor="#16A34A"
              icon="🛒"
            />
          )}
          {isAdmin() && (
            <KpiCard
              label={stats.openingStock > 0 ? (stats.isReconciled ? "Inventory Consumed (COGS)" : "Total Inventory Available") : "Inventory Purchases"}
              value={inr(stats.isReconciled ? stats.inventoryConsumed : (stats.totalStockAvailable || (stats.openingStock ? (stats.openingStock + stats.totalPurchases) : stats.totalPurchases)))}
              sub={
                stats.isReconciled
                  ? `Available ${inr0(stats.totalStockAvailable)} − Closing ${inr0(stats.closingStock)}`
                  : stats.openingStock > 0
                    ? `${inr0(stats.openingStock)} opening + ${inr0(stats.totalPurchases)} purchases`
                    : "stock bought in bills"
              }
              valueColor="#F59E0B"
              icon="📦"
            />
          )}
          {isAdmin() && (
            <KpiCard
              label="Gross Profit"
              value={signedInr(stats.grossProfit ?? (stats.totalSales - (stats.totalInventory || 0)))}
              sub={`${(stats.grossMargin || 0).toFixed(1)}% margin (Sales - Inventory)`}
              valueColor={stats.grossProfit >= 0 ? '#16A34A' : '#EF4444'}
              bg="#F8FFF9"
              icon="📈"
            />
          )}
          {isAdmin() && (
            <KpiCard
              label="Salaries & Overhead"
              value={inr(overheadsTotal)}
              sub={`${inr0(stats.salaryCost)} payroll + ${inr0(stats.otherExpenses)} misc`}
              valueColor="#6C63FF"
              icon="🧾"
            />
          )}
          {isAdmin() && (
            <KpiCard
              label={stats.profit < 0 ? 'Net Loss' : 'Net Profit'}
              value={signedInr(stats.profit)}
              sub={`${(stats.margin || 0).toFixed(1)}% net margin after all costs`}
              valueColor={stats.profit < 0 ? '#EF4444' : '#16A34A'}
              bg={stats.profit >= 0 ? '#F0FBF4' : '#FEE2E2'}
              icon="💰"
            />
          )}
        </div>

        {/* Charts: Toggle Daily Trend vs Last 6 Months */}
        {isAdmin() && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>
                  {chartView === 'daily' ? `Daily Sales vs Inventory vs Profit (${stats.label || 'Active Period'})` : 'Monthly Sales vs Costs vs Profit (last 6 months)'}
                </h3>
                <p style={{ fontSize: 12, color: '#8A94A6', marginTop: 2 }}>
                  {chartView === 'daily'
                    ? 'Day-by-day comparison: each day\'s sales minus inventory purchased = daily profit'
                    : 'Month-by-month financial trajectory'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 4, background: '#F4F5F7', borderRadius: 8, padding: 3 }}>
                <button
                  onClick={() => setChartView('daily')}
                  style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: chartView === 'daily' ? '#fff' : 'transparent', color: chartView === 'daily' ? '#0F1B2D' : '#8A94A6',
                    boxShadow: chartView === 'daily' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  📅 Daily Trend
                </button>
                <button
                  onClick={() => setChartView('monthly')}
                  style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: chartView === 'monthly' ? '#fff' : 'transparent', color: chartView === 'monthly' ? '#0F1B2D' : '#8A94A6',
                    boxShadow: chartView === 'monthly' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  📊 6 Months
                </button>
              </div>
            </div>

            {chartView === 'daily' ? (
              dailyChartData.length > 0 ? (
                <div style={{ width: '100%', height: 270 }}>
                  <ResponsiveContainer>
                    <BarChart data={dailyChartData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EAED" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8A94A6' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8A94A6' }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v) => `${v < 0 ? '-' : ''}${inr(v)}`} />
                      <Legend />
                      <Bar dataKey="Sales" fill="#2ECC71" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Inventory" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Profit" fill="#0F1B2D" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState text="No daily sales or inventory recorded for this month yet. Upload daily sales bills or inventory orders to see the daily chart!" />
              )
            ) : (
              (stats.monthly || []).length > 0 ? (
                <div style={{ width: '100%', height: 270 }}>
                  <ResponsiveContainer>
                    <BarChart data={(stats.monthly || []).map(m => ({ month: m.label, Sales: m.sales, Inventory: m.inventory || 0, Costs: m.expenses, Profit: m.profit }))} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EAED" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8A94A6' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8A94A6' }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v) => `${v < 0 ? '-' : ''}${inr(v)}`} />
                      <Legend />
                      <Bar dataKey="Sales" fill="#2ECC71" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Inventory" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Profit" fill="#0F1B2D" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState text="No sales or expenses recorded yet." />
              )
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Recent activity */}
          <div className="card" style={{ flex: '1 1 340px', minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent stock transactions</h3>
            {recent.length === 0 && <EmptyState text="No transactions yet." />}
            {recent.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid #E8EAED', fontSize: 13 }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{t.product?.name || 'Product'} <span style={{ color: '#8A94A6', fontWeight: 400 }}>× {fmtQty(t.quantity)} {t.product?.unit || ''}</span></p>
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
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Low stock alert</h3>
              {lowStock.length === 0 && <EmptyState text={products.length === 0 ? 'No products added yet.' : 'All products are well stocked.'} />}
              {lowStock.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid #E8EAED', fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{getRelevantEmoji(p.name, p.category, p.emoji)} {p.name}</span>
                  <span style={{ fontWeight: 700, color: p.quantity === 0 ? '#EF4444' : '#F59E0B' }}>{fmtQty(p.quantity)} {p.unit || ''}</span>
                </div>
              ))}
            </div>
            {isAdmin() && <button 
              onClick={doExport}
              disabled={exporting}
              style={{
              width: '100%', padding: '13px 0', borderRadius: 12,
              background: '#0F1B2D', color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: 'DM Sans', transition: 'opacity 0.2s', opacity: exporting ? 0.7 : 1,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 11h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              {exporting ? 'Preparing Excel report...' : 'Export statistics (Excel with charts)'}
            </button>}
          </div>
        </div>
      </div>
    </div>
  );
}
