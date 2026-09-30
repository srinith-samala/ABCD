import React from 'react';

const products = [
  {
    name: 'Sleeved cardigan',
    stock: 118,
    oldPrice: '$55.00',
    sale: '5%',
    newPrice: '$52.25',
    sold: 294,
    color: '#C4C1FF',
  },
  {
    name: 'Relaxed fit linen shorts',
    stock: 328,
    oldPrice: '$130.00',
    sale: '8%',
    newPrice: '$119.60',
    sold: 2,
    color: '#FCA5A5',
  },
  {
    name: "Women's sweatshirt",
    stock: 118,
    oldPrice: '$311.00',
    sale: '15%',
    newPrice: '$264.35',
    sold: 294,
    color: '#86EFAC',
  },
];

const ClothingIcon = ({ color }) => (
  <div style={{
    width: 36, height: 36,
    borderRadius: 8,
    background: color + '33',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  }}>
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M6 2L3 5l2 1v8h8V6l2-1-3-3-2 1.5L6 2z" fill={color} opacity="0.9"/>
    </svg>
  </div>
);

const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 2h4M2 2v4M12 2h-4M12 2v4M2 12h4M2 12v-4M12 12h-4M12 12v-4" stroke="#9999AA" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const cols = ['Item', 'Stock', 'Old price', 'Sale', 'New price', 'Items sold'];

export default function ProductSales() {
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>Product sales</h3>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <ExpandIcon />
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {cols.map(col => (
              <th key={col} style={{
                textAlign: col === 'Item' ? 'left' : 'center',
                fontSize: 11,
                fontWeight: 600,
                color: '#9999AA',
                paddingBottom: 12,
                borderBottom: '1px solid #EBEBEB',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p, idx) => (
            <tr key={idx} style={{ borderBottom: idx < products.length - 1 ? '1px solid #EBEBEB' : 'none' }}>
              <td style={{ padding: '12px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ClothingIcon color={p.color} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1A2E' }}>{p.name}</span>
                </div>
              </td>
              <td style={{ textAlign: 'center', fontSize: 12, color: '#9999AA', padding: '12px 0' }}>{p.stock}</td>
              <td style={{ textAlign: 'center', fontSize: 12, color: '#9999AA', padding: '12px 0' }}>
                <span style={{ textDecoration: 'line-through' }}>{p.oldPrice}</span>
              </td>
              <td style={{ textAlign: 'center', fontSize: 12, color: '#1A1A2E', fontWeight: 500, padding: '12px 0' }}>{p.sale}</td>
              <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#1A1A2E', padding: '12px 0' }}>{p.newPrice}</td>
              <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#6C63FF', padding: '12px 0' }}>{p.sold}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
