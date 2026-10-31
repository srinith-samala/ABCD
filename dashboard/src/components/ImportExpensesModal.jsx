import React, { useState, useRef } from 'react';
import { API } from '../config';
import Portal from './Portal';

const TEMPLATE_CSV =
  'Date,Title,Amount,Head,Paid Via,Vendor\n' +
  '2026-10-01,Shop Rent,35000,Rent,Bank,Landlord\n' +
  '2026-10-02,Electricity / Light Bill,4500,Utilities,Bank,MSEDCL\n' +
  '2026-10-03,Gas Cylinders,3200,Gas,Cash,Bharat Gas\n' +
  '2026-10-04,Vegetables & Fruits,1800,Food,Cash,Local Mandi\n' +
  '2026-10-05,Packing Containers,2400,Packaging,Cash,Shree Packaging\n' +
  '2026-10-06,Plumbing & Repairs,1200,Maintenance,Cash,Local Plumber\n';

function downloadTemplate() {
  const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'expenses-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const inr = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const PAYMENT_MODES = ['Cash', 'Bank', 'ICICI', 'SVC', 'UPI', 'Other'];

export default function ImportExpensesModal({ onClose, onDone, initialDate }) {
  const [step, setStep] = useState('pick'); // 'pick' | 'preview' | 'done'
  const [file, setFile] = useState(null);
  const [fallbackDate, setFallbackDate] = useState(initialDate || new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const pick = (f) => {
    setError('');
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.pdf')) {
      setFile(null);
      setError('Please choose a CSV (.csv), Excel (.xlsx / .xls), or PDF (.pdf) file');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setFile(null);
      setError('File is too large (max 8 MB)');
      return;
    }
    setFile(f);
    if (/bank/i.test(name)) setPaymentMode('Bank');
    else if (/cash/i.test(name)) setPaymentMode('Cash');
    else if (/icici/i.test(name)) setPaymentMode('ICICI');
    else if (/svc/i.test(name)) setPaymentMode('SVC');
  };

  const send = async (preview) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('preview', String(preview));
      if (fallbackDate) fd.append('date', fallbackDate);
      if (paymentMode) fd.append('paymentMode', paymentMode);

      const res = await fetch(`${API}/api/expenses/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Import failed (${res.status}).`);
        return;
      }

      setData(body);
      setStep(preview ? 'preview' : 'done');
      if (!preview) onDone();
    } catch (err) {
      console.error(err);
      setError('Network error uploading file. Is the server running?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15, 27, 45, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 16,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: step === 'preview' ? 760 : 540,
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', gap: 18,
            maxHeight: '90vh', overflowY: 'auto',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0F1B2D' }}>
                Import Expenses (CSV / Excel / PDF)
              </h2>
              <p style={{ fontSize: 12.5, color: '#8A94A6', margin: '4px 0 0' }}>
                Upload your bank statement, cash book, bills, or expense list
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: '#F4F5F7', border: 'none', borderRadius: 8,
                width: 32, height: 32, cursor: 'pointer', fontSize: 14,
                color: '#5B6577', fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>

          {error && (
            <div style={{
              background: '#FEE2E2', borderLeft: '4px solid #EF4444',
              color: '#991B1B', padding: '10px 14px', borderRadius: 8,
              fontSize: 12.5,
            }}>
              {error}
            </div>
          )}

          {step === 'pick' && (
            <>
              {/* Fallback settings */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5B6577', marginBottom: 6 }}>
                    Default Expense Date:
                  </label>
                  <input
                    type="date"
                    value={fallbackDate}
                    onChange={(e) => setFallbackDate(e.target.value)}
                    style={{
                      padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAED',
                      fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5B6577', marginBottom: 6 }}>
                    Default Payment Mode:
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    style={{
                      padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAED',
                      fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
                    }}
                  >
                    {PAYMENT_MODES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Drag & drop upload area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${drag ? '#2ECC71' : file ? '#10B981' : '#D1D5DB'}`,
                  borderRadius: 12, padding: '30px 16px', textAlign: 'center',
                  background: drag ? '#F0FDF4' : file ? '#F0FDF4' : '#FAFBFC',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls, .pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => pick(e.target.files[0])}
                />
                <div style={{ fontSize: 38, marginBottom: 8 }}>
                  {file?.name.endsWith('.pdf') ? '📕' : file ? '📗' : '📂'}
                </div>
                {file ? (
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#0F1B2D', margin: 0 }}>
                      {file.name}
                    </p>
                    <p style={{ fontSize: 12, color: '#16A34A', margin: '4px 0 0', fontWeight: 600 }}>
                      {(file.size / 1024).toFixed(1)} KB &bull; Ready to scan
                    </p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: '#0F1B2D', margin: 0 }}>
                      Click to choose or drag & drop file
                    </p>
                    <p style={{ fontSize: 12, color: '#8A94A6', margin: '4px 0 0' }}>
                      Supports CSV (.csv), Excel (.xlsx, .xls), and PDF statements (.pdf)
                    </p>
                  </div>
                )}
              </div>

              {/* Template link */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  style={{
                    background: 'none', border: 'none', color: '#16A34A',
                    fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, padding: 0,
                  }}
                >
                  📥 Download Sample CSV Template
                </button>
                <span style={{ fontSize: 11.5, color: '#8A94A6' }}>
                  Auto-categorizes Food, Rent, Gas, Bills, etc.
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '9px 18px', borderRadius: 10, background: '#F4F5F7',
                    border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!file || busy}
                  onClick={() => send(true)}
                  style={{
                    padding: '9px 20px', borderRadius: 10,
                    background: '#2ECC71', color: '#fff', border: 'none',
                    fontSize: 13, fontWeight: 600, cursor: !file || busy ? 'not-allowed' : 'pointer',
                    opacity: !file || busy ? 0.6 : 1,
                  }}
                >
                  {busy ? 'Scanning File...' : 'Preview Expenses →'}
                </button>
              </div>
            </>
          )}

          {step === 'preview' && data && (
            <>
              {/* Summary Stats */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10,
                background: '#F9FAFB', padding: 12, borderRadius: 10, border: '1px solid #E5E7EB',
              }}>
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Total Entries</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '2px 0 0' }}>{data.totalRows}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Total Outflow</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#EF4444', margin: '2px 0 0' }}>{inr(data.totalAmount)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Top Category</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: '4px 0 0' }}>
                    {Object.keys(data.groups || {})[0] || 'General'}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Payment Mode</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: '4px 0 0' }}>
                    {Object.keys(data.paymentModes || {})[0] || paymentMode}
                  </p>
                </div>
              </div>

              <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
                File: <strong>{data.fileName}</strong> &bull; Showing preview of parsed expense lines:
              </p>

              {/* Table Preview */}
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead style={{ background: '#F3F4F6', position: 'sticky', top: 0 }}>
                    <tr style={{ textAlign: 'left', color: '#4B5563', fontSize: 11, textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 10px' }}>Date</th>
                      <th style={{ padding: '8px 10px' }}>Title</th>
                      <th style={{ padding: '8px 10px' }}>Head / Category</th>
                      <th style={{ padding: '8px 10px' }}>Mode</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows?.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #E5E7EB' }}>
                        <td style={{ padding: '8px 10px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                          {new Date(r.expenseDate).toLocaleDateString('en-GB', { timeZone: 'UTC' })}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#111827' }}>
                          {r.title}
                          {r.vendor && <div style={{ fontSize: 10, color: '#8A94A6' }}>{r.vendor}</div>}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: r.group === 'Rent' ? '#FEF3C7' : r.group === 'Food' ? '#DCFCE7' : '#E0E7FF',
                            color: r.group === 'Rent' ? '#92400E' : r.group === 'Food' ? '#166534' : '#3730A3',
                          }}>
                            {r.group || r.category}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: '#6B7280' }}>{r.paymentMode}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>
                          {inr(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setStep('pick')}
                  style={{
                    padding: '8px 16px', borderRadius: 8, background: '#F3F4F6',
                    border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  &larr; Choose Different File
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: '9px 18px', borderRadius: 10, background: '#F4F5F7',
                      border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send(false)}
                    style={{
                      padding: '9px 22px', borderRadius: 10,
                      background: '#2ECC71', color: '#fff', border: 'none',
                      fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? 'Importing...' : `Confirm & Import ${data.totalRows} Expenses`}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: '#0F1B2D' }}>
                Expenses Imported Successfully!
              </h3>
              <p style={{ fontSize: 13, color: '#5B6577', margin: '0 0 20px' }}>
                {data?.importedCount || 'All'} expense records have been added to your database.
              </p>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '9px 24px', borderRadius: 10, background: '#2ECC71',
                  color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

