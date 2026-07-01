# FieldTrack KSA — Deployment Guide (100% Free)
# Frontend → https://app.trilock.com   (Vercel, free)
# Backend  → https://api.trilock.com   (Render, free)
# Database → Supabase (free tier, already configured)
# Storage  → Supabase Storage (free tier, already configured)
# Total cost: $0/month

---

## Platforms used

| What | Where | Cost |
|------|-------|------|
| Frontend website | Vercel | Free |
| Backend server | Render | Free |
| Database | Supabase | Free |
| File storage | Supabase Storage | Free |
| Keep server awake | UptimeRobot | Free |

---

## STEP 1 — Create your free accounts (do this first)

1. **GitHub** (needed by both Vercel and Render)
   - Go to https://github.com → Sign Up → create free account

2. **Render**
   - Go to https://render.com → Sign Up → Continue with GitHub

3. **Vercel**
   - Go to https://vercel.com → Sign Up → Continue with GitHub

4. **UptimeRobot** (keeps the server awake)
   - Go to https://uptimerobot.com → Register for FREE

---

## STEP 2 — Put your code on GitHub

Render and Vercel deploy directly from GitHub. You need to upload your code there.

### 2a. Install Git if you don't have it
- Go to https://git-scm.com/download/win
- Download and install (click Next on everything)

### 2b. Open terminal and go to your project
```
cd C:\Users\shaik\Desktop\Tracker
```

### 2c. Upload code to GitHub
```
git init
git add .
git commit -m "initial deployment"
```

Now go to https://github.com → click the **+** icon (top right) → **New repository**
- Repository name: `fieldtrack-ksa`
- Keep it **Private**
- Click **Create repository**

GitHub will show you two commands under "push an existing repository". Copy and run them:
```
git remote add origin https://github.com/YOUR-USERNAME/fieldtrack-ksa.git
git push -u origin main
```

Your code is now on GitHub. ✅

---

## STEP 3 — Deploy Backend on Render (free)

### 3a. Generate a security key (do this once, save it)
In your terminal:
```
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the long string and save it in Notepad. This is your JWT_SECRET.

### 3b. Get your Supabase service key
1. Go to https://supabase.com → your project
2. Settings → API → Project API keys
3. Copy the `service_role` key (click the eye icon to reveal it)
4. Save it in Notepad

### 3c. Create the Render web service
1. Go to https://render.com → click **New +** → **Web Service**
2. Click **Connect a repository** → select `fieldtrack-ksa`
3. Fill in the form:
   - **Name:** `fieldtrack-api`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node dist/index.js`
   - **Instance Type:** `Free`
4. Click **Advanced** → click **Add Environment Variable** and add each one:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql://postgres.ksvrfshjxsozcmawalsm:Pokiman2098@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres` |
| `JWT_SECRET` | *(the long key you generated in 3a)* |
| `PORT` | `4000` |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://app.trilock.com` |
| `SUPABASE_URL` | `https://ksvrfshjxsozcmawalsm.supabase.co` |
| `SUPABASE_SERVICE_KEY` | *(the key from Supabase in 3b)* |
| `SUPABASE_STORAGE_BUCKET` | `fieldtrack-uploads` |

5. Click **Create Web Service**

Render will build and deploy. Takes 3–5 minutes.
When done, it shows a URL like: `https://fieldtrack-api.onrender.com`
**Save this URL.**

### 3d. Run database setup (one time only)
In your terminal:
```
cd C:\Users\shaik\Desktop\Tracker\backend
npm install
npm run migrate:run
npm run seed
```

### 3e. Test backend is live
Paste this in your browser (use your actual Render URL):
```
https://fieldtrack-api.onrender.com/health
```
You should see: `{"ok":true,"db":"connected"}`  ✅

---

## STEP 4 — Deploy Frontend on Vercel (free)

### 4a. Build the frontend
In terminal:
```
cd C:\Users\shaik\Desktop\Tracker
npm run build
```

### 4b. Deploy on Vercel
1. Go to https://vercel.com → click **Add New** → **Project**
2. Click **Import Git Repository** → select `fieldtrack-ksa`
3. Fill in the form:
   - **Framework Preset:** `Vite`
   - **Root Directory:** leave empty (`.`)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Click **Environment Variables** → Add:
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://fieldtrack-api.onrender.com` |
5. Click **Deploy**

Takes 2–3 minutes. Vercel gives you a URL like: `https://fieldtrack-ksa.vercel.app`
**Save this URL.**

Test it: open `https://fieldtrack-ksa.vercel.app` in your browser.
You should see the login page. ✅

---

## STEP 5 — Connect trilock.com domain (Namecheap)

### 5a. Add app.trilock.com → Vercel
1. Vercel → your project → **Settings** → **Domains**
2. Type `app.trilock.com` → click **Add**
3. Vercel shows a CNAME value → save it

### 5b. Add api.trilock.com → Render
1. Render → your service → **Settings** → **Custom Domains**
2. Click **Add Custom Domain**
3. Type `api.trilock.com` → click **Save**
4. Render shows a CNAME value → save it

### 5c. Add DNS records in Namecheap
1. Go to https://namecheap.com → log in
2. **Domain List** → trilock.com → **Manage**
3. Click **Advanced DNS** tab
4. Click **Add New Record** twice:

**Record 1 (frontend):**
- Type: `CNAME Record`
- Host: `app`
- Value: *(value from Vercel — looks like `cname.vercel-dns.com`)*
- TTL: `Automatic`

**Record 2 (backend):**
- Type: `CNAME Record`
- Host: `api`
- Value: *(value from Render — looks like `fieldtrack-api.onrender.com`)*
- TTL: `Automatic`

5. Save both records
6. Wait 15–30 minutes for DNS to update

After waiting, test:
- `https://app.trilock.com` → login page ✅
- `https://api.trilock.com/health` → `{"ok":true}` ✅

### 5d. Update backend URL in Render
Now that api.trilock.com is working, update one variable on Render:
1. Render → your service → **Environment**
2. Find `FRONTEND_URL` → change value to `https://app.trilock.com`
3. Click **Save Changes** → Render redeploys automatically

---

## STEP 6 — Prevent server sleep (UptimeRobot)

Render free servers sleep after 15 minutes of no traffic. Fix this for free:

1. Go to https://uptimerobot.com → log in
2. Click **Add New Monitor**
3. Fill in:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `FieldTrack API`
   - **URL:** `https://api.trilock.com/health`
   - **Monitoring Interval:** `5 minutes`
4. Click **Create Monitor**

UptimeRobot now pings your server every 5 minutes.
Server never sleeps. Problem solved. ✅

---

## STEP 7 — Final test on mobile

1. Turn off WiFi on your phone (use mobile data only)
2. Open `https://app.trilock.com`
3. Login as admin: `admin@fieldtrack.sa` / `Admin1234`
4. Login as driver: `+966501234567` / `Driver1234`
5. Check GPS works (allow location permission when asked)
6. Submit a test lead with photos

If all of that works — you are LIVE! 🎉

---

## How to update the app in future

Whenever you change code, just run:

```
git add .
git commit -m "update"
git push
```

Render and Vercel detect the push automatically and redeploy. No other steps needed.

---

## Summary of your free setup

| URL | What it is |
|-----|------------|
| `https://app.trilock.com` | Admin + Driver app |
| `https://api.trilock.com` | Backend API |
| `https://api.trilock.com/health` | Check if server is running |

**Login credentials (change these after going live):**
| Role | Email/Phone | Password |
|------|-------------|----------|
| Admin | admin@fieldtrack.sa | Admin1234 |
| Manager | manager.jeddah@fieldtrack.sa | Manager1234 |
| Driver | +966501234567 | Driver1234 |
