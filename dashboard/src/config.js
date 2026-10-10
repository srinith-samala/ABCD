// Backend URL. Set VITE_API_URL in env vars (no trailing slash).
export const API = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:5000')).replace(/\/$/, '');
