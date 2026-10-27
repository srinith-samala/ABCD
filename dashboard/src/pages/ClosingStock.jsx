import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import Portal from '../components/Portal';
import { fmtQty } from '../utils';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const inr0 = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function ClosingStock() {
  const [closings, setClosings] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Upload & preview state
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewTab, setPreviewTab] = useState('all'); // 'all' | 'matched' | 'unmatched' | 'unlisted'
  const [previewSearch, setPreviewSearch] = useState('');
  const [createUnmatched, setCreateUnmatched] = useState(false);
  const [zeroUnlisted, setZeroUnlisted] = useState(false);

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeViewClosing, setActiveViewClosing] = useState(null);

  const fileInputRef = useRef(null);

  const fetchClosings = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await fetch(`${API}/api/closing-stock`, { headers });
      if (res.ok) {
        const data = await res.json();
        setClosings(data.closings || []);
        if (data.availableMonths && data.availableMonths.length > 0) {
          setAvailableMonths(data.availableMonths);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClosings();
  }, [fetchClosings]);

  // Current month's saved closing record if any
  const currentClosing = closings.find((c) => c.month === selectedMonth);

  const handleFileSelect = (f) => {
    if (!f) return;
    setFile(f);
    setError('');
    setPreview(null);
  };

  const handleGeneratePreview = async (e) => {
    e?.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('month', selectedMonth);

      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await fetch(`${API}/api/closing-stock/preview`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze closing stock file');
      }

      setPreview(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApplyReconciliation = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      };
      const res = await fetch(`${API}/api/closing-stock/reconcile`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          month: preview.month,
          fileName: preview.fileName,
          closingDate: `${preview.month}-28`,
          openingStockValue: preview.openingStockValue,
          purchasesValue: preview.purchasesValue,
          totalAvailableValue: preview.totalAvailableValue,
          closingStockValue: preview.closingStockValue,
          consumedValue: preview.consumedValue,
          items: preview.items,
          unmatchedInFile: preview.unmatchedInFile,
          unlistedInSystem: preview.unlistedInSystem,
          createUnmatched,
          zeroUnlisted,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply closing stock reconciliation');
      }

      setShowConfirmModal(false);
      setSuccessMsg(`Successfully reconciled ${preview.month} closing stock! Inventory balance updated to ${inr(preview.closingStockValue)}.`);
      setPreview(null);
      setFile(null);
      fetchClosings();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteClosing = async (month) => {
    if (!window.confirm(`Are you sure you want to delete the closing record for ${month}? Note: This removes the historical closing record in P&L.`)) {
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await fetch(`${API}/api/closing-stock/${month}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        setSuccessMsg(`Closing record for ${month} removed.`);
        fetchClosings();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete closing record');
      }
    } catch (e) {
      alert(e.message);
    }
  };

  // Filter items in preview table
  const filteredPreviewItems = (preview?.items || []).filter((item) => {
    const q = previewSearch.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(q) || (item.category && item.category.toLowerCase().includes(q));
    if (!matchesSearch) return false;
    if (previewTab === 'matched') return item.isMatched;
    if (previewTab === 'unmatched') return !item.isMatched;
    return true;
  });

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#F8FAFC' }}>
      <Header
        title="Month-End Closing Stock"
        subtitle="Reconcile closing inventory workbook, deduct consumed stock, and lock month-end inventory balances"
      />

      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {/* Month Selector & Reconciled Status Top Bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 16, marginBottom: 20,
          background: '#fff', padding: '16px 20px', borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>📅</span>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Reconciliation Month
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setPreview(null);
                    setError('');
                    setSuccessMsg('');
                  }}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    border: '1.5px solid #CBD5E1', fontSize: 14, fontWeight: 700,
                    background: '#F8FAFC', color: '#0F1B2D', fontFamily: 'inherit'
                  }}
                />
                {availableMonths.length > 0 && (
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setPreview(null);
                      setError('');
                      setSuccessMsg('');
                    }}
                    style={{
                      padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #E2E8F0', fontSize: 13, background: '#fff',
                      color: '#475569', cursor: 'pointer'
                    }}
                  >
                    <option value="">Quick select...</option>
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {m} {closings.some((c) => c.month === m) ? '✓ Reconciled' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div>
            {currentClosing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: '#DCFCE7', color: '#166534',
                  padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <span>✓</span> Reconciled for {selectedMonth}
                </span>
                <button
                  onClick={() => setActiveViewClosing(currentClosing)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, background: '#F1F5F9',
                    border: '1px solid #CBD5E1', fontSize: 12.5, fontWeight: 600,
                    color: '#0F1B2D', cursor: 'pointer'
                  }}
                >
                  👁️ View Report
                </button>
                <button
                  onClick={() => handleDeleteClosing(selectedMonth)}
                  style={{
                    padding: '7px 12px', borderRadius: 8, background: '#FEE2E2',
                    border: 'none', fontSize: 12, fontWeight: 600,
                    color: '#B91C1C', cursor: 'pointer'
                  }}
                  title="Remove closing record"
                >
                  🗑️
                </button>
              </div>
            ) : (
              <span style={{
                background: '#FEF3C7', color: '#92400E',
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              }}>
                ⏳ Pending Closing Stock Reconciliation
              </span>
            )}
          </div>
        </div>

        {/* Success Banner */}
        {successMsg && (
          <div style={{
            background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 12,
            padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🎉</span>
              <span style={{ color: '#166534', fontWeight: 600, fontSize: 13.5 }}>{successMsg}</span>
            </div>
            <button
              onClick={() => setSuccessMsg('')}
              style={{ background: 'none', border: 'none', color: '#15803D', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div style={{
            background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12,
            padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <span style={{ color: '#991B1B', fontWeight: 600, fontSize: 13.5 }}>{error}</span>
            </div>
            <button
              onClick={() => setError('')}
              style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Already Reconciled Overview Card (if already closed) */}
        {currentClosing && !preview && (
          <div style={{
            background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
            border: '1.5px solid #86EFAC', borderRadius: 14, padding: 22, marginBottom: 24
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Active Saved Month-End Report
                </span>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0F1B2D', marginTop: 4 }}>
                  {selectedMonth} Inventory Reconciliation
                </h3>
                <p style={{ fontSize: 12.5, color: '#475569', marginTop: 4 }}>
                  Reconciled on {currentClosing.reconciledAt ? new Date(currentClosing.reconciledAt).toLocaleString('en-IN') : 'N/A'} · Source file: <b>{currentClosing.fileName || 'Closing Stock Excel'}</b>
                </p>
              </div>
              <div style={{ background: '#fff', border: '1px solid #BBF7D0', padding: '6px 14px', borderRadius: 10, fontSize: 12, color: '#166534', fontWeight: 600 }}>
                🔒 <b>No automatic next-month carry-forward:</b> Next month opening remains 0 until manually imported.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #DCFCE7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Opening Stock</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#6C63FF', marginTop: 4 }}>{inr(currentClosing.openingStockValue)}</p>
                <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Manual previous month import</p>
              </div>
              <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #DCFCE7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>+ Month Purchases</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#0284C7', marginTop: 4 }}>{inr(currentClosing.purchasesValue)}</p>
                <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Total bills logged in {selectedMonth}</p>
              </div>
              <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #DCFCE7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>= Total Available</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#0F1B2D', marginTop: 4 }}>{inr(currentClosing.totalAvailableValue)}</p>
                <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Opening + Purchases</p>
              </div>
              <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1.5px solid #86EFAC' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>− Closing Stock</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{inr(currentClosing.closingStockValue)}</p>
                <p style={{ fontSize: 11, color: '#15803D', marginTop: 2 }}>Actual physical stock</p>
              </div>
              <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1.5px solid #FDE68A' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#B45309', textTransform: 'uppercase' }}>= Consumed (COGS)</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#D97706', marginTop: 4 }}>{inr(currentClosing.consumedValue)}</p>
                <p style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>Deducted in Monthly P&amp;L</p>
              </div>
            </div>
          </div>
        )}

        {/* Excel Upload Area */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: 24,
          border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 24
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F1B2D' }}>
                {currentClosing ? 'Re-reconcile Closing Stock' : 'Upload Month-End Closing Stock File'}
              </h3>
              <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                Upload the month-end closing Excel workbook (e.g. <code>Stock Closing 30-09-2026.xlsx</code>). Multi-sheet workbooks (Kirana, Packing, Veg, etc.) are fully supported.
              </p>
            </div>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              handleFileSelect(e.dataTransfer.files?.[0]);
            }}
            style={{
              border: `2px dashed ${drag ? '#16A34A' : '#CBD5E1'}`,
              background: drag ? '#F0FDF4' : '#F8FAFC',
              borderRadius: 12, padding: '36px 20px', textAlign: 'center',
              cursor: 'pointer', transition: 'all 0.2s', marginBottom: 16
            }}
          >
            <div style={{ fontSize: 38, marginBottom: 8 }}>📊</div>
            {file ? (
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#0F1B2D' }}>
                  {file.name}
                </p>
                <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · Ready to preview &amp; reconcile
                </p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0F1B2D' }}>
                  Click to select closing stock Excel file, or drag and drop here
                </p>
                <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                  Supports <b>.xlsx, .xls, .csv</b> · Multi-sheet workbooks with Item Name, Mrp, Stock In Hand, and Value
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              💡 <b>Stock Reconciliation:</b> Compares uploaded closing stock against opening stock + purchases to calculate true consumption.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {file && (
                <button
                  type="button"
                  onClick={() => { setFile(null); setPreview(null); }}
                  style={{
                    padding: '8px 16px', borderRadius: 8, background: '#F1F5F9',
                    border: '1px solid #CBD5E1', fontSize: 13, fontWeight: 600, color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Clear File
                </button>
              )}
              <button
                type="button"
                onClick={handleGeneratePreview}
                disabled={!file || busy}
                style={{
                  padding: '9px 22px', borderRadius: 8,
                  background: !file || busy ? '#CBD5E1' : '#0F1B2D',
                  color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700,
                  cursor: !file || busy ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8
                }}
              >
                {busy ? 'Reading & Computing...' : '🔍 Preview Stock Reconciliation'}
              </button>
            </div>
          </div>
        </div>

        {/* PREVIEW & RECONCILIATION SUMMARY */}
        {preview && (
          <div style={{
            background: '#fff', borderRadius: 14, padding: 24,
            border: '1.5px solid #6C63FF', boxShadow: '0 4px 12px rgba(108, 99, 255, 0.08)',
            marginBottom: 24
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#6C63FF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Step 2 · Review &amp; Confirm Reconciliation
                </span>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0F1B2D', marginTop: 2 }}>
                  Stock Reconciliation Preview for {preview.month}
                </h3>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#EEF0FF', color: '#5B21B6', fontWeight: 600 }}>
                  Sheets: {preview.sheetNames.join(', ')}
                </span>
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#F1F5F9', color: '#475569', fontWeight: 600 }}>
                  {preview.totalRows} file rows
                </span>
              </div>
            </div>

            {/* Formula Dashboard Cards */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12, marginBottom: 20, padding: 16, background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0'
            }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>1. Opening Stock</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#6C63FF', marginTop: 4 }}>{inr(preview.openingStockValue)}</p>
                <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Manual previous month import</p>
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>2. (+) Month Purchases</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#0284C7', marginTop: 4 }}>{inr(preview.purchasesValue)}</p>
                <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>All bills logged in {preview.month}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>3. (=) Stock Available</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#0F1B2D', marginTop: 4 }}>{inr(preview.totalAvailableValue)}</p>
                <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Opening + Purchases</p>
              </div>
              <div style={{ background: '#F0FDF4', padding: 10, borderRadius: 8, border: '1.5px solid #86EFAC' }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>4. (−) Closing Stock</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{inr(preview.closingStockValue)}</p>
                <p style={{ fontSize: 11, color: '#15803D', marginTop: 2 }}>Remaining physical stock</p>
              </div>
              <div style={{ background: '#FFFBEB', padding: 10, borderRadius: 8, border: '1.5px solid #FCD34D' }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: '#B45309', textTransform: 'uppercase' }}>5. (=) Inventory Consumed</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#D97706', marginTop: 4 }}>{inr(preview.consumedValue)}</p>
                <p style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>Cost of Goods Sold (COGS)</p>
              </div>
            </div>

            {/* Validation & Diagnostics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>✅</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
                    {preview.matchedCount} Items Matched
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: '#15803D', marginTop: 4 }}>
                  Directly matches existing system products and will update stock balance.
                </p>
              </div>

              {preview.unmatchedCount > 0 && (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                      {preview.unmatchedCount} Unmatched in File
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: '#78350F', marginTop: 4 }}>
                    Items in Excel not yet in system catalog.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, fontWeight: 600, color: '#92400E', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={createUnmatched}
                      onChange={(e) => setCreateUnmatched(e.target.checked)}
                    />
                    Create new products for unmatched items
                  </label>
                </div>
              )}

              {preview.unlistedCount > 0 && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>ℹ️</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                      {preview.unlistedCount} System Items Not in File
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>
                    Products in inventory not present in this closing sheet.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={zeroUnlisted}
                      onChange={(e) => setZeroUnlisted(e.target.checked)}
                    />
                    Zero out remaining stock for unlisted items
                  </label>
                </div>
              )}

              {preview.duplicateRows > 0 && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECDD3', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#991B1B' }}>
                      {preview.duplicateRows} Duplicate Rows Combined
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: '#991B1B', marginTop: 4 }}>
                    Same product repeated in sheet: quantities and values safely added together.
                  </p>
                </div>
              )}
            </div>

            {/* Product Breakdown Search & Filters */}
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  ['all', `All Items (${preview.items.length})`],
                  ['matched', `Matched (${preview.matchedCount})`],
                  ['unmatched', `Unmatched (${preview.unmatchedCount})`],
                ].map(([tabKey, label]) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setPreviewTab(tabKey)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                      border: previewTab === tabKey ? '1.5px solid #0F1B2D' : '1px solid #E2E8F0',
                      background: previewTab === tabKey ? '#0F1B2D' : '#fff',
                      color: previewTab === tabKey ? '#fff' : '#475569', cursor: 'pointer'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search items or categories..."
                value={previewSearch}
                onChange={(e) => setPreviewSearch(e.target.value)}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
                  fontSize: 12.5, width: 220
                }}
              />
            </div>

            {/* Product Table */}
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', zIndex: 1, borderBottom: '1px solid #E2E8F0' }}>
                  <tr style={{ color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '10px 14px' }}>Item Name</th>
                    <th style={{ padding: '10px 14px' }}>Category / Sheet</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Current System Stock</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#16A34A', fontWeight: 800 }}>Closing Stock (File)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Stock Change</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Unit Rate</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0F1B2D' }}>Closing Value</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreviewItems.map((item, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: !item.isMatched ? '#FFFBEB' : idx % 2 === 0 ? '#fff' : '#FAFBFC'
                      }}
                    >
                      <td style={{ padding: '8px 14px', fontWeight: 600, color: '#0F1B2D' }}>
                        {item.name}
                        {item.unit && <span style={{ color: '#94A3B8', fontSize: 11, marginLeft: 6 }}>({item.unit})</span>}
                      </td>
                      <td style={{ padding: '8px 14px', color: '#64748B' }}>
                        <span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                          {item.category || item.sheet || 'General'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#475569' }}>
                        {item.isMatched ? fmtQty(item.currentStock) : '-'}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>
                        {fmtQty(item.closingStock)}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: item.stockChange < 0 ? '#DC2626' : '#16A34A' }}>
                        {item.isMatched ? `${item.stockChange > 0 ? '+' : ''}${fmtQty(item.stockChange)}` : 'New'}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#64748B' }}>
                        {inr(item.rate)}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#0F1B2D' }}>
                        {inr(item.closingValue)}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                        {item.isMatched ? (
                          <span style={{ background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>
                            Matched
                          </span>
                        ) : (
                          <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>
                            New Item
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredPreviewItems.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94A3B8' }}>
                        No items found matching filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Critical Safeguard Callout */}
            <div style={{
              background: '#F8FAFC', border: '1.5px solid #CBD5E1', borderRadius: 10,
              padding: '12px 16px', marginBottom: 20
            }}>
              <p style={{ fontSize: 12.5, color: '#334155' }}>
                🛡️ <b>Reconciliation Safeguards:</b>
                <br />
                • Inventory balances will be updated to match the closing file ({inr(preview.closingStockValue)}).
                <br />
                • Inventory consumed of <b>{inr(preview.consumedValue)}</b> will be recorded in Monthly P&amp;L.
                <br />
                • Historical purchase bills, sales transactions, and ledger entries remain completely untouched.
                <br />
                • <b>Next-month opening stock carry-forward is disabled.</b> Next month will remain at 0 until you manually import it.
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={() => setPreview(null)}
                style={{
                  padding: '9px 18px', borderRadius: 8, background: '#F1F5F9',
                  border: '1px solid #CBD5E1', fontSize: 13, fontWeight: 600, color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={busy}
                style={{
                  padding: '10px 24px', borderRadius: 8, background: '#16A34A',
                  color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)'
                }}
              >
                {busy ? 'Processing...' : `✓ Confirm & Reconcile ${preview.month} Closing Stock`}
              </button>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && preview && (
          <Portal>
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 27, 45, 0.65)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
            }}>
              <div style={{
                background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
                padding: 28, boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
              }}>
                <div style={{ fontSize: 32, marginBottom: 8, textAlign: 'center' }}>⚠️</div>
                <h3 style={{ fontSize: 19, fontWeight: 800, color: '#0F1B2D', textAlign: 'center' }}>
                  Apply Month-End Closing Stock Reconciliation?
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6 }}>
                  Please review the final numbers before updating inventory balances for <b>{preview.month}</b>:
                </p>

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, margin: '20px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                    <span style={{ color: '#64748B' }}>Opening Stock (brought forward):</span>
                    <b>{inr(preview.openingStockValue)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                    <span style={{ color: '#64748B' }}>+ Month Inventory Purchases:</span>
                    <b>{inr(preview.purchasesValue)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderTop: '1px dashed #CBD5E1' }}>
                    <span style={{ color: '#0F1B2D', fontWeight: 600 }}>Total Stock Available:</span>
                    <b>{inr(preview.totalAvailableValue)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: '#16A34A', fontWeight: 700 }}>
                    <span>− Closing Stock Remaining:</span>
                    <span>{inr(preview.closingStockValue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, borderTop: '2px solid #E2E8F0', color: '#D97706', fontWeight: 800 }}>
                    <span>= Inventory Consumed (COGS):</span>
                    <span>{inr(preview.consumedValue)}</span>
                  </div>
                </div>

                <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#1E40AF', marginBottom: 20 }}>
                  ℹ️ <b>Reminder:</b> Next month will NOT receive automatic opening stock. You will manually import it when ready.
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    disabled={busy}
                    style={{
                      padding: '10px 18px', borderRadius: 8, background: '#F1F5F9',
                      border: '1px solid #CBD5E1', fontSize: 13, fontWeight: 600, color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyReconciliation}
                    disabled={busy}
                    style={{
                      padding: '10px 22px', borderRadius: 8, background: '#16A34A',
                      color: '#fff', border: 'none', fontSize: 13, fontWeight: 700,
                      cursor: busy ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {busy ? 'Applying Changes...' : 'Yes, Apply Reconciliation'}
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* View Saved Closing Details Modal */}
        {activeViewClosing && (
          <Portal>
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 27, 45, 0.65)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
            }}>
              <div style={{
                background: '#fff', borderRadius: 16, width: '100%', maxWidth: 800,
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden'
              }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0F1B2D' }}>
                      Reconciliation Details · {activeViewClosing.month}
                    </h3>
                    <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      File: {activeViewClosing.fileName} · Reconciled on {activeViewClosing.reconciledAt ? new Date(activeViewClosing.reconciledAt).toLocaleString('en-IN') : 'N/A'}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveViewClosing(null)}
                    style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B' }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                    <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8 }}>
                      <p style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Opening Stock</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: '#6C63FF', marginTop: 2 }}>{inr(activeViewClosing.openingStockValue)}</p>
                    </div>
                    <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8 }}>
                      <p style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Purchases</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: '#0284C7', marginTop: 2 }}>{inr(activeViewClosing.purchasesValue)}</p>
                    </div>
                    <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8 }}>
                      <p style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Stock Available</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: '#0F1B2D', marginTop: 2 }}>{inr(activeViewClosing.totalAvailableValue)}</p>
                    </div>
                    <div style={{ background: '#F0FDF4', padding: 12, borderRadius: 8 }}>
                      <p style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>Closing Stock</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>{inr(activeViewClosing.closingStockValue)}</p>
                    </div>
                    <div style={{ background: '#FFFBEB', padding: 12, borderRadius: 8 }}>
                      <p style={{ fontSize: 11, color: '#B45309', fontWeight: 600 }}>Consumed (COGS)</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: '#D97706', marginTop: 2 }}>{inr(activeViewClosing.consumedValue)}</p>
                    </div>
                  </div>

                  {activeViewClosing.details?.items && (
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Reconciled Item Breakdown ({activeViewClosing.details.items.length})</h4>
                      <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead style={{ background: '#F8FAFC', position: 'sticky', top: 0 }}>
                            <tr style={{ color: '#64748B', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>
                              <th style={{ padding: '8px 12px' }}>Product</th>
                              <th style={{ padding: '8px 12px' }}>Category</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Closing Qty</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Rate</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeViewClosing.details.items.map((it, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '6px 12px', fontWeight: 600 }}>{it.name}</td>
                                <td style={{ padding: '6px 12px', color: '#64748B' }}>{it.category || it.sheet || '-'}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{fmtQty(it.closingStock)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', color: '#64748B' }}>{inr(it.rate)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700 }}>{inr(it.closingValue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setActiveViewClosing(null)}
                    style={{ padding: '8px 20px', borderRadius: 8, background: '#0F1B2D', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* Saved Reconciliation History Section */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: 24,
          border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F1B2D', marginBottom: 4 }}>
            Saved Month-End Reconciliation History
          </h3>
          <p style={{ fontSize: 12.5, color: '#64748B', marginBottom: 16 }}>
            Audit trail of all recorded closing stock reconciliation reports. Viewing reports does not re-apply stock changes.
          </p>

          {closings.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', background: '#F8FAFC', borderRadius: 10 }}>
              No month-end closing records saved yet. Upload your first closing stock Excel file above.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1.5px solid #E2E8F0' }}>
                    <th style={{ padding: '12px 14px' }}>Month</th>
                    <th style={{ padding: '12px 14px' }}>Reconciled Date</th>
                    <th style={{ padding: '12px 14px' }}>Excel File</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Opening Stock</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Purchases</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Total Available</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', color: '#16A34A', fontWeight: 800 }}>Closing Stock</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', color: '#D97706', fontWeight: 800 }}>Consumed (COGS)</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {closings.map((c) => (
                    <tr key={c.id || c.month} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F1B2D' }}>
                        📅 {c.month}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748B', fontSize: 12 }}>
                        {c.reconciledAt ? new Date(c.reconciledAt).toLocaleDateString('en-IN') : 'N/A'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569', fontSize: 12 }}>
                        📄 {c.fileName || 'Closing Excel'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#6C63FF', fontWeight: 600 }}>
                        {inr(c.openingStockValue)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#0284C7', fontWeight: 600 }}>
                        {inr(c.purchasesValue)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#0F1B2D', fontWeight: 600 }}>
                        {inr(c.totalAvailableValue)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#16A34A', fontWeight: 800 }}>
                        {inr(c.closingStockValue)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#D97706', fontWeight: 800 }}>
                        {inr(c.consumedValue)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setActiveViewClosing(c)}
                            style={{
                              padding: '5px 10px', borderRadius: 6, background: '#F1F5F9',
                              border: '1px solid #CBD5E1', fontSize: 11.5, fontWeight: 600,
                              color: '#0F1B2D', cursor: 'pointer'
                            }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClosing(c.month)}
                            style={{
                              padding: '5px 8px', borderRadius: 6, background: '#FEE2E2',
                              border: 'none', fontSize: 11, fontWeight: 600,
                              color: '#B91C1C', cursor: 'pointer'
                            }}
                            title="Delete closing record"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
