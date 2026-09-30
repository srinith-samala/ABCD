import React from 'react';

const transactions = [
  {
    id: '#103,003',
    name: 'Alia Bonner',
    amount: '$31.00',
    status: 'Paid',
    initials: 'AB',
    color: '#A78BFA',
    avatars: ['#6C63FF', '#22C55E'],
  },
  {
    id: '#152,004',
    name: 'Kodi Potts',
    amount: '$48.00',
    status: 'Refund',
    initials: 'KP',
    color: '#FCA5A5',
    avatars: ['#F472B6', '#FCD34D'],
  },
  {
    id: '#405,005',
    name: 'Austin Camacho',
    amount: '$92.00',
    status: 'Paid',
    initials: 'AC',
    color: '#34D399',
    avatars: ['#6C63FF', '#F472B6'],
  },
  {
    id: '#782,006',
    name: 'Millie Tran',
    amount: '$15.00',
    status: 'Paid',
    initials: 'MT',
    color: '#60A5FA',
    avatars: ['#22C55E', '#6C63FF'],
  },
];

const StatusBadge = ({ status }) => (
  <span style={{
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: status === 'Paid' ? '#DCFCE7' : '#FEE2E2',
    color: status === 'Paid' ? '#16A34A' : '#EF4444',
  }}>
    {status}
  </span>
);

const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 2h4M2 2v4M12 2h-4M12 2v4M2 12h4M2 12v-4M12 12h-4M12 12v-4" stroke="#9999AA" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export default function LastActivity() {
  return (
    <div className="card" style={{ padding: '20px 22px', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>Last activity</h3>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <ExpandIcon />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {transactions.map((tx, idx) => (
          <div key={idx} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingBottom: idx < transactions.length - 1 ? 12 : 0,
            borderBottom: idx < transactions.length - 1 ? '1px solid #F5F5FA' : 'none',
          }}>
            {/* Avatar */}
            <div style={{
              width: 32, height: 32,
              borderRadius: '50%',
              background: tx.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {tx.initials}
            </div>

            {/* Name + ID */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#1A1A2E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tx.name}
              </p>
              <p style={{ fontSize: 11, color: '#9999AA' }}>{tx.id}</p>
            </div>

            {/* Amount */}
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E', flexShrink: 0 }}>
              {tx.amount}
            </span>

            {/* Status */}
            <StatusBadge status={tx.status} />

            {/* Mini avatar stack */}
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {tx.avatars.map((c, i) => (
                <div key={i} style={{
                  width: 20, height: 20,
                  borderRadius: '50%',
                  background: c,
                  border: '2px solid #fff',
                  marginLeft: i > 0 ? -6 : 0,
                }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
