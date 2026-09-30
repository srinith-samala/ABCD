import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Dot, Tooltip,
} from 'recharts';

const ordersData = [
  { x: '1 Jul', v: 30 },
  { x: '8 Jul', v: 55 },
  { x: '15 Jul', v: 90 },
  { x: '25 Jul', v: 130 },
];

const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="#9999AA" strokeWidth="1.3"/>
    <rect x="8" y="1" width="5" height="5" rx="1" stroke="#9999AA" strokeWidth="1.3"/>
    <rect x="1" y="8" width="5" height="5" rx="1" stroke="#9999AA" strokeWidth="1.3"/>
    <rect x="8" y="8" width="5" height="5" rx="1" stroke="#9999AA" strokeWidth="1.3"/>
  </svg>
);

const CustomDot = (props) => {
  const { cx, cy, index } = props;
  if (index === ordersData.length - 1) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill="#1A1A2E" />
        <circle cx={cx} cy={cy} r={3} fill="#fff" />
      </g>
    );
  }
  return null;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return null; // handled via dot label
  }
  return null;
};

export default function TotalOrders() {
  return (
    <div style={{
      borderRadius: 16,
      background: '#FDF5EF',
      padding: '20px 22px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>Total Orders</h3>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <GridIcon />
        </button>
      </div>

      {/* Big number + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: '#1A1A2E', lineHeight: 1 }}>$15,210</span>
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
          51%
        </span>
      </div>

      <p style={{ fontSize: 11, color: '#9999AA', marginBottom: 16 }}>$10,500 last month</p>

      {/* Line chart */}
      <div style={{ height: 90, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={ordersData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="x"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9999AA', fontFamily: 'DM Sans' }}
              interval={0}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="v"
              stroke="#1A1A2E"
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={false}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Floating label near last dot */}
        <div style={{
          position: 'absolute',
          top: 2,
          right: 8,
          background: '#1A1A2E',
          borderRadius: 8,
          padding: '4px 8px',
          fontSize: 11, fontWeight: 700, color: '#fff',
          pointerEvents: 'none',
        }}>
          Jul 25
        </div>
      </div>
    </div>
  );
}
