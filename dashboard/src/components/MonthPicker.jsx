import React from 'react';

// months: [{ key: '2026-09', label: 'Sep 2026' }]  value: '2026-09' | 'all'
export default function MonthPicker({ months = [], value, onChange, allowAll = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', padding: '5px 6px 5px 12px', borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>📅 Period</span>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ border: 'none', background: '#0F1B2D', color: '#fff', borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
      >
        {months.length === 0 && <option value="">No data yet</option>}
        {[...months].reverse().map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        {allowAll && months.length > 1 && <option value="all">All time</option>}
      </select>
    </div>
  );
}
