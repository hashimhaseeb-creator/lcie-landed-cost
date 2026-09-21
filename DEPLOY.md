# LCIE Landed Cost Engine — step-by-step deployment

## Where is the agent sitting right now?
It is **not deployed**. It runs in the dev sandbox (port 3000) and you preview it
through the z.ai web preview panel — that link is **session-scoped / temporary**.
A permanent public link only exists after the steps below.

---

## What's already built (deploy-ready)
The app now ships with a **paywall + license-gated engine**:
- A landing page (`/`) with the pitch, pricing tiers (Free preview / Pro $49/mo /
  Business $199/mo), a "Subscribe via Lemon Squeezy" CTA, a license-key entry, and
  a "Start free preview" button.
- `LicenseKey` + `UsageEvent` Prisma models + `POST /api/license/verify`
  (verify a key OR provision a free-preview key) +
  `POST /api/license/lemonsqueezy-webhook` (HMAC-verified, activates paid keys).
- The `POST /api/lcie/determine-codes` route is **metered**: it reads the
  `x-license-key` header, verifies + consumes one calculation, and returns
  **HTTP 402 (Payment Required)** if the key is invalid or the monthly quota is
  exhausted — which re-shows the paywall in the UI.
- Every LCIE API call goes through `fetchWithLicense()` (injects the header).

## Demo license key (for testing the gate)
A Pro demo key is seeded in the local SQLite DB: **`GP4-PRO-DEMO-2026`**
(plan=pro, 1,000 calcs/mo). Enter it on the landing page to unlock the engine.
On a fresh production DB you'd provision real keys via Lemon Squeezy (Step 4),
or re-seed the demo key manually (see Step 3b).

---

## Step 1 — Push the project to GitHub (5 min)
1. Create a new (private) repo at https://github.com/new — e.g. `lcie-engine`.
2. From the project folder:
   ```bash
   git init
   git add .
   git commit -m "LCIE Landed Cost Engine — paywalled, deploy-ready"
   git branch -M main
   git remote add origin https://github.com/<you>/lcie-engine.git
   git push -u origin main
   ```
   (Use a `.gitignore` for `node_modules`, `.next`, `db/*.db`, `dev.log`.)

## Step 2 — Deploy to Vercel (free, ~10 min) → this gives you the permanent link
1. Sign in at https://vercel.com with your GitHub account.
2. **Add New → Project → Import** your `lcie-engine` repo.
3. Vercel auto-detects Next.js. Leave the defaults (Build: `next build`).
4. Open **Environment Variables** and add (see Step 3 + 4 for the values):
   - `DATABASE_URL` — your Neon Postgres connection string.
   - `LEMON_SQUEEZY_SIGNING_SECRET` — Lemon Squeezy webhook secret.
   - `NEXT_PUBLIC_LEMON_CHECKOUT` — your Lemon Squeezy Pro-product checkout URL.
   - `NEXT_PUBLIC_PAYONEER_PAY_URL` — your Payoneer payment link (for the $9/PO one-off path for SMBs).
5. Click **Deploy**. You get a permanent link like `lcie-engine.vercel.app` on the spot.
   (Settings → Domains to add your own domain later.)

> Why Vercel, not Netlify? Vercel's free Hobby tier allows **60-second serverless
> functions** — the LCIE agent's LLM path (small POs) takes ~30s and fits. Netlify's
> free tier caps functions at ~10s and would time the agent out. Netlify is fine for
> your static marketing brochure (alpine-rcic.netlify.app).

## Step 3 — Free Postgres database (Neon) + push the schema
1. Sign up at https://neon.tech (free) → create a project → copy the
   **`DATABASE_URL`** connection string (it looks like
   `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`).
2. Set it as the `DATABASE_URL` env var in Vercel (Step 2.4).
3. **Create the tables** on Neon — run locally with the Neon URL:
   ```bash
   DATABASE_URL='postgresql://...your-neon-url...' bunx prisma db push
   ```
4. (Optional) Re-seed the demo Pro key on Neon:
   ```bash
   DATABASE_URL='...neon-url...' bun -e "import {db} from './src/lib/db.ts'; await db.licenseKey.upsert({where:{key:'GP4-PRO-DEMO-2026'},create:{key:'GP4-PRO-DEMO-2026',plan:'pro',monthlyCap:1000,usageMonth:new Date().toISOString().slice(0,7)},update:{}}); console.log('seeded')"
   ```
5. Redeploy on Vercel (or it auto-redeploys on the next git push).

## Step 4 — Lemon Squeezy paywall (Pakistan-friendly Merchant of Record)
Lemon Squeezy supports Pakistan-based sellers (payout via Payoneer → your local
bank) and handles global VAT/sales tax for you.
1. Sign up at https://lemonsqueezy.com (free) → create a **store**.
2. Create two **products** (with recurring billing):
   - **Pro — $49/mo** (variant id → note it).
   - **Business — $199/mo** (variant id → note it).
   Enable **License keys** on each product so a key is emailed on purchase.
3. Open the product → **Checkout** → copy the checkout URL (looks like
   `https://your-store.lemonsqueezy.com/buy/abc123`) → set it as the Vercel env
   var `NEXT_PUBLIC_LEMON_CHECKOUT`.
4. Set up the **webhook**: https://app.lemonsqueezy.com/settings/webhooks
   - Endpoint URL: `https://<your-vercel-domain>/api/license/lemonsqueezy-webhook`
   - Events: `license_key_created`, `license_key_activated`,
     `subscription_cancelled`.
   - Copy the **Signing secret** → set as Vercel env var
     `LEMON_SQUEEZY_SIGNING_SECRET`.
5. The webhook maps a purchased product → a `LicenseKey` (plan=pro/business,
   monthlyCap=1000/10000) the moment a customer pays. The customer receives the
   key by email, pastes it on the landing page, and the engine unlocks.

## Step 4b — Payoneer (for the SMB pay-per-PO path, $9/PO one-off)
Lemon Squeezy handles the recurring Pro/Business subscriptions automatically.
For the SMB segment (2-3 shipments/year who won't subscribe), the paywall also
shows a **"Pay $9 via Payoneer"** one-off button. Payoneer is Pakistan-friendly
and pays out directly to your local bank.
1. Sign in to your Payoneer account → **Receive → Request a Payment** (or set up a
   **Payoneer Checkout** link for $9).
2. Copy the payment link → set it as the Vercel env var `NEXT_PUBLIC_PAYONEER_PAY_URL`.
3. When an SMB pays $9 via Payoneer, you receive a payment notification by email.
   Then **issue them a license key manually**:
   ```bash
   DATABASE_URL='...neon-url...' bun -e "import {db} from './src/lib/db.ts'; const k='GP4-PPO-'+Math.random().toString(36).slice(2,8).toUpperCase(); await db.licenseKey.create({data:{key:k,plan:'payperpo',monthlyCap:1,email:'<buyer-email>'}}); console.log('issued:',k)"
   ```
   Email the key to the buyer — they paste it on the landing page → 1 calculation unlocks.
   (Payoneer doesn't auto-webhook like Lemon Squeezy, so the pay-per-PO path is
   semi-manual: you issue the key after the $9 lands. This is fine for the SMB volume.)

## Step 5 — Test + share
1. Visit your `*.vercel.app` link → you see the paywall landing (pitch + pricing
   + key entry + free-preview).
2. Click **Start free preview** → 1 PO calculation unlocks (one-time trial, US only).
   OR enter **`GP4-PRO-DEMO-2026`** → Pro unlocks (all regions, export, CBP).
3. Upload a PO → **Run LCIE AI Agent** → the duty stack. Each run consumes 1
   from the quota; the header badge shows "pro · N left". The free trial is
   1 calc lifetime (no monthly reset) — the 2nd run returns HTTP 402 and
   re-shows the paywall (subscribe or pay $9/PO via Payoneer).
4. Share the Vercel link. Buyers click **Subscribe via Lemon Squeezy** → pay →
   get a key by email → paste → unlocked.

---

## Summary of the 3 things only you can do (the rest is built)
1. **GitHub** — push the repo (Step 1).
2. **Vercel + Neon** — import the repo + add the `DATABASE_URL` (Steps 2–3).
3. **Lemon Squeezy** — create the store/products + paste the checkout URL,
   signing secret, + webhook URL (Step 4).

After those three, your permanent link is live, paywalled, and billing through
Lemon Squeezy (Pakistan-friendly payouts to your bank via Payoneer).
