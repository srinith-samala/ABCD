# Deploy steps

## Architecture
Single Render Web Service serves **both** the Express API and the React dashboard.
The backend (`/api/*`) runs on Express; all other routes return `dashboard/dist/index.html`.

## 1. Database (Neon - free Postgres)
Create project at neon.tech → copy the connection string (DATABASE_URL).

## 2. Backend + Frontend (Render - Web Service)
- Root Directory: `backend`
- Build Command: `npm install && npx prisma db push && cd ../dashboard && npm install && npm run build`
- Start Command: `npm start`
- Env vars:
  - `DATABASE_URL` — Neon connection string
  - `JWT_SECRET` — long random string
  - `ADMIN_PASSWORD` — optional initial admin password

After first deploy, open Render Shell and run: `npm run seed`  (creates admin@stock.com)

Test: https://<your-backend>.onrender.com/api/health

## 3. After go-live
Login as admin@stock.com, change the password / create real users from the Users page.
