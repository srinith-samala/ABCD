import React, { useState, useRef } from 'react';
import { API } from '../config';
import Portal from './Portal';

const TEMPLATE_CSV =
  'Employee Name,Month,Present Days,Salary,Advance,Net Pay\n' +
  'Ramesh Kumar,2026-10,26,18000,2000,16000\n' +
  'Suresh Patel,2026-10,28,22000,0,22000\n' +
  'Amit Singh,2026-10,25,15000,1000,14000\n' +
  'Sunil Sharma,2026-10,30,25000,3000,22000\n';

function downloadTemplate() {
  const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'payroll-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const inr = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function ImportPayrollModal({ onClose, onDone, initialMonth }) {
  const [step, setStep] = useState('pick'); // 'pick' | 'preview' | 'done'
  const [file, setFile] = useState(null);
  const [targetMonth, setTargetMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const pick = (f) => {
    setError('');
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
      setFile(null);
      setError('Please choose a .csv or .xlsx file');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setFile(null);
      setError('File is too large (max 5 MB)');
      return;
    }
    setFile(f);
  };

  const send = async (preview) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('preview', String(preview));
      if (targetMonth) fd.append('month', targetMonth);

      const res = await fetch(`${API}/api/payroll/import`, {
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
            width: '100%', maxWidth: step === 'preview' ? 700 : 520,
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', gap: 18,
            maxHeight: '90vh', overflowY: 'auto',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0F1B2D' }}>
                Import Payroll (Excel / CSV)
              </h2>
              <p style={{ fontSize: 12.5, color: '#8A94A6', margin: '4px 0 0' }}>
                Upload employee salary, attendance, and advances sheet (.xlsx or .csv)
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
              {/* Fallback month selector */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5B6577', marginBottom: 6 }}>
                  Target Payroll Month (used if file doesn't specify month):
                </label>
                <input
                  type="month"
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAED',
                    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Drag & drop upload area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${drag ? '#2ECC71' : file ? '#10B981' : '#D1D5DB'}`,
                  borderRadius: 12, padding: '28px 16px', textAlign: 'center',
                  background: drag ? '#F0FDF4' : file ? '#F0FDF4' : '#FAFBFC',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv, .xlsx"
                  style={{ display: 'none' }}
                  onChange={(e) => pick(e.target.files[0])}
                />
                <div style={{ fontSize: 36, marginBottom: 8 }}>
                  {file ? '📄' : '📁'}
                </div>
                {file ? (
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#0F1B2D', margin: 0 }}>
                      {file.name}
                    </p>
                    <p style={{ fontSize: 12, color: '#16A34A', margin: '4px 0 0', fontWeight: 600 }}>
                      {(file.size / 1024).toFixed(1)} KB — Ready to analyze
                    </p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: '#0F1B2D', margin: 0 }}>
                      Click to choose or drag & drop payroll file
                    </p>
                    <p style={{ fontSize: 12, color: '#8A94A6', margin: '4px 0 0' }}>
                      Supports Excel (.xlsx) and CSV (.csv) up to 5 MB
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
                  Auto-detects: Name, Salary, Days, Advance, Net Pay
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
                  {busy ? 'Reading File...' : 'Preview Import →'}
                </button>
              </div>
            </>
          )}

          {step === 'preview' && data && (
            <>
              {/* Preview Statistics */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
                background: '#F9FAFB', padding: 12, borderRadius: 10, border: '1px solid #E5E7EB',
              }}>
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Employees</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '2px 0 0' }}>{data.totalRows}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Total Salary</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '2px 0 0' }}>{inr(data.totalSalary)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Advance Deducted</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#EF4444', margin: '2px 0 0' }}>{inr(data.totalAdvance)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Net Payout</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', margin: '2px 0 0' }}>{inr(data.totalNetPay)}</p>
                </div>
              </div>

              <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
                File: <strong>{data.fileName}</strong> &bull; Period(s): <strong>{data.months?.join(', ') || targetMonth}</strong>
              </p>

              {/* Table Preview */}
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead style={{ background: '#F3F4F6', position: 'sticky', top: 0 }}>
                    <tr style={{ textAlign: 'left', color: '#4B5563', fontSize: 11, textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 10px' }}>Employee</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Days</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Salary</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Advance</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows?.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #E5E7EB' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.employeeName}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#6B7280' }}>{r.presentDays}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{inr(r.salary)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#EF4444' }}>{inr(r.advance)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{inr(r.netPay)}</td>
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
                    {busy ? 'Importing...' : `Confirm & Import ${data.totalRows} Records`}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: '#0F1B2D' }}>
                Payroll Imported Successfully!
              </h3>
              <p style={{ fontSize: 13, color: '#5B6577', margin: '0 0 20px' }}>
                {data?.importedCount || 'All'} payroll records have been added to your database.
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

