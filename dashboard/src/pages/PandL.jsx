import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import MonthPicker from '../components/MonthPicker';
import RepairBanner from '../components/RepairBanner';
import { downloadStatistics } from '../components/downloadExport';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const money = (n) => `₹${Math.abs(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const signed = (n) => `${n < 0 ? '-' : ''}${money(n)}`;
const COLORS = ['#2ECC71', '#0F1B2D', '#F59E0B', '#6C63FF', '#EF4444', '#06B6D4', '#EC4899', '#84CC16', '#8B5CF6', '#14B8A6', '#F97316', '#64748B'];
const LABELS = { Gas: 'Gas & charcoal', Staff: 'Staff OT / incentive / uniform', Commission: 'Parcel / delivery commission', Marketing: 'Marketing & decoration', Utilities: 'Phone, water, laundry', Maintenance: 'Repairs & services', Transport: 'Petrol, diesel, tempo', General: 'Other / miscellaneous', Rent: 'Rent' };

export default function PandL() {
  const [pnl, setPnl] = useState(null);
  const [month, setMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (m) => {
    try {
      const res = await fetch(`${API}/api/accounts/pnl${m ? `?month=${m}` : ''}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error('Could not load P&L');
      const data = await res.json();
      setPnl(data);
      if (!m) setMonth(data.month || 'all');
      setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(null); }, [load]);

  const changeMonth = (m) => { setMonth(m); load(m); };
  const doExport = async () => {
    setExporting(true);
    try { await downloadStatistics(month); } catch (e) { alert(e.message); } finally { setExporting(false); }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading P&L...</div>;
  if (error || !pnl) return <div style={{ padding: 24, color: '#EF4444' }}>{error || 'No data'}</div>;

  const isProfit = pnl.netProfit >= 0;
  const hasData = pnl.sales.total > 0 || pnl.totalExpenses > 0;
  const prev = pnl.previous;
  const delta = (cur, p) => (p ? ((cur - p) / Math.abs(p)) * 100 : null);
  const dSales = prev ? delta(pnl.sales.total, prev.sales) : null;
  const dExp = prev ? delta(pnl.totalExpenses, prev.totalExpenses) : null;

  const row = (label, amount, { bold, indent, color, pct } = {}) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: bold ? '10px 12px' : '7px 12px', paddingLeft: indent ? 28 : 12, fontSize: 13, fontWeight: bold ? 700 : 500, background: bold ? '#F4F5F7' : 'transparent', borderBottom: '1px solid #F0F1F4', color: color || '#0F1B2D' }}>
      <span>{label}</span>
      <span>{signed(amount)}{pct != null && <span style={{ color: '#8A94A6', fontWeight: 500, fontSize: 11, marginLeft: 8 }}>{pct.toFixed(1)}%</span>}</span>
    </div>
  );
  const pc = (n) => (pnl.sales.total > 0 ? (n / pnl.sales.total) * 100 : null);
  const groupAmt = (g) => (pnl.byGroup.find(x => x.group === g) || {}).amount || 0;
  const channels = [['Cash', pnl.sales.cash], ['Card', pnl.sales.card], ['UPI / Online', pnl.sales.upi], ['Zomato', pnl.sales.zomato]].filter(c => c[1] > 0);
  const seriesData = (pnl.series || []).map(s => ({ month: s.label, Sales: s.sales, Costs: s.expenses, Profit: s.profit }));

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Profit & Loss" subtitle="Month-wise statement - same numbers as the Excel export" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <RepairBanner onDone={() => load(month)} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <MonthPicker months={pnl.months} value={month} onChange={changeMonth} />
          <button onClick={doExport} disabled={exporting} style={{ padding: '9px 20px', borderRadius: 10, background: '#0F1B2D', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: exporting ? 0.7 : 1 }}>
            {exporting ? 'Preparing Excel...' : '⬇ Download Excel report'}
          </button>
        </div>

        <div className="card" style={{ marginBottom: 20, background: !hasData ? '#fff' : isProfit ? '#D6F5E3' : '#FEE2E2', borderLeft: `5px solid ${!hasData ? '#E8EAED' : isProfit ? '#16A34A' : '#EF4444'}` }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase' }}>Net {isProfit ? 'profit' : 'loss'} · {pnl.label}</p>
          <p style={{ fontSize: 40, fontWeight: 800, color: isProfit ? '#16A34A' : '#EF4444' }}>
            {isProfit ? '+' : '-'}{money(pnl.netProfit)}
            <span style={{ fontSize: 16, fontWeight: 600, color: '#5B6577', marginLeft: 12 }}>{pnl.sales.total > 0 ? `${pnl.margin.toFixed(1)}% margin` : ''}</span>
          </p>
          {prev && <p style={{ fontSize: 12.5, color: '#5B6577', marginTop: 4 }}>vs {prev.label}: {signed(prev.netProfit)} · sales {dSales >= 0 ? '▲' : '▼'} {Math.abs(dSales).toFixed(1)}% · costs {dExp >= 0 ? '▲' : '▼'} {Math.abs(dExp).toFixed(1)}%</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginBottom: 20 }}>
          {[
            ['Total sales', money(pnl.sales.total), '#16A34A', 'Net of tax'],
            ['Food cost', `${pnl.foodCostPct.toFixed(1)}%`, pnl.foodCostPct > 40 ? '#EF4444' : '#0F1B2D', `${money(pnl.cogs)} food + packaging`],
            ['Salary cost', `${pnl.salaryPct.toFixed(1)}%`, '#6C63FF', `${money(pnl.salaryLine)} · ${pnl.employees.length} staff`],
            ['Rent', `${pnl.rentPct.toFixed(1)}%`, '#0F1B2D', 'of sales'],
          ].map(([l, v, c, sub]) => (
            <div key={l} className="card">
              <p style={{ fontSize: 12, color: '#8A94A6', fontWeight: 500, textTransform: 'uppercase' }}>{l}</p>
              <p style={{ fontSize: 26, fontWeight: 700, color: c, marginTop: 8 }}>{v}</p>
              <p style={{ fontSize: 11, color: '#8A94A6', marginTop: 4 }}>{sub}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 20 }}>
          <div className="card" style={{ flex: '1 1 380px', minWidth: 0, padding: 0, overflow: 'hidden' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, padding: '16px 12px 10px' }}>Statement - {pnl.label}</h3>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', padding: '4px 12px' }}>SALES</p>
            {channels.map(([l, v]) => row(l, v, { indent: true, pct: pc(v) }))}
            {row('Total sales', pnl.sales.total, { bold: true })}
            <p style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', padding: '10px 12px 4px' }}>COST OF GOODS</p>
            {row('Food & raw material', groupAmt('Food'), { indent: true, pct: pc(groupAmt('Food')) })}
            {row('Containers & packaging', groupAmt('Packaging'), { indent: true, pct: pc(groupAmt('Packaging')) })}
            {row('Gross profit', pnl.grossProfit, { bold: true, pct: pc(pnl.grossProfit) })}
            <p style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', padding: '10px 12px 4px' }}>OPERATING EXPENSES</p>
            {row('Salaries & wages', pnl.salaryLine, { indent: true, pct: pc(pnl.salaryLine) })}
            {pnl.opexLines.map(l => row(LABELS[l.group] || l.group, l.amount, { indent: true, pct: pc(l.amount) }))}
            {row('Total operating expenses', pnl.opex, { bold: true })}
            {row(isProfit ? 'NET PROFIT' : 'NET LOSS', pnl.netProfit, { bold: true, color: isProfit ? '#16A34A' : '#EF4444', pct: pc(pnl.netProfit) })}
            {(pnl.tax > 0 || pnl.transfer > 0) && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', padding: '12px 12px 4px' }}>NOT COUNTED IN PROFIT</p>
                {pnl.tax > 0 && row('GST paid', pnl.tax, { indent: true, color: '#8A94A6' })}
                {pnl.transfer > 0 && row('Cash withdrawn from bank', pnl.transfer, { indent: true, color: '#8A94A6' })}
              </>
            )}
          </div>

          <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Cost split</h3>
              {pnl.byGroup.length === 0 ? <p style={{ fontSize: 13, color: '#8A94A6' }}>No costs recorded.</p> : (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pnl.byGroup} dataKey="amount" nameKey="group" innerRadius={55} outerRadius={95} paddingAngle={2}>
                        {pnl.byGroup.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Sales, costs and profit by month</h3>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={seriesData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EAED" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8A94A6' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8A94A6' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v) => signed(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Sales" fill="#2ECC71" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Costs" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Profit" fill="#0F1B2D" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
