import React from 'react';
import { getStatus, statusColors } from './ProductDrawer';

const PALETTE = ['#3B82F6', '#16A34A', '#EF4444', '#6C63FF', '#F59E0B', '#14B8A6', '#EC4899'];

export default function ProductCard({ p, onClick }) {
  const status = getStatus(p.quantity, p.reorderLevel);
  const sc = statusColors[status];
  const catColor = p.categoryId ? PALETTE[p.categoryId % PALETTE.length] : '#8A94A6';
  return (
        <div onClick={onClick} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', borderTop: `3px solid ${catColor}`, position: 'relative' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.12)'; e.currentTarget.querySelector('.hbtn').style.transform = 'translateY(0)'; e.currentTarget.querySelector('.hbtn').style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)'; e.currentTarget.querySelector('.hbtn').style.transform = 'translateY(100%)'; e.currentTarget.querySelector('.hbtn').style.opacity = '0'; }}>
          <div style={{ textAlign: 'center', paddingTop: 24, paddingBottom: 10, fontSize: 36 }}>{p.emoji || '📦'}</div>
          <div style={{ padding: '0 16px 16px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{p.name}</h3>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: catColor + '22', color: catColor }}>{p.category?.name || p.category || 'N/A'}</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <p style={{ fontSize: 15, fontWeight: 700 }}>₹{p.price}</p>
              <span style={{ fontSize: 11, color: '#8A94A6' }}>/ {p.unit || 'pcs'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: '#8A94A6' }}>{p.quantity} in stock</span>
            </div>
          </div>
          <div className="hbtn" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#2ECC71', color: '#fff', padding: '10px', textAlign: 'center', fontSize: 12, fontWeight: 600, transform: 'translateY(100%)', opacity: 0, transition: 'transform 0.2s ease, opacity 0.2s' }}>View Details →</div>
        </div>
  );
}
