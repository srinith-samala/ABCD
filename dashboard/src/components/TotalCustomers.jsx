import React from 'react';

const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="#9999AA" strokeWidth="1.3"/>
    <rect x="8" y="1" width="5" height="5" rx="1" stroke="#9999AA" strokeWidth="1.3"/>
    <rect x="1" y="8" width="5" height="5" rx="1" stroke="#9999AA" strokeWidth="1.3"/>
    <rect x="8" y="8" width="5" height="5" rx="1" stroke="#9999AA" strokeWidth="1.3"/>
  </svg>
);

export default function TotalCustomers() {
  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>Total Customers</h3>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <GridIcon />
        </button>
      </div>

      {/* Big number + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: '#1A1A2E', lineHeight: 1 }}>1,226</span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '3px 8px',
          borderRadius: 20,
          background: '#DCFCE7',
          color: '#16A34A',
          fontSize: 11, fontWeight: 700,
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          7%
        </span>
      </div>

      <p style={{ fontSize: 11, color: '#9999AA', marginBottom: 16 }}>553 users last month</p>

      {/* Progress bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          height: 6,
          borderRadius: 10,
          background: '#EBEBEB',
          overflow: 'hidden',
          display: 'flex',
        }}>
          <div style={{ width: '40%', background: '#1A1A2E', borderRadius: '10px 0 0 10px' }} />
          <div style={{ width: '60%', background: '#EBEBEB' }} />
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9999AA' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1A1A2E', display: 'inline-block' }} />
          Men
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9999AA' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D0D0DF', display: 'inline-block' }} />
          Women
        </span>
      </div>
    </div>
  );
}
