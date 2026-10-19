import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const baseNavItems = [
  { to: '/', label: 'Dashboard', emoji: '🏠', exact: true },
  { to: '/inventory', label: 'Inventory', emoji: '📦' },
  { to: '/products', label: 'Products', emoji: '🏷️' },
  { to: '/categories', label: 'Categories', emoji: '🗂️' },
  { to: '/orders', label: 'Orders', emoji: '🛒' },
  { to: '/suppliers', label: 'Suppliers', emoji: '🚚' },
  { to: '/reports', label: 'Reports', emoji: '📊' },
  { to: '/settings', label: 'Settings', emoji: '⚙️' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const role = localStorage.getItem('role') || 'WORKER';
  const name = localStorage.getItem('name') || 'User';

  const navItems = [...baseNavItems];
  if (role === 'ADMIN') {
    navItems.splice(navItems.length - 1, 0, { to: '/expenses', label: 'Expenses', emoji: '💸' });
    navItems.splice(navItems.length - 1, 0, { to: '/vendorbills', label: 'Vendor Bills', emoji: '🧾' });
    navItems.splice(navItems.length - 1, 0, { to: '/payroll', label: 'Payroll', emoji: '👨‍🍳' });
    navItems.splice(navItems.length - 1, 0, { to: '/pandl', label: 'P&L', emoji: '📈' });
    navItems.push({ to: '/users', label: 'Users', emoji: '👥' });
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('name');
    navigate('/login');
  };

  return (
    <aside style={{
      width: 240,
      minHeight: '100vh',
      background: '#0F1B2D',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{
        padding: '24px 20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🛒</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px' }}>Takatak</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 4, marginLeft: 32 }}>Inventory Manager</p>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 10px', flex: 1 }}>
        {navItems.map(({ to, label, emoji, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom user */}
      <div style={{
        padding: '16px 16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2ECC71, #27AE60)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>{name.charAt(0).toUpperCase()}</div>
          <div>
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{name}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{role}</p>
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: 20 }}>
          🚪
        </button>
      </div>
    </aside>
  );
}
