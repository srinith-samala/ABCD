import React, { useState } from 'react';
import { API } from '../config';
import Header from '../components/Header';

const roleStyle = {
  Admin: { bg: '#EEF0FF', color: '#6C63FF' },
  Manager: { bg: '#E3F2FD', color: '#1976D2' },
  Staff: { bg: '#D6F5E3', color: '#16A34A' },
  Viewer: { bg: '#F4F5F7', color: '#8A94A6' },
};

function AddUserModal({ onClose, fetchUsers }) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'WORKER' });

  const handleSave = async () => {
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        fetchUsers();
        onClose();
      } else {
        const data = await res.json();
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Add New User</h2>
          <button onClick={onClose} style={{ border: 'none', background: '#F4F5F7', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Full Name</label>
          <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Email Address</label>
          <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Password</label>
          <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none' }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Role</label>
          <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none' }}>
            <option value="WORKER">Worker</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleSave} style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }}>Save User</button>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#F4F5F7', color: '#0F1B2D', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const [showModal, setShowModal] = useState(false);
  const [dbUsers, setDbUsers] = useState([]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API}/api/users`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setDbUsers(await res.json());
      else if (res.status === 403) alert('You do not have permission to view users. Admin only.');
    } catch (e) { console.error(e); }
  };

  React.useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Users" subtitle="Manage team members and access roles" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button onClick={() => setShowModal(true)} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add User</button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr style={{ background: '#FAFBFC' }}>
                {['User', 'Email', 'Role', 'Status'].map(h => (
                  <th key={h} style={{ padding: '12px 16px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dbUsers.map(u => (
                <tr key={u.id}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: '#6C63FF', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: '#fff',
                      }}>{(u.name || '?')[0]}</div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#8A94A6', fontSize: 13 }}>{u.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className="badge" style={{ background: roleStyle[u.role === 'ADMIN' ? 'Admin' : 'Staff']?.bg || '#F4F5F7', color: roleStyle[u.role === 'ADMIN' ? 'Admin' : 'Staff']?.color || '#000' }}>{u.role}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ECC71' }} />
                      <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 500 }}>Active</span>
                    </div>
                  </td>
                </tr>
              ))}
              {dbUsers.length === 0 && (
                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: '#8A94A6' }}>No users found or permission denied.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && <AddUserModal onClose={() => setShowModal(false)} fetchUsers={fetchUsers} />}
    </div>
  );
}
