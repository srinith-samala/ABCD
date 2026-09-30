import React, { useState, useEffect } from 'react';
import { API } from '../config';

export default function Header({ title, subtitle }) {
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Only fetch if admin (assuming token has role, but we just try fetching)
    fetch(`${API}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(r => r.ok ? r.json() : [])
    .then(data => { if(Array.isArray(data)) setNotifications(data); })
    .catch(console.error);
  }, []);

  return (
    <header style={{
      background: '#FFFFFF',
      padding: '0 28px',
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid #E8EAED',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F1B2D', lineHeight: 1 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12, color: '#8A94A6', marginTop: 3, fontWeight: 400 }}>{subtitle}</p>}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 14px',
          borderRadius: 10,
          border: '1.5px solid #E8EAED',
          background: '#F4F5F7',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4" stroke="#8A94A6" strokeWidth="1.5"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="#8A94A6" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            placeholder="Search..."
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: 13, color: '#0F1B2D', width: 160,
              fontFamily: 'DM Sans',
            }}
          />
        </div>

        {/* Bell */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowNotifs(!showNotifs)} style={{
            width: 38, height: 38,
            borderRadius: 10,
            border: '1.5px solid #E8EAED',
            background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#8A94A6',
          }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1.5C5 1.5 3 3.5 3 6v3l-1.5 2h12L12 9V6c0-2.5-2-4.5-4.5-4.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M6 11.5c0 .83.67 1.5 1.5 1.5S9 12.33 9 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
          {notifications.length > 0 && (
            <span style={{
              position: 'absolute', top: 7, right: 7,
              width: 7, height: 7,
              background: '#EF4444',
              borderRadius: '50%',
              border: '1.5px solid #fff',
            }} />
          )}

          {showNotifs && (
            <div style={{
              position: 'absolute', top: 48, right: 0,
              width: 320, background: '#fff', borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)', border: '1px solid #E8EAED',
              overflow: 'hidden', zIndex: 50
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #E8EAED', background: '#FAFBFC' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700 }}>Notifications</h3>
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {notifications.map(n => (
                  <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F4F5F7' }}>
                    <p style={{ fontSize: 12, color: '#0F1B2D', lineHeight: 1.4 }}>{n.message}</p>
                    <span style={{ fontSize: 10, color: '#8A94A6', marginTop: 4, display: 'block' }}>{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: '#8A94A6' }}>No new notifications</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Avatar */}
        <div style={{
          width: 38, height: 38,
          borderRadius: '50%',
          border: '2px solid #2ECC71',
          padding: 2,
          cursor: 'pointer',
        }}>
          <div style={{
            width: '100%', height: '100%',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2ECC71, #27AE60)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff',
          }}>A</div>
        </div>
      </div>
    </header>
  );
}
