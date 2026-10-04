import React, { useState, useRef } from 'react';
import { API } from '../config';
import Portal from './Portal';

const TEMPLATE_CSV =
  'date,type,product,quantity,unit,total,category,supplier,supplier_phone,emoji\n' +
  '2026-10-02,PURCHASE,Milk,2.5,ltr,147.5,Dairy,Lalanji\'s Dairy Products,9579020351,🥛\n' +
  '2026-10-02,PURCHASE,Paneer,2,kg,660,Dairy,Lalanji\'s Dairy Products,9579020351,🧀\n' +
  '2026-10-02,PURCHASE,Dress Broiler Chicken,4,kg,960,Meat,Farhaj Chicken Shop,8446678688,🐔\n';

function downloadTemplate() {
  const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bills-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function ImportOrdersModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [updateStock, setUpdateStock] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const pick = (f) => {
    setError('');
    setResult(null);
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
      setFile(null);
      setError('Please choose a .csv or .xlsx file');
      return;
    }
    if (f.size > 5 * 1024 * 1024) { setFile(null); setError('File is too large (max 5 MB)'); return; }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('updateStock', String(updateStock));
      const res = await fetch(`${API}/api/transactions/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Import failed');
      else { setResult(data); if (data.created > 0) onDone(); }
    } catch (err) {
      console.error(err);
      setError('Error connecting to server');
    } finally {
      setUploading(false);
    }
  };

  const pill = (bg, color, text) => (
    <span style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: bg, color }}>{text}</span>
  );

  return (
    <Portal><div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>Import bills / transactions</h3>
          <button onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: '#8A94A6', marginBottom: 16 }}>
          Upload a CSV or Excel (.xlsx) with one row per bill line. Required columns: <b>product</b>, <b>quantity</b>, <b>total</b>.
          Optional: date (YYYY-MM-DD), type (PURCHASE or SALE, default PURCHASE), unit, category, supplier, supplier_phone, emoji.
          Products that don't exist yet are created automatically for purchases. Rows that are already recorded are skipped, so uploading the same file twice is safe.
        </p>

        {!result && (
          <>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
              style={{ border: `2px dashed ${drag ? '#2ECC71' : '#D0D5DD'}`, background: drag ? '#F0FBF4' : '#FAFBFC', borderRadius: 12, padding: '26px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}
            >
              <div style={{ fontSize: 30, marginBottom: 6 }}>🧾</div>
              {file
                ? <p style={{ fontSize: 14, fontWeight: 600 }}>{file.name} <span style={{ color: '#8A94A6', fontWeight: 400 }}>({(file.size / 1024).toFixed(1)} KB)</span></p>
                : <p style={{ fontSize: 13, color: '#8A94A6' }}>Click to choose a file, or drag &amp; drop it here</p>}
              <input ref={inputRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
            </div>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FAFBFC', borderRadius: 10, padding: '10px 12px', marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={updateStock} onChange={e => setUpdateStock(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 12.5 }}>
                <b>Also add these quantities to stock</b>
                <span style={{ display: 'block', color: '#8A94A6', marginTop: 2 }}>
                  Untick this if your Inventory already includes these items (the bills are only being recorded for the books).
                </span>
              </span>
            </label>

            <button onClick={downloadTemplate} style={{ border: 'none', background: 'none', color: '#16A34A', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
              ⬇ Download sample template (CSV)
            </button>

            {error && <p style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 13, padding: '10px 12px', borderRadius: 10, marginBottom: 14 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={upload} disabled={!file || uploading} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: !file || uploading ? 'not-allowed' : 'pointer', opacity: !file || uploading ? 0.6 : 1 }}>
                {uploading ? 'Importing...' : 'Import'}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              {pill('#D6F5E3', '#16A34A', `✓ Added: ${result.created} (${inr(result.totalAmount)})`)}
              {pill('#FEF3C7', '#92400E', `Already recorded: ${result.skippedCount}`)}
              {pill('#FEE2E2', '#EF4444', `Errors: ${result.errorCount}`)}
            </div>

            {!result.updateStock && result.created > 0 && (
              <p style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>Stock levels were not changed.</p>
            )}

            {result.newProducts?.length > 0 && (
              <p style={{ fontSize: 12, color: '#16A34A', background: '#F0FBF4', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
                New products created: <b>{result.newProducts.join(', ')}</b>
              </p>
            )}

            {result.errorCount > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Rows with errors (not imported)</p>
                <div style={{ maxHeight: 130, overflowY: 'auto', background: '#FAFBFC', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
                  {result.errors.map((e, i) => <p key={i} style={{ padding: '2px 0' }}>Row {e.row}{e.name ? ` (${e.name})` : ''}: {e.message}</p>)}
                </div>
              </div>
            )}

            {result.skippedCount > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Skipped (already recorded)</p>
                <div style={{ maxHeight: 110, overflowY: 'auto', background: '#FAFBFC', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
                  {result.skipped.map((e, i) => <p key={i} style={{ padding: '2px 0' }}>Row {e.row} ({e.name})</p>)}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setResult(null); setFile(null); }} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Import another</button>
              <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Done</button>
            </div>
          </>
        )}
      </div>
    </div></Portal>
  );
}
