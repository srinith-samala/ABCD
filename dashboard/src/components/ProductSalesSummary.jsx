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
  const [activeTab, setActiveTab] = useState('auto'); // 'auto' | 'pos' | 'closing' | 'orders'

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

  // Determine current active view
  const currentView = useMemo(() => {
    if (activeTab !== 'auto') return activeTab;
    if (data?.viewMode && data.viewMode !== 'none') return data.viewMode;
    if (data?.hasOrderData) return 'orders';
    if (data?.hasPosData) return 'pos';
    if (data?.hasClosingData) return 'closing';
    return 'orders';
  }, [activeTab, data]);

  // Determine active item list
  const activeProducts = useMemo(() => {
    if (!data) return [];
    if (currentView === 'closing') return data.closingItems || [];
    if (currentView === 'orders') return data.stockItems || [];
    if (currentView === 'pos') return data.posItems || data.products || [];
    return data.products || [];
  }, [data, currentView]);

  const categories = useMemo(() => {
    const set = new Set();
    activeProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = activeProducts.filter((p) => {
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
      default:
        return list;
    }
  }, [activeProducts, search, categoryFilter, sortBy]);

  // Compute live KPIs for active products
  const liveSummary = useMemo(() => {
    const totalRev = activeProducts.reduce((s, p) => s + (Number(p.totalRevenue) || 0), 0);
    const totalUnits = activeProducts.reduce((s, p) => s + (Number(p.quantitySold) || 0), 0);
    const sortedByRev = [...activeProducts].sort((a, b) => b.totalRevenue - a.totalRevenue);
    const topItem = sortedByRev.length ? sortedByRev[0] : null;

    return {
      totalRevenue: totalRev,
      totalUnits: totalUnits,
      topItem: topItem ? { name: topItem.name, revenue: topItem.totalRevenue, unit: topItem.unit } : null,
      uniqueCount: activeProducts.length,
    };
  }, [activeProducts]);

  // Category breakdown for active products
  const categoryBreakdown = useMemo(() => {
    const map = new Map();
    activeProducts.forEach((p) => {
      const cat = p.category || 'General';
      const c = map.get(cat) || { category: cat, revenue: 0, units: 0, count: 0 };
      c.revenue += Number(p.totalRevenue) || 0;
      c.units += Number(p.quantitySold) || 0;
      c.count += 1;
      map.set(cat, c);
    });
    const total = liveSummary.totalRevenue;
    return Array.from(map.values())
      .map((c) => ({
        ...c,
        pct: total > 0 ? (c.revenue / total) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [activeProducts, liveSummary.totalRevenue]);

  const exportCSV = () => {
    if (!filteredProducts.length) return;
    const isClosing = currentView === 'closing';
    const isPos = currentView === 'pos';

    const headers = isClosing
      ? ['Raw Material', 'Category', 'Consumed Qty', 'Unit', 'Material Cost (INR)', 'Rate (INR)', 'Closing Stock Remaining', '% of Consumed']
      : isPos
      ? ['Menu Category / Item', 'Department', 'Total Sales (INR)', 'Avg / Day (INR)', 'Days / Orders Count', '% of Sales']
      : ['Product Name', 'SKU', 'Category', 'Units Sold', 'Unit', 'Total Sales (INR)', 'Avg Rate (INR)', 'Current Stock', 'Orders Count'];

    const rows = filteredProducts.map((p) => {
      if (isClosing) {
        return [
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.category || 'Raw Materials'}"`,
          p.consumed !== undefined ? p.consumed : p.quantitySold,
          `"${p.unit || 'pcs'}"`,
          p.totalRevenue,
          p.avgPrice,
          p.closingStock !== undefined ? p.closingStock : p.currentStock,
          p.pctOfTotal ? p.pctOfTotal.toFixed(1) : '0',
        ];
      }
      if (isPos) {
        return [
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.category || 'Menu'}"`,
          p.totalRevenue,
          p.avgPrice,
          p.daysCount || p.orderCount || 1,
          p.pctOfTotal ? p.pctOfTotal.toFixed(1) : '0',
        ];
      }
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.sku || ''}"`,
        `"${p.category || 'General'}"`,
        p.quantitySold,
        `"${p.unit || 'pcs'}"`,
        p.totalRevenue,
        p.avgPrice,
        p.currentStock,
        p.orderCount,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Product_Sales_${currentView}_${data?.month || 'summary'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasPos = Boolean(data?.posItems && data.posItems.length > 0);
  const hasClosing = Boolean(data?.closingItems && data.closingItems.length > 0);
  const hasOrders = Boolean(data?.stockItems && data.stockItems.length > 0);

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
            {data?.monthLabel ? `Overall Monthly Sales (${data.monthLabel})` : 'Product Sales'}
          </span>
        </div>

        {/* View mode toggle pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', gap: 4, background: '#F1F5F9', padding: '3px', borderRadius: 10,
            border: '1px solid #E2E8F0'
          }}>
            <button
              onClick={() => setActiveTab('orders')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                background: currentView === 'orders' ? '#0F1B2D' : 'transparent',
                color: currentView === 'orders' ? '#fff' : '#64748B',
                boxShadow: currentView === 'orders' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s'
              }}
            >
              <span>📦 Product Orders</span>
              {hasOrders && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  background: currentView === 'orders' ? '#16A34A' : '#CBD5E1',
                  color: '#fff', fontWeight: 800
                }}>
                  {data.stockItems.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('pos')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                background: currentView === 'pos' ? '#0F1B2D' : 'transparent',
                color: currentView === 'pos' ? '#fff' : '#64748B',
                boxShadow: currentView === 'pos' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s'
              }}
            >
              <span>🍽️ POS Menu Sales</span>
              {hasPos && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  background: currentView === 'pos' ? '#16A34A' : '#CBD5E1',
                  color: '#fff', fontWeight: 800
                }}>
                  {data.posItems.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('closing')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                background: currentView === 'closing' ? '#0F1B2D' : 'transparent',
                color: currentView === 'closing' ? '#fff' : '#64748B',
                boxShadow: currentView === 'closing' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s'
              }}
            >
              <span>🥕 Raw Materials Consumed</span>
              {hasClosing && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  background: currentView === 'closing' ? '#16A34A' : '#CBD5E1',
                  color: '#fff', fontWeight: 800
                }}>
                  {data.closingItems.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={exportCSV}
            disabled={!filteredProducts.length}
            style={{
              padding: '8px 14px', borderRadius: 10, background: '#0F1B2D',
              color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 600,
              cursor: filteredProducts.length ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: filteredProducts.length ? 1 : 0.6
            }}
          >
            📥 Export CSV
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
              {currentView === 'closing' ? 'Material Consumed Value' : 'Total Sales Revenue'}
            </span>
            <span style={{ fontSize: 20 }}>💰</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#16A34A' }}>
            {inr(liveSummary.totalRevenue)}
          </p>
          <p style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 4 }}>
            {currentView === 'closing'
              ? `Across ${liveSummary.uniqueCount} inventory items in ${data?.monthLabel || 'month'}`
              : `Across ${liveSummary.uniqueCount} items/categories in ${data?.monthLabel || 'month'}`}
          </p>
        </div>

        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {currentView === 'closing' ? 'Total Volume Consumed' : 'Total Units / Orders'}
            </span>
            <span style={{ fontSize: 20 }}>📦</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#0F1B2D' }}>
            {fmtQty(liveSummary.totalUnits)}
          </p>
          <p style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 4 }}>
            {currentView === 'closing' ? 'Total quantity consumed from stock' : 'Total recorded sales volume'}
          </p>
        </div>

        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {currentView === 'closing' ? 'Highest Consumed Material' : 'Top Selling Product / Menu'}
            </span>
            <span style={{ fontSize: 20 }}>🏆</span>
          </div>
          <p style={{ fontSize: 17, fontWeight: 800, color: '#6C63FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {liveSummary.topItem?.name || '—'}
          </p>
          <p style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 700, marginTop: 4 }}>
            {liveSummary.topItem ? inr(liveSummary.topItem.revenue) : 'No recorded activity'}
          </p>
        </div>

        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #E8EAED', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {currentView === 'closing' ? 'Reconciled Items' : 'Unique Items Tracked'}
            </span>
            <span style={{ fontSize: 20 }}>🏷️</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#0284C7' }}>
            {liveSummary.uniqueCount} items
          </p>
          <p style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 4 }}>
            {currentView === 'closing' ? 'Raw materials in closing reconciliation' : 'Items with recorded activity'}
          </p>
        </div>
      </div>

      {/* Category Breakdown Chips */}
      {categoryBreakdown.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', border: '1px solid #E8EAED', marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', marginBottom: 10 }}>
            {currentView === 'closing' ? 'Consumption by Category' : 'Sales by Category'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {categoryBreakdown.map((cat) => (
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
            placeholder={currentView === 'closing' ? 'Search ingredients or raw materials...' : 'Search items or categories...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
              fontSize: 13, width: 280, outline: 'none'
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
            <option value="">All Categories ({categories.length})</option>
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
            <option value="revenue_desc">{currentView === 'closing' ? 'Highest Value (₹)' : 'Highest Sales (₹)'}</option>
            <option value="revenue_asc">{currentView === 'closing' ? 'Lowest Value (₹)' : 'Lowest Sales (₹)'}</option>
            <option value="units_desc">{currentView === 'closing' ? 'Most Consumed Qty' : 'Most Units Sold'}</option>
            <option value="units_asc">{currentView === 'closing' ? 'Fewest Consumed Qty' : 'Fewest Units Sold'}</option>
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
                <th style={{ padding: '12px 16px' }}>{currentView === 'closing' ? 'Raw Material / Ingredient' : 'Product / Menu Item'}</th>
                <th style={{ padding: '12px 16px' }}>Category</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {currentView === 'closing' ? 'Consumed Qty' : 'Units Sold'}
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800 }}>
                  {currentView === 'closing' ? 'Consumed Value' : 'Total Sales'}
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {currentView === 'closing' ? 'Purchase Rate' : 'Avg Rate'}
                </th>
                <th style={{ padding: '12px 16px', width: 140 }}>
                  {currentView === 'closing' ? '% of Total' : '% of Sales'}
                </th>
                {currentView === 'closing' && (
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Closing Stock</th>
                )}
                {currentView !== 'closing' && (
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>In Stock</th>
                )}
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>
                  {currentView === 'pos' ? 'Days' : 'Orders'}
                </th>
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
                      <span style={{ fontSize: 18 }}>{p.emoji || (currentView === 'closing' ? '🥕' : '🍽️')}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <div>{p.name}</div>
                          {currentView === 'orders' && p.type && (
                            <span style={{
                              fontSize: 10, padding: '1px 5px', borderRadius: 4,
                              background: p.type === 'SALE' ? '#DCFCE7' : p.type === 'BOTH' ? '#FEF3C7' : '#EEF0FF',
                              color: p.type === 'SALE' ? '#166534' : p.type === 'BOTH' ? '#92400E' : '#4338CA',
                              fontWeight: 700
                            }}>
                              {p.type === 'SALE' ? 'Stock Out' : p.type === 'BOTH' ? 'In & Out' : 'Stock In'}
                            </span>
                          )}
                        </div>
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
                    {fmtQty(p.consumed !== undefined ? p.consumed : p.quantitySold)}{' '}
                    <span style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>{p.unit || 'pcs'}</span>
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
                            background: '#16A34A',
                            borderRadius: 4
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', minWidth: 32, textAlign: 'right' }}>
                        {(p.pctOfTotal || 0).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  {currentView === 'closing' && (
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: p.closingStock > 0 ? '#16A34A' : '#64748B'
                      }}>
                        {fmtQty(p.closingStock)} {p.unit || ''}
                      </span>
                    </td>
                  )}
                  {currentView !== 'closing' && (
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: p.currentStock > 10 ? '#16A34A' : p.currentStock > 0 ? '#D97706' : '#DC2626'
                      }}>
                        {fmtQty(p.currentStock)} {p.unit || ''}
                      </span>
                    </td>
                  )}
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>
                    {p.daysCount || p.orderCount || 1}
                  </td>
                </tr>
              ))}

              {!loading && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '48px 20px', color: '#8A94A6' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
                    <p style={{ fontWeight: 700, fontSize: 16, color: '#0F1B2D', marginBottom: 6 }}>
                      No {currentView === 'closing' ? 'closing stock consumption' : 'item-wise sales'} recorded in {data?.monthLabel || 'this period'}
                    </p>

                    {data?.dailySalesTotal > 0 && (
                      <div style={{
                        maxWidth: 480, margin: '14px auto', background: '#F0FDF4', border: '1px solid #BBF7D0',
                        borderRadius: 10, padding: '12px 16px', color: '#166534', fontSize: 13
                      }}>
                        💡 Daily Sales Register has <b>{inr(data.dailySalesTotal)}</b> recorded across <b>{data.dailySalesDays} days</b> in {data.monthLabel}.
                        Upload POS Detailed Bills in "Daily Sales Bills" or Month-End Closing Stock in "Closing Stock" to see individual dish & material breakdowns.
                      </div>
                    )}

                    {data?.availableMonths && data.availableMonths.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <span style={{ fontSize: 12.5, color: '#64748B', marginRight: 8 }}>Available months with data:</span>
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
