import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../config';
import MonthPicker from './MonthPicker';
import { fmtQty } from '../utils';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const inr0 = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function ProductSalesSummary() {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
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
        setError(json.error || 'Failed to load product sales data');
      }
    } catch (err) {
      console.error('Error fetching product sales summary:', err);
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

  // Filter and sort products
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
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (q && !`${p.name} ${p.sku || ''} ${p.category || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });

    switch (sortBy) {
      case 'revenue_desc':
        return list.sort((a, b) => b.totalRevenue - a.totalRevenue);
      case 'revenue_asc':
        return list.sort((a, b) => a.totalRevenue - b.totalRevenue);
      case 'units_desc':
        return list.sort((a, b) => b.quantitySold - a.quantitySold);
      case 'units_asc':
        return list.sort((a, b) => a.quantitySold - b.quantitySold);
      case 'name_asc':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'profit_desc':
        return list.sort((a, b) => (b.estimatedProfit || 0) - (a.estimatedProfit || 0));
      default:
        return list;
    }
  }, [products, search, categoryFilter, sortBy]);

  const summary = data?.summary || {
    totalRevenue: 0,
    totalUnits: 0,
    totalOrders: 0,
    uniqueProductsSold: 0,
    topByRevenue: null,
    topByQuantity: null,
  };

  const exportCSV = () => {
    if (!filteredProducts.length) return;
    const headers = ['Product Name', 'SKU', 'Category', 'Units Sold', 'Unit', 'Total Sales (INR)', 'Avg Price (INR)', 'Current Stock', 'Orders Count'];
    const rows = filteredProducts.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.sku || ''}"`,
      `"${p.category || 'General'}"`,
      p.quantitySold,
      `"${p.unit || 'pcs'}"`,
      p.totalRevenue,
      p.avgPrice,
      p.currentStock,
      p.orderCount,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Product_Sales_${data?.month || 'summary'}.csv`);
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
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0F1B2D' }}>
            {data?.monthLabel ? `Sales for ${data.monthLabel}` : 'Product Sales'}
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
              Total Sales Revenue
            </span>
            <span style={{ fontSize: 20 }}>💰</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#16A34A' }}>
            {inr(summary.totalRevenue)}
          </p>
          <p style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 4 }}>
            Across {summary.totalOrders} sale orders in {data?.monthLabel || 'month'}
          </p>
        </div>

        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Units Sold
            </span>
            <span style={{ fontSize: 20 }}>📦</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#0F1B2D' }}>
            {fmtQty(summary.totalUnits)}
          </p>
          <p style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 4 }}>
            Total volume of all items sold
          </p>
        </div>

        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Top Selling Product
            </span>
            <span style={{ fontSize: 20 }}>🏆</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#6C63FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {summary.topByRevenue?.name || '—'}
          </p>
          <p style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 700, marginTop: 4 }}>
            {summary.topByRevenue ? inr(summary.topByRevenue.revenue) : 'No sales'}
          </p>
        </div>

        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Unique Products Sold
            </span>
            <span style={{ fontSize: 20 }}>🏷️</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#0284C7' }}>
            {summary.uniqueProductsSold} items
          </p>
          <p style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 4 }}>
            Different menu / stock items ordered
          </p>
        </div>
      </div>

      {/* Category Breakdown Chips */}
      {data?.categoryBreakdown && data.categoryBreakdown.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', border: '1px solid #E8EAED', marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', marginBottom: 10 }}>
            Sales by Category
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {data.categoryBreakdown.map((cat) => (
              <div
                key={cat.category}
                onClick={() => setCategoryFilter(categoryFilter === cat.category ? '' : cat.category)}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: categoryFilter === cat.category ? '#0F1B2D' : '#F8FAFC',
                  color: categoryFilter === cat.category ? '#fff' : '#0F1B2D',
                  border: '1px solid #E2E8F0', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ fontWeight: 600 }}>{cat.category}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: categoryFilter === cat.category ? '#86EFAC' : '#16A34A',
                }}>
                  {inr0(cat.revenue)}
                </span>
                <span style={{
                  fontSize: 10.5,
                  color: categoryFilter === cat.category ? '#CBD5E1' : '#94A3B8'
                }}>
                  ({cat.pct.toFixed(0)}%)
                </span>
              </div>
            ))}
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
            placeholder="Search products by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
              fontSize: 13, width: 260, outline: 'none'
            }}
          />

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1',
              fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer'
            }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {categoryFilter && (
            <button
              onClick={() => setCategoryFilter('')}
              style={{
                background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 6,
                padding: '6px 10px', fontSize: 11.5, color: '#475569', cursor: 'pointer'
              }}
            >
              Clear Category ✕
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
            <option value="units_desc">Most Units Sold</option>
            <option value="units_asc">Fewest Units Sold</option>
            <option value="name_asc">Product Name (A-Z)</option>
            <option value="profit_desc">Estimated Profit (₹)</option>
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
                <th style={{ padding: '12px 16px' }}>Product</th>
                <th style={{ padding: '12px 16px' }}>Category</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Units Sold</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800 }}>Total Sales</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Avg Rate</th>
                <th style={{ padding: '12px 16px', width: 140 }}>% of Sales</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>In Stock</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Orders</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p, idx) => (
                <tr
                  key={p.productId}
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
                      <span style={{ fontSize: 18 }}>{p.emoji || '📦'}</span>
                      <div>
                        <div>{p.name}</div>
                        {p.sku && <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 400 }}>SKU: {p.sku}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: '#EEF0FF', color: '#5B21B6', fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 6 }}>
                      {p.category}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0F1B2D' }}>
                    {fmtQty(p.quantitySold)} <span style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>{p.unit || 'pcs'}</span>
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
                            width: `${Math.min(100, p.pctOfTotal)}%`,
                            background: '#16A34A',
                            borderRadius: 4
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', minWidth: 32, textAlign: 'right' }}>
                        {p.pctOfTotal.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: p.currentStock > 10 ? '#16A34A' : p.currentStock > 0 ? '#D97706' : '#DC2626'
                    }}>
                      {fmtQty(p.currentStock)} {p.unit || ''}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>
                    {p.orderCount}
                  </td>
                </tr>
              ))}

              {!loading && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: '#8A94A6' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: '#0F1B2D' }}>
                      No product sales recorded in {data?.monthLabel || 'this period'}
                    </p>
                    <p style={{ fontSize: 12, color: '#8A94A6', marginTop: 4 }}>
                      Record sales in the "Stock Orders" tab, or choose a different month above.
                    </p>
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

