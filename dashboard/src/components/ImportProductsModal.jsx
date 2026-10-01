import React, { useState, useRef } from 'react';
import { API } from '../config';

const TEMPLATE_CSV =
  'name,category,supplier,cost_price,price,quantity,unit,reorder_level,sku,emoji,description\n' +
  'Full Cream Milk,Dairy,Dairy Delizia,48,55,100,L,20,MILK-001,🥛,Fresh full cream milk\n' +
  'Basmati Rice,Grocery,Agro Mart,95,120,50,kg,10,RICE-001,🍚,\n' +
  'Good Day Biscuits,Snacks,Britannia,22,30,200,pack,25,BISC-001,🍪,\n';

function downloadTemplate() {
  // BOM so Excel shows emoji / ₹ correctly
  const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'products-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ImportProductsModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
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
      setError('Please choose a .csv or .xlsx file (old .xls files: open in Excel and Save As .xlsx)');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setFile(null);
      setError('File is too large (max 5 MB)');
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/api/stock/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }, // no Content-Type: browser sets the multipart boundary
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

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>Import products</h3>
          <button onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: '#8A94A6', marginBottom: 16 }}>
          Upload a CSV or Excel (.xlsx) file. Required columns: <b>name</b> and <b>price</b>. Optional: category, supplier, cost_price, quantity, unit, reorder_level, sku, emoji, description.
          Products that already exist (same name or SKU) are skipped, not changed.
        </p>

        {!result && (
          <>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
              style={{
                border: `2px dashed ${drag ? '#2ECC71' : '#D0D5DD'}`, background: drag ? '#F0FBF4' : '#FAFBFC',
                borderRadius: 12, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 30, marginBottom: 6 }}>📄</div>
              {file
                ? <p style={{ fontSize: 14, fontWeight: 600 }}>{file.name} <span style={{ color: '#8A94A6', fontWeight: 400 }}>({(file.size / 1024).toFixed(1)} KB)</span></p>
                : <p style={{ fontSize: 13, color: '#8A94A6' }}>Click to choose a file, or drag &amp; drop it here</p>}
              <input ref={inputRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
            </div>

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
              <span style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#D6F5E3', color: '#16A34A' }}>✓ Added: {result.created}</span>
              <span style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#FEF3C7', color: '#92400E' }}>Skipped: {result.skippedCount}</span>
              <span style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#FEE2E2', color: '#EF4444' }}>Errors: {result.errorCount}</span>
            </div>

            {result.errorCount > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Rows with errors (not imported)</p>
                <div style={{ maxHeight: 130, overflowY: 'auto', background: '#FAFBFC', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
                  {result.errors.map((e, i) => <p key={i} style={{ padding: '2px 0' }}>Row {e.row}{e.name ? ` (${e.name})` : ''}: {e.message}</p>)}
                  {result.errorCount > result.errors.length && <p style={{ color: '#8A94A6' }}>…and {result.errorCount - result.errors.length} more</p>}
                </div>
              </div>
            )}

            {result.skippedCount > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Skipped</p>
                <div style={{ maxHeight: 110, overflowY: 'auto', background: '#FAFBFC', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
                  {result.skipped.map((e, i) => <p key={i} style={{ padding: '2px 0' }}>Row {e.row} ({e.name}): {e.reason}</p>)}
                  {result.skippedCount > result.skipped.length && <p style={{ color: '#8A94A6' }}>…and {result.skippedCount - result.skipped.length} more</p>}
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
    </div>
  );
}
