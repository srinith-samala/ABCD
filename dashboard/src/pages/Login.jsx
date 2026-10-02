import React, { useState } from 'react';
import { API } from '../config';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        localStorage.setItem('name', data.name);
        navigate('/');
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (err) {
      alert('Error connecting to server');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Left panel */}
      <div className="shimmer-bg" style={{
        flex: '6 1 0%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 48,
      }}>
        <div style={{ maxWidth: 440, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <span style={{ fontSize: 44 }}>🛒</span>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 32, letterSpacing: '-0.5px' }}>Takatak</span>
          </div>
          <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1.4, marginBottom: 32 }}>
            Smart inventory for smarter grocery businesses
          </h2>
          {[
            'Real-time stock tracking across all categories',
            'Automatic expiry alerts & waste reduction',
            'Full supplier management & order tracking',
          ].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', background: '#2ECC71',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#fff', fontWeight: 700, flexShrink: 0, marginTop: 1,
              }}>✓</div>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 1.5 }}>{item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        flex: '4 1 0%', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48,
      }}>
        <div style={{ maxWidth: 380, width: '100%' }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F1B2D', marginBottom: 6 }}>Welcome back</h1>
          <p style={{ fontSize: 14, color: '#8A94A6', marginBottom: 32 }}>Sign in to your store dashboard</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0F1B2D', marginBottom: 6 }}>Email Address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@takatak.in"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 14, fontFamily: 'DM Sans', outline: 'none', color: '#0F1B2D', transition: 'border-color 0.15s' }}
                onFocus={e => e.target.style.borderColor = '#2ECC71'}
                onBlur={e => e.target.style.borderColor = '#E8EAED'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0F1B2D', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '12px 44px 12px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 14, fontFamily: 'DM Sans', outline: 'none', color: '#0F1B2D', transition: 'border-color 0.15s' }}
                  onFocus={e => e.target.style.borderColor = '#2ECC71'}
                  onBlur={e => e.target.style.borderColor = '#E8EAED'}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  border: 'none', background: 'none', cursor: 'pointer', color: '#8A94A6', fontSize: 16,
                }}>{showPass ? '🙈' : '👁️'}</button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ accentColor: '#2ECC71', width: 15, height: 15 }} />
                <span style={{ fontSize: 13, color: '#8A94A6' }}>Remember me</span>
              </label>
              <button type="button" style={{ border: 'none', background: 'none', color: '#2ECC71', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans' }}>
                Forgot password?
              </button>
            </div>

            <button type="submit" style={{
              width: '100%', padding: '13px 0', borderRadius: 12,
              background: '#2ECC71', color: '#fff', border: 'none',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans',
              transition: 'background 0.2s, transform 0.1s',
              marginTop: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#27AE60'}
            onMouseLeave={e => e.currentTarget.style.background = '#2ECC71'}
            >
              Sign In →
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#8A94A6', marginTop: 24 }}>
            Don't have an account?{' '}
            <span style={{ color: '#2ECC71', fontWeight: 600, cursor: 'pointer' }}>Contact Admin</span>
          </p>
        </div>
      </div>
    </div>
  );
}
