import React, { useState, useRef } from 'react';
import { API } from '../config';
import { fmtQty, guessDateFromName } from '../utils';
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

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function ImportProductsModal({ onClose, onDone, initialDate }) {
  const [step, setStep] = useState('pick'); // pick -> preview -> done
  const [file, setFile] = useState(null);
  const [importType, setImportType] = useState('PURCHASE'); // 'PURCHASE' | 'OPENING_STOCK'
  const [billDate, setBillDate] = useState(() => {
    if (initialDate) return initialDate;
    // Default to Indian calendar date
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  });
  const [recordPurchase, setRecordPurchase] = useState(true);
  const [customTotal, setCustomTotal] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [dateFromName, setDateFromName] = useState('');
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
    setAllowDuplicate(false);
    const guessed = guessDateFromName(f.name);
    setDateFromName(guessed);
    if (guessed) setBillDate(guessed); // e.g. Bills_02_Oct_2026.xlsx -> 2 Oct 2026
    if (/open|opening/i.test(f.name)) {
      setImportType('OPENING_STOCK');
    }
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
      fd.append('importType', importType);
      fd.append('isOpeningStock', String(importType === 'OPENING_STOCK'));
      fd.append('billDate', billDate);
      if (customTotal) fd.append('customTotal', customTotal);
      if (allowDuplicate) fd.append('allowDuplicate', 'true');
      const res = await fetch(`${API}/api/stock/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }, // no Content-Type: browser sets the multipart boundary
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || `Import failed (server answered ${res.status}). Please make sure the latest backend is deployed.`); return; }
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
  const totalUnits = data ? (data.totalUnitsToAdd || data.addUps?.reduce((s, a) => s + (Number(a.add) || 0), 0) || 0) : 0;
  const totalCost = data ? (data.estimatedBillCost || data.addUps?.reduce((s, a) => s + (Number(a.totalCost) || 0), 0) || 0) : 0;

  return (
    <Portal><div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>
              {importType === 'OPENING_STOCK' ? '📦 Import Month Opening Stock' : '🛒 Import Stock / Daily Inventory Bill'}
            </h3>
            <p style={{ fontSize: 12, color: '#8A94A6', marginTop: 2 }}>
              {importType === 'OPENING_STOCK'
                ? 'Upload opening stock spreadsheet to add to inventory and establish month opening stock'
                : 'Upload supplier bill or stock Excel to log date-categorized inventory'}
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>

        {step === 'pick' && (
          <>
            {/* Choose Import Nature */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setImportType('PURCHASE')}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10,
                  border: `2px solid ${importType === 'PURCHASE' ? '#2ECC71' : '#E2E8F0'}`,
                  background: importType === 'PURCHASE' ? '#F0FDF4' : '#fff',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: importType === 'PURCHASE' ? '#166534' : '#0F1B2D' }}>
                  🛒 Purchases / Daily Bill
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Records as purchase &amp; adds to stock
                </div>
              </button>
              <button
                type="button"
                onClick={() => setImportType('OPENING_STOCK')}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10,
                  border: `2px solid ${importType === 'OPENING_STOCK' ? '#6C63FF' : '#E2E8F0'}`,
                  background: importType === 'OPENING_STOCK' ? '#F5F3FF' : '#fff',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: importType === 'OPENING_STOCK' ? '#5B21B6' : '#0F1B2D' }}>
                  📦 Month Opening Stock
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Sets month opening &amp; adds to stock
                </div>
              </button>
            </div>

            <div style={{ background: '#F4F7FB', borderRadius: 12, padding: '12px 16px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F1B2D' }}>
                  📅 {importType === 'OPENING_STOCK' ? 'Select Opening Stock Date:' : 'Select Bill / Inventory Date:'}
                </span>
                <input
                  type="date"
                  value={billDate}
                  onChange={e => setBillDate(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#fff' }}
                />
              </label>
            </div>

            {importType === 'OPENING_STOCK' && (
              <p style={{ fontSize: 12, color: '#5B21B6', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                ℹ️ <b>Opening Stock:</b> This will add quantities to current inventory, preserve all existing purchase bills, and record as Opening Stock for <b>{billDate.slice(0, 7)}</b> in P&amp;L.
              </p>
            )}

            {file && dateFromName && <p style={{ fontSize: 12, color: '#166534', background: '#F0FDF4', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>📅 Date taken from the file name: <b>{dateFromName}</b> (change it above if it is wrong).</p>}
            <p style={{ fontSize: 12.5, color: '#64748B', marginBottom: 14 }}>
              Required column: <b>name / item name</b>. Optional: quantity / stock in hand, price / mrp, unit, category.
              <br />Multi-sheet workbooks (e.g. Kirana, Veg, Packing) are automatically processed!
            </p>

            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
              style={{ border: `2px dashed ${drag ? '#2ECC71' : '#CBD5E1'}`, background: drag ? '#F0FBF4' : '#FAFBFC', borderRadius: 12, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}
            >
              <div style={{ fontSize: 32, marginBottom: 6 }}>📄</div>
              {file
                ? <p style={{ fontSize: 14, fontWeight: 600 }}>{file.name} <span style={{ color: '#8A94A6', fontWeight: 400 }}>({(file.size / 1024).toFixed(1)} KB)</span></p>
                : <p style={{ fontSize: 13, color: '#8A94A6' }}>Click to choose a file (.xlsx / .csv), or drag &amp; drop it here</p>}
              <input ref={inputRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
            </div>
            <button onClick={downloadTemplate} style={{ border: 'none', background: 'none', color: '#16A34A', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
              ⬇ Download sample template (CSV)
            </button>
            {error && <p style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 13, padding: '10px 12px', borderRadius: 10, marginBottom: 14 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btn(false)}>Cancel</button>
              <button onClick={() => send(true)} disabled={!file || busy} style={btn(true, !file || busy)}>{busy ? 'Reading File...' : 'Preview & Verify'}</button>
            </div>
          </>
        )}

        {step === 'preview' && data && (
          <>
            {/* Bill Summary Card */}
            <div style={{
              background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
              border: '1.5px solid #86EFAC', borderRadius: 12, padding: '14px 18px', marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10, borderBottom: '1px solid #BBF7D0', paddingBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>📅</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Inventory Bill Date:</span>
                  <input
                    type="date"
                    value={billDate}
                    onChange={e => setBillDate(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #86EFAC', fontSize: 13, fontWeight: 700, background: '#fff' }}
                  />
                </div>
                <span style={{ fontSize: 12, color: '#15803D', fontWeight: 600 }}>File: {file?.name}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 11, color: '#15803D', textTransform: 'uppercase', fontWeight: 700 }}>Total Items</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#0F1B2D', marginTop: 2 }}>{data.addUpCount + data.toCreateCount} items</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#15803D', textTransform: 'uppercase', fontWeight: 700 }}>Total Quantity</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>{fmtQty(totalUnits)} units</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#15803D', textTransform: 'uppercase', fontWeight: 700 }}>Total Bill Cost</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#0F1B2D', marginTop: 2 }}>{inr(totalCost)}</p>
                </div>
              </div>
            </div>

            {data.amountSource === 'total-column' && (
              <p style={{ fontSize: 12.5, color: '#166534', background: '#DCFCE7', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                ✅ Amounts are taken exactly from the file's <b>Total amount column{data.totalColumn ? ` (column ${data.totalColumn})` : ''}</b> - GST included. Price x quantity is not used.
              </p>
            )}
            {data.amountSource === 'mixed' && (
              <p style={{ fontSize: 12.5, color: '#92400E', background: '#FEF3C7', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                ⚠️ {data.rowsWithoutTotal} row(s) have no value in the total column, so for those only price x quantity was used (GST not included). Check the lines below.
              </p>
            )}
            {data.amountSource === 'calculated' && (
              <p style={{ fontSize: 12.5, color: '#991B1B', background: '#FEE2E2', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                ⚠️ No total / amount column was found in this file, so amounts are <b>price x quantity</b> (GST not included). If the file has the bill amount, rename that column heading to "Total" and upload again - or type the bill total below.
              </p>
            )}
            {(data.notes || []).map((n, i) => (
              <p key={i} style={{ fontSize: 12, color: '#075985', background: '#E0F2FE', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>ℹ️ {n}</p>
            ))}
            {data.fileTotal !== null && data.fileTotal !== undefined && !data.totalMismatch && data.customTotal === null && (
              <p style={{ fontSize: 12, color: '#166534', background: '#DCFCE7', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>✅ Matches the TOTAL line of your file ({inr(data.fileTotal)}).</p>
            )}
            {data.totalMismatch && (
              <p style={{ fontSize: 12.5, color: '#991B1B', background: '#FEE2E2', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                ⚠️ The TOTAL line in your file says <b>{inr(data.fileTotal)}</b> but the item lines add up to <b>{inr(data.estimatedBillCost)}</b>. Check the lines below, or type the correct bill total underneath.
              </p>
            )}
            {data.customTotal !== null && data.customTotal !== undefined && (
              <p style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                Bill total set to <b>{inr(data.customTotal)}</b> (the file's lines added up to {inr(data.calculatedTotal)}; amounts were scaled to match).
              </p>
            )}
            {(data.fileDates || []).length > 0 && (
              <p style={{ fontSize: 12, color: '#075985', background: '#E0F2FE', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                📅 This file has its own dates ({data.fileDates.slice(0, 6).join(', ')}{data.fileDates.length > 6 ? ' ...' : ''}). Lines are recorded on those dates.
              </p>
            )}
            {(data.duplicateBills || []).length > 0 && (
              <div style={{ background: '#FEE2E2', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                <p style={{ fontSize: 12.5, color: '#991B1B' }}>⚠️ Already recorded on this date: <b>{data.duplicateBills.slice(0, 6).join(', ')}</b>. Importing them again doubles the stock and the cost.</p>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12.5, cursor: 'pointer', color: '#7F1D1D' }}>
                  <input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} /> Import anyway
                </label>
              </div>
            )}
            {(data.bills || []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Bills in this file:</p>
                <div style={{ background: '#FAFBFC', borderRadius: 10, padding: '4px 12px', fontSize: 12 }}>
                  {data.bills.map((b, i) => (
                    <p key={i} style={{ padding: '6px 0', display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: i < data.bills.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <span>🧾 {b.ref} <span style={{ color: '#8A94A6' }}>· {b.items} item{b.items === 1 ? '' : 's'}</span></span>
                      <b style={{ whiteSpace: 'nowrap' }}>{inr(b.total)}</b>
                    </p>
                  ))}
                </div>
              </div>
            )}
            {(data.lines || []).length > 0 && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Check every line ({data.lines.length})</summary>
                <div style={{ maxHeight: 220, overflowY: 'auto', background: '#FAFBFC', borderRadius: 10, padding: '6px 12px', fontSize: 12, marginTop: 6 }}>
                  {data.lines.map((l, i) => (
                    <p key={i} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #F1F5F9' }}>
                      <span>{l.name}{l.isNew ? <span style={{ color: '#16A34A' }}> (new)</span> : null}</span>
                      <span style={{ whiteSpace: 'nowrap', color: '#0F1B2D' }}>{fmtQty(l.quantity)} {l.unit} x {inr(l.rate)} = <b>{inr(l.total)}</b></span>
                    </p>
                  ))}
                </div>
              </details>
            )}
            {(data.checks || []).length > 0 && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#92400E' }}>{data.checks.length} line(s) where price x quantity differs from Total Price</summary>
                <div style={{ background: '#FFFBEB', borderRadius: 10, padding: '6px 12px', fontSize: 12, marginTop: 6 }}>
                  {data.checks.map((c, i) => <p key={i} style={{ padding: '3px 0' }}><b>{c.name}</b>: {c.message}</p>)}
                </div>
              </details>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#64748B' }}>Bill total is different? Type it:</label>
              <input type="number" min="0" step="0.01" value={customTotal} onChange={e => setCustomTotal(e.target.value)} placeholder="optional" style={{ width: 120, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13 }} />
              <button onClick={() => send(true)} disabled={busy} style={{ ...btn(false, busy), padding: '6px 12px', fontSize: 12 }}>Recalculate</button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {pill('#D6F5E3', '#16A34A', `New items: ${data.toCreateCount}`)}
              {pill('#EEF0FF', '#6C63FF', `Stock added to existing: ${data.addUpCount}`)}
              {data.errorCount > 0 && pill('#FEE2E2', '#EF4444', `Errors: ${data.errorCount}`)}
              {data.skippedCount > 0 && pill('#FEF3C7', '#92400E', `Skipped: ${data.skippedCount}`)}
            </div>

            {data.mergedCount > 0 && (
              <p style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
                {data.mergedCount} repeated row(s) in the file were combined (quantities added together).
              </p>
            )}

            {data.addUpCount > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Items to be added to Daily Inventory for {billDate}:</p>
                <div style={{ maxHeight: 160, overflowY: 'auto', background: '#FAFBFC', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
                  {data.addUps.map((a, i) => (
                    <p key={i} style={{ padding: '3px 0', display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #F1F5F9' }}>
                      <span>{a.name}</span>
                      <span style={{ color: '#0F1B2D', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        +{fmtQty(a.add)} {a.unit || ''} {a.rate ? `(@ ₹${a.rate})` : ''} {a.totalCost ? `· ${inr(a.totalCost)}` : ''}
                      </span>
                    </p>
                  ))}
                  {data.addUpCount > data.addUps.length && <p style={{ color: '#8A94A6', marginTop: 4 }}>…and {data.addUpCount - data.addUps.length} more</p>}
                </div>
              </div>
            )}

            {data.toCreateCount > 0 && (
              <p style={{ fontSize: 12, color: '#16A34A', background: '#F0FBF4', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
                New products to create: <b>{data.newNames.join(', ')}</b>{data.toCreateCount > data.newNames.length ? ` …and ${data.toCreateCount - data.newNames.length} more` : ''}
              </p>
            )}

            {data.duplicateOpeningStock && (
              <div style={{ background: '#FEE2E2', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                <p style={{ fontSize: 12.5, color: '#991B1B' }}>
                  ⚠️ <b>Opening stock already exists for {data.duplicateOpeningStock.month}:</b> {inr(data.duplicateOpeningStock.total)} ({fmtQty(data.duplicateOpeningStock.units)} units) on {data.duplicateOpeningStock.date?.slice(0, 10)}. Importing again will add to inventory quantities and duplicate the opening stock value in P&amp;L.
                </p>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12.5, cursor: 'pointer', color: '#7F1D1D' }}>
                  <input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} /> Import anyway
                </label>
              </div>
            )}

            {/* Checkbox for recording as a dated bill or opening stock */}
            <label style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: recordPurchase ? (importType === 'OPENING_STOCK' ? '#F5F3FF' : '#F0FDF4') : '#FAFBFC',
              border: `1.5px solid ${recordPurchase ? (importType === 'OPENING_STOCK' ? '#C4B5FD' : '#86EFAC') : '#E2E8F0'}`,
              borderRadius: 10, padding: '12px 14px', marginBottom: 14, cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={recordPurchase}
                onChange={e => setRecordPurchase(e.target.checked)}
                style={{ marginTop: 2, transform: 'scale(1.2)' }}
              />
              <span style={{ fontSize: 13 }}>
                <b style={{ color: importType === 'OPENING_STOCK' ? '#5B21B6' : '#0F1B2D' }}>
                  {importType === 'OPENING_STOCK'
                    ? `✓ Record as Opening Stock for ${billDate.slice(0, 7)}`
                    : `✓ Record as a Date-Categorized Inventory Bill for ${billDate}`}
                </b>
                <span style={{ display: 'block', color: '#64748B', marginTop: 3, fontSize: 12 }}>
                  {importType === 'OPENING_STOCK'
                    ? `Adds quantities to existing inventory and logs opening stock for ${billDate.slice(0, 7)} in Monthly P&L.`
                    : `This automatically categorizes this purchase under ${billDate} in 📅 Daily Inventory and deducts it in your 📊 Daily Profit & Ledger!`}
                </span>
              </span>
            </label>

            {error && <p style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 13, padding: '10px 12px', borderRadius: 10, marginBottom: 14 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setStep('pick'); setData(null); }} style={btn(false)}>Back</button>
              <button
                onClick={() => send(false)}
                disabled={busy || nothingToDo || (recordPurchase && (((data.duplicateBills || []).length > 0 && !allowDuplicate) || (data.duplicateOpeningStock && !allowDuplicate)))}
                style={btn(true, busy || nothingToDo || (recordPurchase && (((data.duplicateBills || []).length > 0 && !allowDuplicate) || (data.duplicateOpeningStock && !allowDuplicate))))}
              >
                {busy ? 'Saving...' : importType === 'OPENING_STOCK' ? `Confirm & Log Opening Stock for ${billDate.slice(0, 7)}` : `Confirm & Log Inventory for ${billDate}`}
              </button>
            </div>
          </>
        )}

        {step === 'done' && data && (
          <>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>🎉</div>
              <h4 style={{ fontSize: 18, fontWeight: 800, color: '#0F1B2D' }}>
                {data.importType === 'OPENING_STOCK' ? 'Opening Stock Successfully Logged!' : 'Inventory Bill Successfully Logged!'}
              </h4>
              <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                {data.importType === 'OPENING_STOCK'
                  ? <>Recorded as Month Opening Stock for <b>{data.recordedDate?.slice(0, 7) || billDate.slice(0, 7)}</b> with total quantity and value.</>
                  : <>Categorized under <b>{data.recordedDate || billDate}</b> with total quantity and cost.</>}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0', justifyContent: 'center' }}>
              {pill('#D6F5E3', '#16A34A', `✓ Items Updated: ${data.added + data.created}`)}
              {pill('#EEF0FF', '#6C63FF', `Total Units: ${fmtQty(data.recordedUnits || totalUnits)}`)}
              {pill('#FEF3C7', '#92400E', `Total Value: ${inr(data.recordedTotal || totalCost)}`)}
            </div>

            <p style={{ fontSize: 12.5, color: '#16A34A', background: '#F0FBF4', borderRadius: 10, padding: '10px 14px', marginBottom: 16, textAlign: 'center' }}>
              {data.importType === 'OPENING_STOCK'
                ? <>✓ Opening stock added to inventory balance and will appear in <b>📊 Monthly P&amp;L</b> under Opening Stock!</>
                : <>✓ Now visible under <b>📅 Daily Inventory</b> and reflecting in <b>📊 Daily Profit &amp; Ledger</b>!</>}
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setStep('pick'); setData(null); setFile(null); }} style={btn(false)}>Import Another</button>
              <button onClick={onClose} style={btn(true)}>Close &amp; View Inventory</button>
            </div>
          </>
        )}
      </div>
    </div></Portal>
  );
}
