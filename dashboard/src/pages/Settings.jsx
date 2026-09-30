import React, { useState } from 'react';
import Header from '../components/Header';

const settingsSections = ['General', 'Notifications', 'Store Info', 'Tax & Billing', 'Integrations'];

function Toggle({ on, onChange }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
  );
}

const notifItems = [
  { key: 'lowStock', label: 'Low Stock Alerts', desc: 'Get notified when items fall below reorder level' },
  { key: 'expiry', label: 'Expiry Alerts', desc: 'Receive alerts 7 days before product expiry' },
  { key: 'newOrder', label: 'New Order Alerts', desc: 'Instant notification on new purchase orders' },
  { key: 'dailySummary', label: 'Daily Summary Email', desc: 'Daily digest of store activity at 8 AM' },
];

export default function Settings() {
  const [activeSection, setActiveSection] = useState('General');
  const [autoReorder, setAutoReorder] = useState(true);
  const [notifs, setNotifs] = useState({ lowStock: true, expiry: true, newOrder: true, dailySummary: false });
  const [storeName, setStoreName] = useState('FreshStock Grocery');
  const [threshold, setThreshold] = useState(20);
  const [saved, setSaved] = useState(false);

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Settings" subtitle="Configure your store preferences" />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Inner sidebar */}
        <div style={{ width: 200, background: '#fff', borderRight: '1px solid #E8EAED', padding: '20px 12px', flexShrink: 0 }}>
          {settingsSections.map(s => (
            <button key={s} onClick={() => setActiveSection(s)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 14px', borderRadius: 8, border: 'none',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
              background: activeSection === s ? '#D6F5E3' : 'transparent',
              color: activeSection === s ? '#16A34A' : '#8A94A6',
              cursor: 'pointer', marginBottom: 2,
              transition: 'all 0.15s',
            }}>{s}</button>
          ))}
        </div>

        {/* Content */}
        <div className="dot-grid" style={{ flex: 1, padding: 32, overflowY: 'auto', background: '#F4F5F7' }}>
          <div style={{ maxWidth: 580 }}>
            {activeSection === 'General' && (
              <div className="card">
                <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 24 }}>General Settings</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {[
                    { label: 'Store Name', type: 'text', value: storeName, onChange: e => setStoreName(e.target.value) },
                    { label: 'Currency', type: 'select', value: 'INR ₹', options: ['INR ₹', 'USD $', 'EUR €'] },
                    { label: 'Timezone', type: 'select', value: 'IST (UTC+5:30)', options: ['IST (UTC+5:30)', 'GMT', 'EST'] },
                    { label: 'Language', type: 'select', value: 'English', options: ['English', 'Hindi', 'Tamil'] },
                  ].map(({ label, type, value, onChange, options }) => (
                    <div key={label}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0F1B2D', marginBottom: 6 }}>{label}</label>
                      {type === 'select' ? (
                        <select defaultValue={value} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', color: '#0F1B2D' }}>
                          {options.map(o => <option key={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input value={value} onChange={onChange} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', color: '#0F1B2D' }} />
                      )}
                    </div>
                  ))}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Low Stock Threshold (units)</label>
                    <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EAED', fontSize: 13, fontFamily: 'DM Sans', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#F4F5F7', borderRadius: 10 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>Auto Reorder</p>
                      <p style={{ fontSize: 12, color: '#8A94A6', marginTop: 2 }}>Automatically generate reorder requests</p>
                    </div>
                    <Toggle on={autoReorder} onChange={setAutoReorder} />
                  </div>
                  <button onClick={handleSave} style={{ padding: '12px 24px', borderRadius: 10, background: saved ? '#27AE60' : '#2ECC71', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans', transition: 'background 0.2s' }}>
                    {saved ? '✓ Saved!' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'Notifications' && (
              <div className="card">
                <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 24 }}>Notification Preferences</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {notifItems.map(({ key, label, desc }) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #E8EAED' }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{label}</p>
                        <p style={{ fontSize: 12, color: '#8A94A6' }}>{desc}</p>
                      </div>
                      <Toggle on={notifs[key]} onChange={v => setNotifs(prev => ({ ...prev, [key]: v }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!['General', 'Notifications'].includes(activeSection) && (
              <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                <span style={{ fontSize: 40 }}>🔧</span>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>{activeSection}</h3>
                <p style={{ color: '#8A94A6', fontSize: 14 }}>Configuration options for {activeSection.toLowerCase()} will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
