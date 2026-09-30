import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const data = [
  { month: 'Jan', men: 42, women: 28 },
  { month: 'Feb', men: 55, women: 38 },
  { month: 'Mar', men: 48, women: 45 },
  { month: 'Apr', men: 62, women: 52 },
  { month: 'May', men: 58, women: 48 },
  { month: 'Jun', men: 70, women: 60 },
  { month: 'Jul', men: 104, women: 85 },
  { month: 'Aug', men: 78, women: 65 },
  { month: 'Sep', men: 65, women: 55 },
  { month: 'Oct', men: 72, women: 58 },
  { month: 'Nov', men: 80, women: 70 },
  { month: 'Dec', men: 90, women: 76 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length && label === 'Jul') {
    return (
      <div style={{
        background: '#1A1A2E',
        borderRadius: 10,
        padding: '8px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        pointerEvents: 'none',
      }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 11, marginBottom: 4 }}>July 14</p>
        <p style={{ color: '#C4C1FF', fontSize: 11, margin: '2px 0' }}>
          Sold <span style={{ color: '#fff', fontWeight: 600 }}>104</span>
        </p>
        <p style={{ color: '#C4C1FF', fontSize: 11 }}>
          Return <span style={{ color: '#fff', fontWeight: 600 }}>0</span>
        </p>
      </div>
    );
  }
  return null;
};

export default function SalesAnalytics() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ padding: '22px 24px 14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>Sales Analytics</h2>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#9999AA' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6C63FF', display: 'inline-block' }} />
              Men
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#9999AA' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#C4C1FF', display: 'inline-block' }} />
              Women
            </span>
          </div>
        </div>

        {/* Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(!open)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1.5px solid #EBEBEB',
              background: '#FAFAFA',
              fontSize: 12, fontWeight: 500, color: '#1A1A2E',
              cursor: 'pointer',
            }}
          >
            This year
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5l3 3 3-3" stroke="#9999AA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {open && (
            <div style={{
              position: 'absolute', top: '110%', right: 0,
              background: '#fff', borderRadius: 8,
              border: '1px solid #EBEBEB', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              zIndex: 50, minWidth: 120, overflow: 'hidden',
            }}>
              {['This year', 'Last year', 'Last 6 months'].map(opt => (
                <button key={opt} onClick={() => setOpen(false)} style={{
                  display: 'block', width: '100%', padding: '8px 14px',
                  textAlign: 'left', fontSize: 12, color: '#1A1A2E',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F5F5FA'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{opt}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} barGap={3} barCategoryGap="35%">
          <CartesianGrid vertical={false} stroke="#F0F0F5" strokeDasharray="0" />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#9999AA', fontFamily: 'DM Sans' }}
          />
          <YAxis hide />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(108,99,255,0.05)', radius: 4 }}
          />
          <Bar dataKey="men" radius={[4, 4, 0, 0]} fill="#6C63FF">
            {data.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.month === 'Jul' ? '#6C63FF' : '#6C63FF'}
                opacity={entry.month === 'Jul' ? 1 : 0.85}
              />
            ))}
          </Bar>
          <Bar dataKey="women" radius={[4, 4, 0, 0]} fill="#C4C1FF">
            {data.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.month === 'Jul' ? '#C4C1FF' : '#C4C1FF'}
                opacity={entry.month === 'Jul' ? 1 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
