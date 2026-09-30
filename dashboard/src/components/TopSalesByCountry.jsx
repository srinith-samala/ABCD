import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'USA', value: 40, color: '#1A1A2E' },
  { name: 'Australia', value: 21, color: '#8B8BA0' },
  { name: 'Korea', value: 19, color: '#D0D0DF' },
  { name: 'Other', value: 20, color: '#F0F0F5' },
];

const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 2h4M2 2v4M12 2h-4M12 2v4M2 12h4M2 12v-4M12 12h-4M12 12v-4" stroke="#9999AA" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export default function TopSalesByCountry() {
  return (
    <div className="card" style={{ padding: '20px 22px', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>Top sales by country</h3>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <ExpandIcon />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Donut with center label overlay */}
        <div style={{ width: 120, height: 120, flexShrink: 0, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={36}
                outerRadius={56}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                strokeWidth={2}
                stroke="#fff"
                isAnimationActive={false}
              >
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center label overlay */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 16,
            fontWeight: 800,
            color: '#1A1A2E',
            pointerEvents: 'none',
            fontFamily: 'DM Sans',
          }}>
            40%
          </div>
        </div>

        {/* Legend */}
        <div style={{ flex: 1 }}>
          {data.slice(0, 3).map((item) => (
            <div key={item.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: item.color, display: 'inline-block', flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: '#1A1A2E', fontWeight: 500 }}>{item.name}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E' }}>{item.value}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom legend dots */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        {data.slice(0, 3).map(item => (
          <span key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9999AA' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}
