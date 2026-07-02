# FieldTrack KSA — Deployment Guide
# Frontend → https://app.trilock.com   (Vercel, free)
# Backend  → https://api.trilock.com   (Railway, ~$5/month Hobby plan)
# Database → Supabase (free tier, already configured)
# Storage  → Supabase Storage (free tier, already configured)

---

## ⚠️ Before you do anything else

The Supabase database password was previously committed to this file in
plaintext and pushed to a **public** GitHub repo. If you have not already:

1. Go to Supabase Dashboard → Settings → Database → **Reset database password**.
2. Update `DATABASE_URL` everywhere below with the new password.
3. Change the default seed passwords in Step 4 before any real user logs in.

Never put real credentials in a file that gets committed. The placeholders
below are intentional — fill them into Railway's/Vercel's environment
variable UI directly, not into this file.

---

## Platforms used

| What | Where | Cost |
|------|-------|------|
| Frontend website | Vercel | Free |
| Backend server | Railway | Free trial credit, then ~$5/mo (Hobby plan) |
| Database | Supabase | Free |
| File storage | Supabase Storage | Free |

Unlike Render's free tier, Railway does not sleep your service after
inactivity, so there's no need for an uptime-pinger step.

---

## STEP 1 — Create your accounts (do this first)

1. **GitHub** (needed by both Vercel and Railway)
   - Go to https://github.com → Sign Up → create free account

2. **Railway**
   - Go to https://railway.app → Sign Up → Continue with GitHub
   - Note: Railway starts you on a one-time trial credit. Once that runs
     out you'll need to add a payment method and move to the Hobby plan
     (~$5/month usage-based) to keep the service running.

3. **Vercel**
   - Go to https://vercel.com → Sign Up → Continue with GitHub

---

## STEP 2 — Put your code on GitHub

Railway and Vercel deploy directly from GitHub.

### 2a. Install Git if you don't have it
- Go to https://git-scm.com/download/win

### 2b. Commit and push
```
cd C:\Users\shaik\Desktop\Tracker
git add .
git commit -m "switch deploy target to Railway"
git push
```

(This repo already has a remote configured at
`github.com/Shaikhabdulaleem/fieldtrack-ksa`.)

---

## STEP 3 — Deploy Backend on Railway

### 3a. Generate a security key (do this once, save it)
In your terminal:
```
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the long string and save it somewhere safe. This is your `JWT_SECRET`.

### 3b. Get your Supabase service key + connection string
1. Go to https://supabase.com → your project
2. Settings → Database → Connection string → URI tab (copy, this is your
   **new**, rotated `DATABASE_URL`)
3. Settings → API → Project API keys → copy the `service_role` key

### 3c. Create the Railway service
1. Go to https://railway.app → **New Project** → **Deploy from GitHub repo**
2. Select `fieldtrack-ksa`
3. After it creates the service, open **Settings**:
   - **Root Directory:** `backend`
   - Railway will auto-detect `backend/railway.json` for the build/start
     commands and health check (`/health`) — no manual build/start config
     needed.
4. Open **Variables** and add each one:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | *(your new, rotated Supabase connection string)* |
| `JWT_SECRET` | *(the key you generated in 3a)* |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://app.trilock.com` |
| `SUPABASE_URL` | *(your Supabase project URL)* |
| `SUPABASE_SERVICE_KEY` | *(the service_role key from 3b)* |
| `SUPABASE_STORAGE_BUCKET` | `fieldtrack-uploads` |

Leave `PORT` unset — Railway injects its own `PORT` and your app already
reads `process.env.PORT` via `env.ts`.

5. Click **Deploy**

Railway builds and deploys. When done, open **Settings → Networking** →
**Generate Domain** to get a URL like `fieldtrack-api-production.up.railway.app`.
**Save this URL.**

### 3d. Run database setup (one time only)
Locally, pointed at the same (rotated) `DATABASE_URL`:
```
cd C:\Users\shaik\Desktop\Tracker\backend
npm install
npm run migrate:run
npm run seed
```

### 3e. Test backend is live
Paste this in your browser (use your actual Railway URL):
```
https://fieldtrack-api-production.up.railway.app/health
```
You should see: `{"ok":true,"db":"connected"}` ✅

---

## STEP 4 — Deploy Frontend on Vercel (free)

### 4a. Build the frontend (sanity check locally, optional)
```
cd C:\Users\shaik\Desktop\Tracker
npm run build
```

### 4b. Deploy on Vercel
1. Go to https://vercel.com → **Add New** → **Project**
2. **Import Git Repository** → select `fieldtrack-ksa`
3. Fill in the form:
   - **Framework Preset:** `Vite`
   - **Root Directory:** leave empty (`.`)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. **Environment Variables** → Add:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://fieldtrack-api-production.up.railway.app` |

5. Click **Deploy**

Test it: open the Vercel URL, confirm the login page loads.

---

## STEP 5 — Connect trilock.com domain (Namecheap)

### 5a. Add app.trilock.com → Vercel
Vercel → project → **Settings** → **Domains** → add `app.trilock.com` →
copy the CNAME value it gives you.

### 5b. Add api.trilock.com → Railway
Railway → service → **Settings** → **Networking** → **Custom Domain** →
add `api.trilock.com` → copy the CNAME value it gives you.

### 5c. Add DNS records in Namecheap
Namecheap → Domain List → trilock.com → **Manage** → **Advanced DNS**:

**Record 1 (frontend):**
- Type: `CNAME Record`, Host: `app`, Value: *(from Vercel)*, TTL: Automatic

**Record 2 (backend):**
- Type: `CNAME Record`, Host: `api`, Value: *(from Railway)*, TTL: Automatic

Wait 15–30 minutes for DNS to propagate, then test:
- `https://app.trilock.com` → login page ✅
- `https://api.trilock.com/health` → `{"ok":true}` ✅

### 5d. Update FRONTEND_URL on Railway
Railway → service → **Variables** → `FRONTEND_URL` → `https://app.trilock.com`
→ Railway redeploys automatically.

---

## STEP 6 — Final test on mobile

1. Turn off WiFi on your phone (mobile data only)
2. Open `https://app.trilock.com`
3. Log in as admin and driver with your **changed** (non-default) passwords
4. Check GPS permission prompt and live tracking work
5. Submit a test lead with photos, confirm it lands in Supabase Storage

If all of that works — you are LIVE.

---

## How to update the app in future

```
git add .
git commit -m "update"
git push
```

Railway and Vercel detect the push automatically and redeploy.

---

## Summary of your setup

| URL | What it is |
|-----|------------|
| `https://app.trilock.com` | Admin + Driver app |
| `https://api.trilock.com` | Backend API |
| `https://api.trilock.com/health` | Check if server is running |

**Login credentials:** set your own during seeding (Step 3d) — do not ship
with the placeholder passwords that were previously in this file.
