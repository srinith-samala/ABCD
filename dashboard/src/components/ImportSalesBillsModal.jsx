import React, { useState, useRef, useEffect } from 'react';
import { API } from '../config';
import Portal from './Portal';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Upload one POS "Detailed Sales Summary" Excel per day. Step 1 reads them (nothing saved), step 2 saves.
export default function ImportSalesBillsModal({ onClose, onDone, initialFiles = [] }) {
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (list) => {
    setError(''); setPreview(null); setSaved(null);
    const picked = Array.from(list || []);
    const bad = picked.filter(f => !f.name.toLowerCase().endsWith('.xlsx'));
    if (bad.length) { setError('Only .xlsx files are supported (the Excel export from the POS).'); }
    const ok = picked.filter(f => f.name.toLowerCase().endsWith('.xlsx') && f.size <= 5 * 1024 * 1024);
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...ok.filter(f => !names.has(f.name + f.size))].slice(0, 40);
    });
  };

  const send = async (dryRun) => {
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      fd.append('dryRun', String(dryRun));
      const res = await fetch(`${API}/api/sales-bills/import`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Upload failed'); return; }
      if (dryRun) setPreview(data); else { setSaved(data); onDone && onDone(); }
    } catch (e) { setError('Error connecting to server'); } finally { setBusy(false); }
  };

  // files handed over from the stock-orders importer
  useEffect(() => { if (initialFiles.length) addFiles(initialFiles); /* eslint-disable-next-line */ }, []);

  const okRows = preview ? preview.results.filter(r => r.ok) : [];
  const dropStyle = { border: `2px dashed ${drag ? '#2ECC71' : '#D0D5DD'}`, background: drag ? '#F0FBF4' : '#FAFBFC', borderRadius: 12, padding: '22px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 14 };

  return (
    <Portal>
      <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>Upload daily sales bills</h3>
            <button onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 30, height: 30, cursor: 'pointer' }}>✕</button>
          </div>
          <p style={{ fontSize: 13, color: '#8A94A6', marginBottom: 14 }}>
            Upload the POS <b>"Detailed Sales Summary"</b> Excel the client sends - <b>one file per day</b> (you can select many at once).
            Every bill of the day is added under Orders, and the day's sales are added to Profit & Loss. Uploading the same day again replaces it, so nothing is doubled.
          </p>

          {!saved && (
            <>
              <div onClick={() => inputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }} style={dropStyle}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>🧾</div>
                <p style={{ fontSize: 13, color: '#8A94A6' }}>Click to choose Excel files, or drag &amp; drop them here</p>
                <input ref={inputRef} type="file" accept=".xlsx" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
              </div>

              {files.length > 0 && !preview && (
                <div style={{ marginBottom: 14 }}>
                  {files.map(f => (
                    <div key={f.name + f.size} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 10px', background: '#FAFBFC', borderRadius: 8, marginBottom: 6 }}>
                      <span>{f.name}</span>
                      <button onClick={() => setFiles(files.filter(x => x !== f))} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 12 }}>remove</button>
                    </div>
                  ))}
                </div>
              )}

              {preview && (
                <div style={{ marginBottom: 14, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#8A94A6', fontSize: 11, textTransform: 'uppercase' }}>
                        <th style={{ padding: '6px 4px' }}>File / Date</th><th style={{ padding: '6px 4px', textAlign: 'right' }}>Bills</th>
                        <th style={{ padding: '6px 4px', textAlign: 'right' }}>Net sale</th><th style={{ padding: '6px 4px', textAlign: 'right' }}>Discount</th><th style={{ padding: '6px 4px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.results.map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #E8EAED', verticalAlign: 'top' }}>
                          <td style={{ padding: '8px 4px' }}>
                            <div style={{ fontWeight: 600 }}>{r.ok ? fmtDate(r.date) : r.fileName}</div>
                            <div style={{ fontSize: 11, color: '#8A94A6' }}>{r.ok ? r.fileName : ''}</div>
                          </td>
                          <td style={{ padding: '8px 4px', textAlign: 'right' }}>{r.ok ? r.bills : '-'}</td>
                          <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600 }}>{r.ok ? inr(r.net) : '-'}</td>
                          <td style={{ padding: '8px 4px', textAlign: 'right' }}>{r.ok ? inr(r.discount) : '-'}</td>
                          <td style={{ padding: '8px 4px' }}>
                            {r.ok
                              ? <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: r.exists ? '#FEF3C7' : '#D6F5E3', color: r.exists ? '#92400E' : '#16A34A' }}>{r.exists ? 'Replaces existing day' : 'New day'}</span>
                              : <span style={{ color: '#B91C1C', fontSize: 12 }}>{r.error}</span>}
                            {r.ok && (r.warnings || []).map((w, k) => <div key={k} style={{ fontSize: 11, color: '#92400E', marginTop: 3 }}>⚠ {w}</div>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {error && <p style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 13, padding: '10px 12px', borderRadius: 10, marginBottom: 14 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={onClose} disabled={busy} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                {!preview && <button onClick={() => send(true)} disabled={busy || !files.length} style={{ padding: '9px 22px', borderRadius: 10, background: '#0F1B2D', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy || !files.length ? 0.6 : 1 }}>{busy ? 'Reading...' : `Read ${files.length || ''} file${files.length === 1 ? '' : 's'}`}</button>}
                {preview && <button onClick={() => { setPreview(null); }} disabled={busy} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Change files</button>}
                {preview && <button onClick={() => send(false)} disabled={busy || okRows.length === 0} style={{ padding: '9px 22px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy || okRows.length === 0 ? 0.6 : 1 }}>{busy ? 'Saving...' : `Save ${okRows.length} day${okRows.length === 1 ? '' : 's'}`}</button>}
              </div>
            </>
          )}

          {saved && (
            <div>
              <p style={{ background: '#D6F5E3', color: '#166534', padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                ✅ {saved.saved} day{saved.saved === 1 ? '' : 's'} saved - bills added to Orders and sales added to Profit & Loss.
              </p>
              {saved.failed > 0 && <p style={{ background: '#FEE2E2', color: '#B91C1C', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{saved.failed} file(s) could not be saved: {saved.results.filter(r => !r.ok).map(r => `${r.fileName} (${r.error})`).join('; ')}</p>}
              <div style={{ textAlign: 'right' }}><button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 10, background: '#0F1B2D', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done</button></div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
