import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart, Cell,
} from 'recharts';

export default function Reports() {
  const [tab, setTab] = useState('Sales Analytics');
  const tabs = ['Sales Analytics', 'Stock Movement'];
  const [transactions, setTransactions] = useState([]);
  
  useEffect(() => {
    fetch(`${API}/api/transactions`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(r => r.json())
    .then(setTransactions)
    .catch(console.error);
  }, []);

  // Compute Monthly Revenue (Lakhs)
  const monthlyRevenueObj = {};
  transactions.filter(t => t.type === 'SALE').forEach(t => {
    const m = new Date(t.createdAt).toLocaleString('default', { month: 'short' });
    monthlyRevenueObj[m] = (monthlyRevenueObj[m] || 0) + (t.total / 100000); // in Lakhs
  });
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlyRevenue = months.map(m => ({ m, v: Number((monthlyRevenueObj[m] || 0).toFixed(2)) }));

  // Compute Top Products
  const prodSalesObj = {};
  transactions.filter(t => t.type === 'SALE').forEach(t => {
    const name = t.product?.name || 'Unknown';
    prodSalesObj[name] = (prodSalesObj[name] || 0) + t.quantity;
  });
  const topProducts = Object.keys(prodSalesObj)
    .map(name => ({ name, sales: prodSalesObj[name] }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);
    
  // Compute Total Revenue
  const totalRev = transactions.filter(t => t.type === 'SALE').reduce((sum, t) => sum + t.total, 0);

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Reports" subtitle="Insights into sales and stock movement" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 2, background: '#F4F5F7', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 24 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#0F1B2D' : '#8A94A6',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>{t}</button>
          ))}
        </div>

        {tab === 'Sales Analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Monthly Revenue (₹ Lakhs)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monthlyRevenue}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2ECC71" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2ECC71" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#F4F5F7" />
                  <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8A94A6' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8A94A6' }} tickFormatter={v => `₹${v}L`} />
                  <Tooltip formatter={v => [`₹${v}L`, 'Revenue']} contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: 'DM Sans' }} />
                  <Area type="monotone" dataKey="v" stroke="#2ECC71" strokeWidth={2.5} fill="url(#revGrad)" dot={{ fill: '#2ECC71', r: 4 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', gap: 20 }}>
              <div className="card" style={{ flex: 2 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Top Selling Products</h3>
                {topProducts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={topProducts} layout="vertical" barSize={18}>
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8A94A6' }} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#0F1B2D' }} width={120} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: 'DM Sans' }} />
                      <Bar dataKey="sales" radius={[0, 6, 6, 0]} fill="#2ECC71" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p style={{ color: '#8A94A6', fontSize: 13 }}>No sales data available yet.</p>
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Total Revenue', value: `₹${totalRev.toLocaleString()}` },
                  { label: 'Total Sales', value: transactions.filter(t=>t.type==='SALE').length },
                ].map(({ label, value }) => (
                  <div key={label} className="card" style={{ padding: 20 }}>
                    <p style={{ fontSize: 12, color: '#8A94A6', marginBottom: 8, textTransform: 'uppercase', fontWeight: 500 }}>{label}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#2ECC71' }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'Stock Movement' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr style={{ background: '#FAFBFC' }}>
                  {['Date', 'Product', 'Type', 'Qty', 'Total Value', 'Updated By'].map(h => (
                    <th key={h} style={{ padding: '12px 16px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '12px 16px', color: '#8A94A6' }}>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.product?.name || 'Unknown'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge" style={{ background: r.type === 'PURCHASE' ? '#D6F5E3' : '#FEE2E2', color: r.type === 'PURCHASE' ? '#16A34A' : '#EF4444' }}>{r.type}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: r.type === 'PURCHASE' ? '#2ECC71' : '#EF4444' }}>{r.type === 'PURCHASE' ? '+' : '-'}{r.quantity}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#6C63FF', fontWeight: 600 }}>₹{r.total}</td>
                    <td style={{ padding: '12px 16px', color: '#8A94A6' }}>User ID: {r.userId}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#8A94A6' }}>No transactions recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
