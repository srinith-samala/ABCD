import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import MonthPicker from '../components/MonthPicker';
import { downloadStatistics } from '../components/downloadExport';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#2ECC71', '#0F1B2D', '#F59E0B', '#6C63FF', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];
const CHANNEL_COLORS = { Cash: '#10B981', Card: '#3B82F6', UPI: '#8B5CF6', Zomato: '#EF4444' };

const money = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const signedMoney = (n) => `${Number(n) < 0 ? '-' : '+'}${money(n)}`;

export default function Reports() {
  const [tab, setTab] = useState('sales'); // 'sales' | 'expenses' | 'inventory' | 'pnl'
  const [month, setMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Data states
  const [pnl, setPnl] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('ALL');

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
  }), []);

  const loadReportData = useCallback(async (selectedMonth) => {
    setLoading(true);
    setError('');
    try {
      const q = selectedMonth && selectedMonth !== 'all' ? `?month=${encodeURIComponent(selectedMonth)}` : '';
      
      const [pnlRes, dashRes, txRes] = await Promise.all([
        fetch(`${API}/api/accounts/pnl${q}`, { headers: authHeaders() }).catch(() => null),
        fetch(`${API}/api/reports/dashboard${q}`, { headers: authHeaders() }).catch(() => null),
        fetch(`${API}/api/transactions`, { headers: authHeaders() }).catch(() => null),
      ]);

      if (pnlRes && pnlRes.ok) {
        const pnlData = await pnlRes.json();
        setPnl(pnlData);
        if (!selectedMonth && pnlData.month) {
          setMonth(pnlData.month);
        }
      }

      if (dashRes && dashRes.ok) {
        const dashData = await dashRes.json();
        setDashboardStats(dashData);
      }

      if (txRes && txRes.ok) {
        const txData = await txRes.json();
        setTransactions(Array.isArray(txData) ? txData : []);
      }
    } catch (err) {
      console.error('Error fetching reports data:', err);
      setError('Unable to load reports. Please check server connection.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadReportData(month);
  }, [month, loadReportData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadStatistics(month);
    } catch (err) {
      console.error('Export error:', err);
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Safe KPI calculations
  const totalSales = pnl?.sales?.total ?? dashboardStats?.totalSales ?? 0;
  const grossProfit = pnl?.grossProfit ?? dashboardStats?.grossProfit ?? 0;
  const grossMargin = pnl?.grossMargin ?? dashboardStats?.grossMargin ?? 0;
  const totalExpenses = pnl?.totalExpenses ?? dashboardStats?.totalExpenses ?? 0;
  const netProfit = pnl?.netProfit ?? dashboardStats?.profit ?? 0;
  const margin = pnl?.margin ?? dashboardStats?.margin ?? 0;
  const isProfit = netProfit >= 0;

  // Channel breakdown
  const channelData = useMemo(() => {
    if (!pnl?.sales) return [];
    return [
      { name: 'Cash', value: pnl.sales.cash || 0, color: CHANNEL_COLORS.Cash },
      { name: 'Card', value: pnl.sales.card || 0, color: CHANNEL_COLORS.Card },
      { name: 'UPI', value: pnl.sales.upi || 0, color: CHANNEL_COLORS.UPI },
      { name: 'Zomato', value: pnl.sales.zomato || 0, color: CHANNEL_COLORS.Zomato },
    ].filter(c => c.value > 0);
  }, [pnl]);

  // Monthly trend series
  const monthlyTrend = useMemo(() => {
    if (dashboardStats?.monthly?.length) {
      return dashboardStats.monthly.map(m => ({
        label: m.label,
        Sales: m.sales,
        Costs: m.expenses,
        Profit: m.profit,
      }));
    }
    if (pnl?.series?.length) {
      return pnl.series.map(m => ({
        label: m.label,
        Sales: m.sales,
        Costs: m.expenses,
        Profit: m.profit,
      }));
    }
    return [];
  }, [dashboardStats, pnl]);

  // Daily sales series
  const dailySeries = useMemo(() => {
    const list = pnl?.byDay || dashboardStats?.byDay || [];
    return list.map(d => ({
      date: d.date?.slice(5) || d.date,
      fullDate: d.date,
      sales: d.sales || d.total || 0,
      inventory: d.inventory || 0,
      profit: d.profit || 0,
    }));
  }, [pnl, dashboardStats]);

  // Filtered transactions for stock movement tab
  const filteredTransactions = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return (transactions || []).filter(t => {
      if (txTypeFilter !== 'ALL' && t.type !== txTypeFilter) return false;
      if (q) {
        const pName = t.product?.name || '';
        const note = t.note || '';
        if (!pName.toLowerCase().includes(q) && !note.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [transactions, txTypeFilter, txSearch]);

  const availableMonths = pnl?.months || dashboardStats?.months || [];

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Analytics & Reports" subtitle="Complete operational reports across sales, inventory, expenses and financial statements" />
      
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        
        {/* Controls Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <MonthPicker
              months={availableMonths}
              value={month}
              onChange={(m) => setMonth(m)}
            />
            <button
              onClick={() => loadReportData(month)}
              style={{
                background: '#fff', border: '1px solid #E8EAED', borderRadius: 10,
                padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                color: '#5B6577',
              }}
            >
              🔄 Refresh
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              padding: '9px 20px', borderRadius: 10, background: '#0F1B2D',
              color: '#fff', border: 'none', fontSize: 13, fontWeight: 600,
              cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {exporting ? 'Generating Excel...' : '⬇ Download Full Excel Report'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Top KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 22 }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 11, color: '#8A94A6', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>Total Sales Revenue</p>
              <span style={{ fontSize: 20 }}>🛒</span>
            </div>
            <p style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', margin: '4px 0 2px' }}>{money(totalSales)}</p>
            <p style={{ fontSize: 11, color: '#8A94A6', margin: 0 }}>
              {channelData.length > 0 ? channelData.map(c => `${c.name}: ${money(c.value)}`).join(' · ') : 'Net of discounts & taxes'}
            </p>
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 11, color: '#8A94A6', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>Gross Profit</p>
              <span style={{ fontSize: 20 }}>📦</span>
            </div>
            <p style={{ fontSize: 26, fontWeight: 800, color: grossProfit >= 0 ? '#16A34A' : '#EF4444', margin: '4px 0 2px' }}>
              {signedMoney(grossProfit)}
            </p>
            <p style={{ fontSize: 11, color: '#8A94A6', margin: 0 }}>
              {grossMargin.toFixed(1)}% gross margin (Sales − Inventory consumed)
            </p>
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 11, color: '#8A94A6', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>Total Operating Costs</p>
              <span style={{ fontSize: 20 }}>🧾</span>
            </div>
            <p style={{ fontSize: 26, fontWeight: 800, color: '#0F1B2D', margin: '4px 0 2px' }}>{money(totalExpenses)}</p>
            <p style={{ fontSize: 11, color: '#8A94A6', margin: 0 }}>
              Food, Salaries, Rent & Overheads
            </p>
          </div>

          <div className="card" style={{
            padding: '16px 20px',
            background: isProfit ? '#F0FDF4' : '#FEF2F2',
            borderLeft: `5px solid ${isProfit ? '#16A34A' : '#EF4444'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 11, color: '#8A94A6', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>Net Profit / Loss</p>
              <span style={{ fontSize: 20 }}>{isProfit ? '📈' : '📉'}</span>
            </div>
            <p style={{ fontSize: 26, fontWeight: 800, color: isProfit ? '#16A34A' : '#EF4444', margin: '4px 0 2px' }}>
              {signedMoney(netProfit)}
            </p>
            <p style={{ fontSize: 11, color: '#5B6577', margin: 0 }}>
              {totalSales > 0 ? `${margin.toFixed(1)}% net profit margin` : 'No revenue recorded'}
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: 4, background: '#F4F5F7', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 20 }}>
          {[
            { id: 'sales', label: '📊 Sales & Revenue' },
            { id: 'expenses', label: '💸 Expenses & Overheads' },
            { id: 'inventory', label: '📦 Stock Movement' },
            { id: 'pnl', label: '📈 P&L Statement' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                background: tab === t.id ? '#fff' : 'transparent',
                color: tab === t.id ? '#0F1B2D' : '#8A94A6',
                boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* --- TAB 1: SALES & REVENUE --- */}
        {tab === 'sales' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Chart: Sales Trends */}
            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Sales & Revenue Trends</h3>
              {dailySeries.length > 0 ? (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <AreaChart data={dailySeries}>
                      <defs>
                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2ECC71" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#2ECC71" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EAED" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8A94A6' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8A94A6' }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Area type="monotone" dataKey="sales" name="Sales Revenue" stroke="#2ECC71" strokeWidth={2.5} fill="url(#salesGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p style={{ color: '#8A94A6', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>No daily sales recorded for this period.</p>
              )}
            </div>

            {/* Channels & Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              <div className="card">
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Revenue by Payment Channel</h3>
                {channelData.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ width: 180, height: 180 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={channelData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                            {channelData.map(c => <Cell key={c.name} fill={c.color} />)}
                          </Pie>
                          <Tooltip formatter={(v) => money(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {channelData.map(c => {
                        const pct = totalSales > 0 ? ((c.value / totalSales) * 100).toFixed(1) : 0;
                        return (
                          <div key={c.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
                                {c.name}
                              </span>
                              <span style={{ fontWeight: 700 }}>{money(c.value)} <span style={{ color: '#8A94A6', fontWeight: 500, fontSize: 11 }}>({pct}%)</span></span>
                            </div>
                            <div style={{ height: 6, background: '#F4F5F7', borderRadius: 3 }}>
                              <div style={{ height: 6, borderRadius: 3, background: c.color, width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#8A94A6', fontSize: 13, padding: '20px 0' }}>No channel split data available.</p>
                )}
              </div>

              {/* Day-by-Day Summary */}
              <div className="card" style={{ maxHeight: 300, overflowY: 'auto', padding: 0 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, padding: '14px 16px', borderBottom: '1px solid #E8EAED', margin: 0 }}>
                  Daily Sales Breakdown ({dailySeries.length} Days)
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead style={{ background: '#FAFBFC', position: 'sticky', top: 0 }}>
                    <tr style={{ textAlign: 'left', color: '#8A94A6', fontSize: 11, textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 14px' }}>Date</th>
                      <th style={{ padding: '8px 14px', textAlign: 'right' }}>Revenue</th>
                      <th style={{ padding: '8px 14px', textAlign: 'right' }}>Inventory Cost</th>
                      <th style={{ padding: '8px 14px', textAlign: 'right' }}>Day Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySeries.map(d => (
                      <tr key={d.fullDate} style={{ borderTop: '1px solid #E8EAED' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 600 }}>{d.fullDate}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{money(d.sales)}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', color: '#5B6577' }}>{money(d.inventory)}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: d.profit >= 0 ? '#16A34A' : '#EF4444' }}>
                          {signedMoney(d.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 2: EXPENSES & OVERHEADS --- */}
        {tab === 'expenses' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              <div className="card">
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Cost Split by Head (Rent, Food, Utilities, etc.)</h3>
                {pnl?.byGroup && pnl.byGroup.length > 0 ? (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pnl.byGroup} dataKey="amount" nameKey="group" innerRadius={55} outerRadius={90} paddingAngle={2}>
                          {pnl.byGroup.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => money(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p style={{ color: '#8A94A6', fontSize: 13, padding: '30px 0', textAlign: 'center' }}>No expense records found for this period.</p>
                )}
              </div>

              <div className="card">
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Overhead Category Summary</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(pnl?.byGroup || []).map(g => (
                    <div key={g.group} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F4F5F7' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#0F1B2D' }}>{g.group}</span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>
                        {money(g.amount)}
                        <span style={{ color: '#8A94A6', fontWeight: 500, fontSize: 11, marginLeft: 8 }}>
                          {g.pct ? `${g.pct.toFixed(1)}%` : ''}
                        </span>
                      </span>
                    </div>
                  ))}
                  {pnl?.salaryLine > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F4F5F7' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#0F1B2D' }}>👨‍🍳 Staff Payroll</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#8B5CF6' }}>
                        {money(pnl.salaryLine)}
                        <span style={{ color: '#8A94A6', fontWeight: 500, fontSize: 11, marginLeft: 8 }}>
                          {pnl.salaryPct ? `${pnl.salaryPct.toFixed(1)}%` : ''}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 3: STOCK & INVENTORY MOVEMENT --- */}
        {tab === 'inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Filter controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  placeholder="Search product..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAED',
                    fontSize: 13, outline: 'none', width: 200,
                  }}
                />
                <select
                  value={txTypeFilter}
                  onChange={(e) => setTxTypeFilter(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAED',
                    fontSize: 13, outline: 'none', background: '#fff',
                  }}
                >
                  <option value="ALL">All Types</option>
                  <option value="PURCHASE">Purchases (Stock In)</option>
                  <option value="SALE">Sales (Stock Out)</option>
                  <option value="OPENING_STOCK">Opening Stock</option>
                </select>
              </div>

              <div style={{ fontSize: 12, color: '#8A94A6' }}>
                Showing <strong>{filteredTransactions.length}</strong> transactions
              </div>
            </div>

            {/* Transactions Table */}
            <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#FAFBFC' }}>
                  <tr style={{ textAlign: 'left', color: '#8A94A6', textTransform: 'uppercase', fontSize: 11 }}>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px' }}>Product</th>
                    <th style={{ padding: '12px 14px' }}>Movement Type</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Quantity</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Total Value</th>
                    <th style={{ padding: '12px 14px' }}>Note / Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t, idx) => {
                    const isPurchase = t.type === 'PURCHASE';
                    const isOpening = t.type === 'OPENING_STOCK';
                    const badgeBg = isPurchase ? '#D6F5E3' : isOpening ? '#E0E7FF' : '#FEE2E2';
                    const badgeColor = isPurchase ? '#16A34A' : isOpening ? '#4338CA' : '#EF4444';

                    return (
                      <tr key={t.id || idx} style={{ borderTop: '1px solid #E8EAED' }}>
                        <td style={{ padding: '12px 14px', color: '#8A94A6', whiteSpace: 'nowrap' }}>
                          {new Date(t.createdAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F1B2D' }}>
                          {t.product?.emoji ? `${t.product.emoji} ` : ''}{t.product?.name || 'Unknown Item'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                            background: badgeBg, color: badgeColor,
                          }}>
                            {t.type}
                          </span>
                        </td>
                        <td style={{
                          padding: '12px 14px', textAlign: 'right', fontWeight: 700,
                          color: isPurchase || isOpening ? '#16A34A' : '#EF4444',
                        }}>
                          {isPurchase ? '+' : isOpening ? '📦 ' : '-'}{t.quantity} {t.product?.unit || 'pcs'}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#0F1B2D' }}>
                          {money(t.total)}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#8A94A6', fontSize: 12 }}>
                          {t.note || (t.userId ? `User #${t.userId}` : '—')}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '36px 16px', color: '#8A94A6' }}>
                        No transactions found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB 4: FINANCIAL STATEMENT (P&L) --- */}
        {tab === 'pnl' && (
          <div className="card" style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 18, borderBottom: '1px solid #E8EAED', paddingBottom: 10 }}>
              Financial Performance Statement &bull; {pnl?.label || month || 'Period'}
            </h3>

            {/* 1. Revenue */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', marginBottom: 8 }}>
                1. Sales Revenue
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F4F5F7', fontSize: 13 }}>
                <span>Gross Customer Sales (Cash, Cards, UPI, Zomato)</span>
                <span style={{ fontWeight: 700 }}>{money(totalSales)}</span>
              </div>
            </div>

            {/* 2. Inventory / COGS */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0284C7', textTransform: 'uppercase', marginBottom: 8 }}>
                2. Inventory & Cost of Goods Sold
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F4F5F7', fontSize: 13 }}>
                <span>Inventory Purchases / Consumed</span>
                <span style={{ fontWeight: 600 }}>{money(pnl?.cogs ?? dashboardStats?.totalInventory ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E8EAED', fontSize: 13, fontWeight: 700 }}>
                <span>Gross Profit</span>
                <span style={{ color: grossProfit >= 0 ? '#16A34A' : '#EF4444' }}>{signedMoney(grossProfit)}</span>
              </div>
            </div>

            {/* 3. Operating Overheads */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', marginBottom: 8 }}>
                3. Payroll & Operating Overheads
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F4F5F7', fontSize: 13 }}>
                <span>Staff Salaries & Wages (Payroll)</span>
                <span style={{ fontWeight: 600 }}>{money(pnl?.salaryLine ?? dashboardStats?.salaryCost ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F4F5F7', fontSize: 13 }}>
                <span>Rent, Utilities, Maintenance, Gas & Misc</span>
                <span style={{ fontWeight: 600 }}>{money(pnl?.otherExpenses ?? dashboardStats?.otherExpenses ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E8EAED', fontSize: 13, fontWeight: 700 }}>
                <span>Total Operating Overheads</span>
                <span>{money((pnl?.salaryLine || 0) + (pnl?.otherExpenses || 0))}</span>
              </div>
            </div>

            {/* Net Profit Result */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 18px', borderRadius: 10,
              background: isProfit ? '#D6F5E3' : '#FEE2E2',
              color: isProfit ? '#166534' : '#991B1B',
              fontWeight: 800, fontSize: 16,
            }}>
              <span>{isProfit ? 'NET OPERATING PROFIT' : 'NET OPERATING LOSS'}</span>
              <span>{signedMoney(netProfit)}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
