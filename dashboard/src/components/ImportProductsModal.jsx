import React, { useState, useRef } from 'react';
import { API } from '../config';
import { fmtQty } from '../utils';
import Portal from './Portal';

const TEMPLATE_CSV =
  'name,category,supplier,supplier_phone,price,quantity,unit,reorder_level,sku,emoji,description\n' +
  'Milk,Dairy,Lalanji\'s Dairy Products,9579020351,59,4,ltr,5,MILK-001,🥛,\n' +
  'Basmati Rice,Grocery,Agro Mart,,95,50,kg,10,RICE-001,🍚,\n' +
  'Paneer,Dairy,Lalanji\'s Dairy Products,9579020351,330,2,kg,2,PAN-001,🧀,\n';

function downloadTemplate() {
  // BOM so Excel shows emoji / ₹ correctly
  const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'inventory-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const pill = (bg, color, text) => (
  <span style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: bg, color }}>{text}</span>
);
const btn = (primary, disabled) => ({
  padding: '9px 20px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600,
  background: primary ? '#2ECC71' : '#F4F5F7', color: primary ? '#fff' : '#0F1B2D',
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});

export default function ImportProductsModal({ onClose, onDone }) {
  const [step, setStep] = useState('pick'); // pick -> preview -> done
  const [file, setFile] = useState(null);
  const [recordPurchase, setRecordPurchase] = useState(false);
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
      setError('Please choose a .csv or .xlsx file (old .xls files: open in Excel and Save As .xlsx)');
      return;
    }
    if (f.size > 5 * 1024 * 1024) { setFile(null); setError('File is too large (max 5 MB)'); return; }
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
      fd.append('recordPurchase', String(recordPurchase));
      const res = await fetch(`${API}/api/stock/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }, // no Content-Type: browser sets the multipart boundary
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || 'Import failed'); return; }
      setData(body);
      setStep(preview ? 'preview' : 'done');
      if (!preview) onDone();
    } catch (err) {
      console.error(err);
      setError('Error connecting to server');
    } finally {
      setBusy(false);
    }
  };

  const nothingToDo = data && data.toCreateCount === 0 && data.addUpCount === 0;

  return (
    <Portal><div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>Import stock from CSV / Excel</h3>
          <button onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>

        {step === 'pick' && (
          <>
            <p style={{ fontSize: 13, color: '#8A94A6', marginBottom: 16 }}>
              Required column: <b>name</b>. Optional: quantity, unit, price, category, supplier, supplier_phone, reorder_level, sku, emoji, description.
              <br /><b>New items</b> are created. <b>Items that already exist get this file's quantity added to their stock</b> (4 L milk + 2 L in the file = 6 L).
              You will see a preview first, nothing changes until you confirm.
            </p>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
              style={{ border: `2px dashed ${drag ? '#2ECC71' : '#D0D5DD'}`, background: drag ? '#F0FBF4' : '#FAFBFC', borderRadius: 12, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}
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
              <button onClick={onClose} style={btn(false)}>Cancel</button>
              <button onClick={() => send(true)} disabled={!file || busy} style={btn(true, !file || busy)}>{busy ? 'Checking...' : 'Preview'}</button>
            </div>
          </>
        )}

        {step === 'preview' && data && (
          <>
            <p style={{ fontSize: 13, color: '#8A94A6', marginBottom: 12 }}>Nothing has been saved yet. This is what will happen:</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              {pill('#D6F5E3', '#16A34A', `New items: ${data.toCreateCount}`)}
              {pill('#EEF0FF', '#6C63FF', `Stock added to existing: ${data.addUpCount}`)}
              {data.errorCount > 0 && pill('#FEE2E2', '#EF4444', `Errors: ${data.errorCount}`)}
              {data.skippedCount > 0 && pill('#FEF3C7', '#92400E', `Skipped: ${data.skippedCount}`)}
            </div>

            {data.mergedCount > 0 && (
              <p style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
                {data.mergedCount} repeated row(s) in the file were combined (their quantities are added together).
              </p>
            )}

            {data.addUpCount > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Existing items, stock will change</p>
                <div style={{ maxHeight: 170, overflowY: 'auto', background: '#FAFBFC', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
                  {data.addUps.map((a, i) => (
                    <p key={i} style={{ padding: '2px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{a.name}</span>
                      <span style={{ color: '#6C63FF', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtQty(a.before)} → {fmtQty(a.after)} {a.unit || ''} (+{fmtQty(a.add)})</span>
                    </p>
                  ))}
                  {data.addUpCount > data.addUps.length && <p style={{ color: '#8A94A6' }}>…and {data.addUpCount - data.addUps.length} more</p>}
                </div>
              </div>
            )}

            {data.toCreateCount > 0 && (
              <p style={{ fontSize: 12, color: '#16A34A', background: '#F0FBF4', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
                New: <b>{data.newNames.join(', ')}</b>{data.toCreateCount > data.newNames.length ? ` …and ${data.toCreateCount - data.newNames.length} more` : ''}
              </p>
            )}

            {data.errorCount > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Rows with errors (will not be imported)</p>
                <div style={{ maxHeight: 110, overflowY: 'auto', background: '#FAFBFC', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
                  {data.errors.map((e, i) => <p key={i} style={{ padding: '2px 0' }}>Row {e.row}{e.name ? ` (${e.name})` : ''}: {e.message}</p>)}
                </div>
              </div>
            )}

            {data.ignoredSheets?.length > 0 && (
              <p style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
                Only the stock sheet is used. Not imported: <b>{data.ignoredSheets.join(', ')}</b>.
              </p>
            )}

            {data.addUpCount > 0 && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FAFBFC', borderRadius: 10, padding: '10px 12px', marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={recordPurchase} onChange={e => setRecordPurchase(e.target.checked)} style={{ marginTop: 3 }} />
                <span style={{ fontSize: 12.5 }}>
                  <b>Also create a Stock In order for the added stock (optional)</b>
                  <span style={{ display: 'block', color: '#8A94A6', marginTop: 2 }}>
                    Normally leave this OFF: importing inventory only updates stock and does not touch Orders. Tick only if you want it listed under Orders too.
                  </span>
                </span>
              </label>
            )}

            {error && <p style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 13, padding: '10px 12px', borderRadius: 10, marginBottom: 14 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setStep('pick'); setData(null); }} style={btn(false)}>Back</button>
              <button onClick={() => send(false)} disabled={busy || nothingToDo} style={btn(true, busy || nothingToDo)}>{busy ? 'Importing...' : 'Confirm & import'}</button>
            </div>
          </>
        )}

        {step === 'done' && data && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
              {pill('#D6F5E3', '#16A34A', `✓ New items: ${data.created}`)}
              {pill('#EEF0FF', '#6C63FF', `Stock added to: ${data.added}`)}
              {data.errorCount > 0 && pill('#FEE2E2', '#EF4444', `Errors: ${data.errorCount}`)}
            </div>
            {data.added > 0 && data.recordedPurchase && (
              <p style={{ fontSize: 12, color: '#16A34A', background: '#F0FBF4', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
                Recorded as purchases: ₹{Number(data.recordedTotal || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
            )}
            {(data.suppliersAdded > 0 || data.suppliersUpdated > 0) && (
              <p style={{ fontSize: 12, color: '#16A34A', background: '#F0FBF4', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
                Suppliers: {data.suppliersAdded} added, {data.suppliersUpdated} phone number(s) filled in.
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setStep('pick'); setData(null); setFile(null); }} style={btn(false)}>Import another</button>
              <button onClick={onClose} style={btn(true)}>Done</button>
            </div>
          </>
        )}
      </div>
    </div></Portal>
  );
}
