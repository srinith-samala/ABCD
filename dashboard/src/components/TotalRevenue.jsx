import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
} from 'recharts';

const revenueData = [
  { x: '4', v: 60 },
  { x: '8', v: 75 },
  { x: '12', v: 55 },
  { x: '16', v: 90 },
  { x: '20', v: 80 },
  { x: '24', v: 100 },
  { x: '28', v: 120 },
];

const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3"/>
    <rect x="8" y="1" width="5" height="5" rx="1" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3"/>
    <rect x="1" y="8" width="5" height="5" rx="1" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3"/>
    <rect x="8" y="8" width="5" height="5" rx="1" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3"/>
  </svg>
);

const CustomRevenueTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length && label === '28') {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.2)',
        backdropFilter: 'blur(8px)',
        borderRadius: 8,
        padding: '6px 10px',
        border: '1px solid rgba(255,255,255,0.3)',
      }}>
        <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>$1210.6</span>
      </div>
    );
  }
  return null;
};

export default function TotalRevenue() {
  return (
    <div style={{
      borderRadius: 16,
      background: 'linear-gradient(135deg, #6C63FF 0%, #9B8FF5 100%)',
      padding: '20px 22px',
      boxShadow: '0 4px 20px rgba(108,99,255,0.35)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Total Revenue</h3>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <GridIcon />
        </button>
      </div>

      {/* Big number + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>$12,000</span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '3px 8px',
          borderRadius: 20,
          background: 'rgba(255,255,255,0.2)',
          color: '#fff',
          fontSize: 11, fontWeight: 700,
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          10%
        </span>
      </div>

      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 16 }}>$5,650 last month</p>

      {/* Mini bar chart */}
      <div style={{ height: 80 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={revenueData} barCategoryGap="30%">
            <XAxis
              dataKey="x"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.55)', fontFamily: 'DM Sans' }}
            />
            <YAxis hide />
            <Tooltip
              content={<CustomRevenueTooltip />}
              cursor={false}
            />
            <Bar dataKey="v" radius={[3, 3, 0, 0]}>
              {revenueData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.x === '28' ? '#fff' : 'rgba(255,255,255,0.3)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
