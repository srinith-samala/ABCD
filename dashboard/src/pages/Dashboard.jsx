import React, { useState, useEffect } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import SalesAnalytics from '../components/SalesAnalytics';
import TopSalesByCountry from '../components/TopSalesByCountry';
import LastActivity from '../components/LastActivity';
import ProductSales from '../components/ProductSales';
import TotalCustomers from '../components/TotalCustomers';
import TotalRevenue from '../components/TotalRevenue';
import TotalOrders from '../components/TotalOrders';

const KpiCard = ({ label, value, change, color = '#0F1B2D', bg = '#fff', icon }) => (
  <div className="card" style={{ flex: 1, minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
      <p style={{ fontSize: 12, color: '#8A94A6', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <span style={{ fontSize: 20 }}>{icon}</span>
    </div>
    <p style={{ fontSize: 26, fontWeight: 700, color: '#0F1B2D', lineHeight: 1 }}>{value}</p>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
      {change && (
        <>
          <span style={{
            padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: color === '#F59E0B' ? '#FEF3C7' : '#D6F5E3',
            color: color === '#F59E0B' ? '#92400E' : '#16A34A',
          }}> {change}</span>
          <span style={{ fontSize: 11, color: '#8A94A6' }}>vs last month</span>
        </>
      )}
    </div>
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalSales: 0,
    totalPurchases: 0,
    totalExpenses: 0,
    profit: 0,
    closingStockValue: 0
  });

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

      <Header title="Dashboard" subtitle={`Good morning, ${localStorage.getItem('name') || 'Admin'} 👋`} />

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {/* KPI Row */}
        <div style={{ display: 'flex', gap: 18, marginBottom: 24 }}>
          <KpiCard label="Closing Stock Value" value={`₹${stats.closingStockValue.toLocaleString()}`} icon="📦" />
          <KpiCard label="Total Expenses" value={`₹${stats.totalExpenses.toLocaleString()}`} color="#F59E0B" icon="⚠️" />
          <KpiCard label="Total Sales" value={`₹${stats.totalSales.toLocaleString()}`} icon="🛒" />
          <KpiCard label="Total Profit" value={`₹${stats.profit.toLocaleString()}`} icon="💰" />
        </div>

        {/* Charts Row */}
        <div style={{ display: 'flex', gap: 18, marginBottom: 24 }}>
          <div style={{ flex: '6 1 0%', minWidth: 0 }}>
            <SalesAnalytics />
          </div>
          <div style={{ flex: '4 1 0%', minWidth: 0 }}>
            <TopSalesByCountry />
          </div>
        </div>

        {/* Two-column: center content + right panel */}
        <div style={{ display: 'flex', gap: 18 }}>
          {/* Center */}
          <div style={{ flex: '6 1 0%', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <LastActivity />
            <ProductSales />
          </div>

          {/* Right stats */}
          <div style={{ flex: '4 1 0%', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <TotalCustomers />
            <TotalRevenue />
            <TotalOrders />
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
