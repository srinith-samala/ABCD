import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../config';
import MonthPicker from './MonthPicker';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const inr0 = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function ProductSalesSummary() {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'dish' | 'cat'
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('revenue_desc');

  const authH = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  });

  const loadData = useCallback(async (m) => {
    setLoading(true);
    setError('');
    try {
      const q = m ? `?month=${m}` : '';
      const res = await fetch(`${API}/api/transactions/product-sales${q}`, {
        headers: authH(),
      });
      const json = await res.json();
      if (res.ok) {
        setData(json);
        if (!month) {
          setMonth(json.month);
        }
      } else {
        setError(json.error || 'Failed to load bill sales data');
      }
    } catch (err) {
      console.error('Error fetching bill sales summary:', err);
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadData(month);
  }, [month, loadData]);

  const handleMonthChange = (m) => {
    setMonth(m);
    loadData(m);
  };

  const products = data?.products || [];

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products.filter((p) => {
      if (typeFilter === 'dish' && p.itemType !== 'Dish / Item') return false;
      if (typeFilter === 'cat' && p.itemType !== 'Category') return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (q && !`${p.name} ${p.category || ''} ${p.itemType || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });

    switch (sortBy) {
      case 'revenue_desc':
        return list.sort((a, b) => b.totalRevenue - a.totalRevenue);
      case 'revenue_asc':
        return list.sort((a, b) => a.totalRevenue - b.totalRevenue);
      case 'days_desc':
        return list.sort((a, b) => b.daysCount - a.daysCount);
      case 'name_asc':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
  }, [products, search, typeFilter, categoryFilter, sortBy]);

  const summary = data?.summary || {
    totalRevenue: 0,
    totalItems: 0,
    daysCount: 0,
    topItem: null,
  };

  const topCategories = data?.topCategories || [];

  const exportCSV = () => {
    if (!filteredProducts.length) return;
    const headers = ['Dish / Category Name', 'Type', 'Category / Department', 'Total Sales (INR)', 'Percentage of Sales', 'Avg Daily Sales (INR)', 'Days Sold'];
    const rows = filteredProducts.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.itemType || 'Item'}"`,
      `"${p.category || 'Menu'}"`,
      p.totalRevenue,
      p.pctOfTotal ? p.pctOfTotal.toFixed(1) + '%' : '0%',
      p.avgPrice,
      p.daysCount,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bill_Sales_Summary_${data?.month || 'month'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {/* Top Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <MonthPicker
            months={data?.availableMonths || []}
            value={month}
            onChange={handleMonthChange}
            allowAll={true}
          />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#0F1B2D' }}>
            {data?.monthLabel ? `Monthly Dish & Category Sales · ${data.monthLabel}` : 'Monthly Bill Sales'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={exportCSV}
            disabled={!filteredProducts.length}
            style={{
              padding: '9px 16px', borderRadius: 10, background: '#0F1B2D',
              color: '#fff', border: 'none', fontSize: 13, fontWeight: 600,
              cursor: filteredProducts.length ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: filteredProducts.length ? 1 : 0.6
            }}
          >
            📥 Export to CSV
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: '12px 16px', borderRadius: 10, fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Bill Sales
            </span>
            <span style={{ fontSize: 20 }}>💰</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#16A34A' }}>
            {inr(summary.totalRevenue)}
          </p>
          <p style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 4 }}>
            Net recorded sales from customer bills
          </p>
        </div>

        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Top Selling Item / Category
            </span>
            <span style={{ fontSize: 20 }}>🏆</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#6C63FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {summary.topItem?.name || '—'}
          </p>
          <p style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 700, marginTop: 4 }}>
            {summary.topItem ? inr(summary.topItem.revenue) : 'No recorded sales'}
          </p>
        </div>

        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Unique Dishes & Categories
            </span>
            <span style={{ fontSize: 20 }}>🏷️</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#0284C7' }}>
            {summary.totalItems} items
          </p>
          <p style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 4 }}>
            Dishes & food categories ordered in {data?.monthLabel || 'month'}
          </p>
        </div>

        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Days of Sales Recorded
            </span>
            <span style={{ fontSize: 20 }}>📅</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#0F1B2D' }}>
            {summary.daysCount} days
          </p>
          <p style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 4 }}>
            POS daily bill summaries uploaded
          </p>
        </div>
      </div>

      {/* Top Categories Progress Bars (matches POS summary view) */}
      {topCategories.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #E8EAED', marginBottom: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F1B2D' }}>
              Top categories in {data?.monthLabel || 'this month'}
            </h3>
            <span style={{ fontSize: 12, color: '#64748B' }}>
              Click any category below to filter dishes
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px 28px' }}>
            {topCategories.map((c) => {
              const maxAmt = topCategories[0]?.amount || 1;
              const barWidth = Math.min(100, Math.max(8, (c.amount / maxAmt) * 100));
              const isSelected = search.toLowerCase() === c.name.toLowerCase() || categoryFilter === c.name;

              return (
                <div
                  key={c.name}
                  onClick={() => {
                    if (search.toLowerCase() === c.name.toLowerCase()) {
                      setSearch('');
                    } else {
                      setSearch(c.name);
                    }
                  }}
                  style={{
                    cursor: 'pointer', padding: '6px 8px', borderRadius: 8,
                    background: isSelected ? '#F0FDF4' : 'transparent',
                    border: isSelected ? '1.5px solid #86EFAC' : '1.5px solid transparent',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0F1B2D' }}>{c.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0F1B2D' }}>
                      {inr0(c.amount)} <span style={{ color: '#8A94A6', fontWeight: 500, fontSize: 12 }}>· {c.pct}%</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${barWidth}%`,
                        background: '#2ECC71',
                        borderRadius: 4
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: '14px 18px',
        border: '1px solid #E8EAED', marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          <input
            type="text"
            placeholder="Search dish or category (e.g. Paneer Tikka, Biryani, Roti)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '9px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
              fontSize: 13, width: 340, outline: 'none'
            }}
          />

          {/* Type Filter */}
          <div style={{ display: 'flex', background: '#F1F5F9', padding: 3, borderRadius: 8 }}>
            {[
              { id: 'all', label: 'All Items' },
              { id: 'dish', label: 'Dishes only' },
              { id: 'cat', label: 'Categories only' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: typeFilter === t.id ? '#0F1B2D' : 'transparent',
                  color: typeFilter === t.id ? '#fff' : '#64748B',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 6,
                padding: '6px 10px', fontSize: 11.5, color: '#475569', cursor: 'pointer'
              }}
            >
              Clear Search ✕
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1',
              fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer'
            }}
          >
            <option value="revenue_desc">Highest Sales (₹)</option>
            <option value="revenue_asc">Lowest Sales (₹)</option>
            <option value="days_desc">Most Days Sold</option>
            <option value="name_asc">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EAED', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0', color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 16px', width: 40, textAlign: 'center' }}>#</th>
                <th style={{ padding: '12px 16px' }}>Dish / Category Name</th>
                <th style={{ padding: '12px 16px' }}>Type</th>
                <th style={{ padding: '12px 16px' }}>Category / Department</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800 }}>Total Sales</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Avg / Day</th>
                <th style={{ padding: '12px 16px', width: 140 }}>% of Total Sales</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Days Sold</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p, idx) => (
                <tr
                  key={p.productId || p.name || idx}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    background: idx % 2 === 0 ? '#fff' : '#FAFBFC',
                  }}
                >
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F1B2D' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{p.emoji || '🍽️'}</span>
                      <span style={{ fontSize: 14 }}>{p.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700,
                      background: p.itemType === 'Dish / Item' ? '#EEF0FF' : '#FEF3C7',
                      color: p.itemType === 'Dish / Item' ? '#4338CA' : '#92400E',
                    }}>
                      {p.itemType}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ color: '#475569', fontSize: 12 }}>
                      {p.category}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#16A34A', fontSize: 14 }}>
                    {inr(p.totalRevenue)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748B' }}>
                    {inr(p.avgPrice)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, p.pctOfTotal || 0)}%`,
                            background: '#2ECC71',
                            borderRadius: 4
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', minWidth: 32, textAlign: 'right' }}>
                        {(p.pctOfTotal || 0).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#0F1B2D', fontWeight: 700 }}>
                    {p.daysCount} days
                  </td>
                </tr>
              ))}

              {!loading && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: '#8A94A6' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🧾</div>
                    <p style={{ fontWeight: 700, fontSize: 16, color: '#0F1B2D', marginBottom: 6 }}>
                      No bill sales recorded for {data?.monthLabel || 'this period'}
                    </p>
                    <p style={{ fontSize: 13, color: '#64748B', maxWidth: 460, margin: '0 auto 16px auto' }}>
                      Upload POS Detailed Sales Summary bills in the "Daily Sales Bills" tab to view monthly sales of each dish and category.
                    </p>

                    {data?.availableMonths && data.availableMonths.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <span style={{ fontSize: 12.5, color: '#64748B', marginRight: 8 }}>Choose a month with bills:</span>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', verticalAlign: 'middle' }}>
                          {data.availableMonths.map((m) => (
                            <button
                              key={m.key}
                              onClick={() => handleMonthChange(m.key)}
                              style={{
                                padding: '5px 12px', borderRadius: 8, border: '1px solid #CBD5E1',
                                background: '#fff', fontSize: 12, fontWeight: 700, color: '#0F1B2D', cursor: 'pointer'
                              }}
                            >
                              {m.label} →
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
