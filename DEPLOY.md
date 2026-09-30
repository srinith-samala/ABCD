# Deploy steps

## 1. Database (Neon - free Postgres)
Create project at neon.tech -> copy the connection string (DATABASE_URL).

## 2. Backend (Render - Web Service)
- Root Directory: `backend`
- Build Command: `npm install && npx prisma db push`
- Start Command: `npm start`
- Env vars: DATABASE_URL, JWT_SECRET (long random), FRONTEND_URL (Vercel URL, set after step 3), ADMIN_PASSWORD (optional)
- After first deploy, open Render Shell and run: `npm run seed`  (creates admin@stock.com)
- Test: https://<your-backend>.onrender.com/api/health

## 3. Dashboard (Vercel)
- Import repo, set Root Directory = `dashboard`, preset = Vite
- Env var: VITE_API_URL = https://<your-backend>.onrender.com
- Deploy, then put the Vercel URL into FRONTEND_URL on Render and redeploy backend.

## 4. After go-live
Login as admin@stock.com, change the password / create real users from the Users page.
