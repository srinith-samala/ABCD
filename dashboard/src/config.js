// Backend URL. Set VITE_API_URL in Vercel env vars (no trailing slash).
export const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
