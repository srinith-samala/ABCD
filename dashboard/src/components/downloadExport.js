import { API } from '../config';

// Downloads the multi-sheet Excel statistics report. month: '2026-09' | 'all' | undefined (latest month)
export async function downloadStatistics(month) {
  const q = month ? `?month=${encodeURIComponent(month)}` : '';
  const res = await fetch(`${API}/api/reports/export${q}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Export failed');
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename="?([^";]+)"?/.exec(cd);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = m ? m[1] : 'Takatak_Statistics.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}
