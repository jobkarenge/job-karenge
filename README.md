# Job Karenge — Full-Stack Recruitment & Career Platform

Job Karenge is a production-ready recruitment platform built with React, Vite, Tailwind CSS, Express, TypeScript, Socket.IO, Cloudinary, MongoDB (with an automatic local JSON fallback in development), and **Brevo v3** for transactional and promotional email infrastructure.

---

## Core Email Infrastructure Architecture (Brevo v3)

All email workflows are handled exclusively server-side (`server/src/`) without exposing credentials to the browser:

- `server/src/config/brevo.ts` — Centralized Brevo v3 Axios HTTP client (`https://api.brevo.com/v3`), runtime sender configuration (Admin Settings override + server env fallback), and masked diagnostics.
- `server/src/services/brevoService.ts` — Official Brevo API v3 integration (`/smtp/email`, `/account`, `/contacts`, `/contacts/lists`, `/emailCampaigns`, `/emailCampaigns/{id}/sendNow`), rate-limit (`429`) & `5xx` exponential backoff retries, and recipient validation.
- `server/src/services/emailTemplateService.ts` — Responsive HTML email shell with Job Karenge branding, HTML-to-plaintext conversion, XSS-safe escaping, and signed JWT unsubscribe tokens.
- `server/src/templates/` — Modular HTML templates (`welcomeEmail.ts`, `applicationEmail.ts`, `shortlistEmail.ts`, `interviewEmail.ts`, `selectionEmail.ts`, `rejectionEmail.ts`, `promotionalEmail.ts`).
- `server/src/services/emailService.ts` — Central orchestrator for all transactional & promotional dispatches, delivery logging (`queued` on API acceptance, promoted to `delivered`, `bounced`, or `failed` only via real Brevo webhooks), unsubscribe synchronization, and candidate-job preference matching.
- `server/src/services/schedulerJobs.ts` — Persistent DB-backed background scheduler (survives restarts via `PlatformSetting.schedulerState`) driving daily/weekly job digests, new job alerts, featured job announcements, scheduled campaigns, job auto-expiry, and 24-hour interview reminders.

### Transactional Emails Preserved
- Welcome & email verification (`welcome_verification`)
- Password reset (`password_reset`)
- Application confirmation (`application_confirmation`)
- Application shortlisted (`application_shortlisted`)
- Interview scheduled (`interview_scheduled`), rescheduled (`interview_rescheduled`), cancelled (`interview_cancelled`), and 24-hour reminder (`interview_reminder`)
- Candidate selected (`candidate_selected`) & candidate rejected (`candidate_rejected`)
- Recruiter/account notifications (`account_notification`)

### Promotional Automation & Candidate Preferences
- Daily job digest, weekly job digest, instant matching new job alerts, featured job announcements, and custom scheduled admin campaigns.
- Candidates manage preferences under `/candidate/email-preferences` (`dailyJobAlerts`, `weeklyJobAlerts`, `newJobNotifications`, `featuredJobAnnouncements`, `promotionalEmails`, preferred categories, skills, locations, remote preference, experience, and employment types) and changes sync directly to Brevo Contacts (`JOB_KARENGE_CANDIDATES` list).
- Unsubscribing opts candidates out of promotional campaigns cleanly while ensuring transactional hiring emails (application updates, interview schedules, password resets) always continue.
- Duplicate sends are prevented using persistent `dedupeKey` tracking (`daily:<UTC_DATE>:<USER_ID>`, `weekly:<ISO_WEEK>:<USER_ID>`, `new_job:<JOB_ID>:<USER_ID>`, `featured_job:<JOB_ID>:<USER_ID>`).

---

## Environment Variables

Copy `.env.example` to `.env` or set these secrets in your hosting environment:

```env
# Server
PORT=3000
NODE_ENV=development
CLIENT_URL=https://your-domain.com
SERVER_URL=https://your-domain.com

# Database (leave empty in preview for local JSON persistence)
MONGODB_URI=

# Auth & Token Secrets
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
EMAIL_VERIFICATION_SECRET=
PASSWORD_RESET_SECRET=

# Optional Uploads (Cloudinary)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Brevo Email API v3 (Server-Side Only)
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=Job Karenge
BREVO_BASE_URL=https://api.brevo.com/v3
BREVO_WEBHOOK_SECRET=your-webhook-shared-secret
```

> **Security Note:** `BREVO_API_KEY` and `BREVO_WEBHOOK_SECRET` are strictly server-side secrets and are never exposed in frontend UI or API responses. Only non-secret sender display overrides (`BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `CLIENT_URL`, `SERVER_URL`) can be adjusted in Admin Governance Settings.

---

## Brevo Setup Guide (Step-by-Step)

### 1. Create a Brevo Account & Activate Transactional SMTP
1. Visit [https://www.brevo.com](https://www.brevo.com) and register an account (or sign in to your existing Brevo workspace).
2. Complete your organization profile and verify your account phone number.
3. Open **Transactional** in the left sidebar of Brevo to ensure Transactional (SMTP / API) sending is activated. If API dispatches return `Brevo 403 [permission_denied]: Unable to send email. Your SMTP account is not yet activated`, email `contact@brevo.com` from your registered Brevo email address requesting SMTP activation.

### 2. Generate a Brevo v3 API Key
1. In the Brevo dashboard, click your **Profile / Account name** in the top-right corner and select **SMTP & API**.
2. Open the **API Keys** tab and click **Generate a new API key**.
3. Give it a descriptive name (e.g., `job-karenge-production`) and copy the generated key immediately (`xkeysib-...`).

### 3. Verify Your Sender Email & Sending Domain
1. Go to **Senders, Domains & Dedicated IPs** in Brevo settings.
2. Add your sender email under **Senders** (e.g., `noreply@yourdomain.com`) and verify it via the confirmation email, **OR** verify your entire sending domain under **Domains** (strongly recommended for production deliverability).

### 4. Configure DNS Records (SPF, DKIM, and DMARC)
Inside your DNS provider (Cloudflare, Route53, GoDaddy, Namecheap, etc.), add the TXT/CNAME records shown in Brevo's **Domains -> Authenticate** screen for your domain:

| Record Type | Host / Name | Value / Target | Purpose |
| :--- | :--- | :--- | :--- |
| **TXT (SPF)** | `@` (or subdomain) | `v=spf1 include:spf.brevo.com ~all` (merge if an existing SPF TXT record exists) | Authorizes Brevo servers to send on your domain's behalf |
| **TXT / CNAME (DKIM)** | `mail._domainkey` (or `brevo1._domainkey` / `brevo2._domainkey` as shown in Brevo) | Cryptographic public key / CNAME value generated by Brevo | Cryptographically signs outgoing emails against tampering |
| **TXT (Brevo Code)** | `@` | `brevo-code:<your-brevo-verification-token>` | Proves domain ownership inside Brevo |
| **TXT (DMARC)** | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100; adkim=s; aspf=s` | Instructs inbox providers how to handle SPF/DKIM failures and sends alignment reports |

Wait for DNS propagation and click **Authenticate this domain** inside Brevo until SPF, DKIM, and DMARC all show **Verified**.

### 5. Configure Environment Variables
Add your credentials to server secrets (never commit `.env` files with real secrets):
```env
BREVO_API_KEY=xkeysib-your-actual-key-here
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=Job Karenge
BREVO_BASE_URL=https://api.brevo.com/v3
BREVO_WEBHOOK_SECRET=choose-a-strong-random-string
```
Restart the server (`npm run dev` or production restart).

### 6. Test Transactional Emails & Configure Webhooks
1. Sign in as **Admin** and navigate to `/admin/campaigns`.
2. In the **Active Brevo Configuration** panel, click **Verify Account** to confirm live `/v3/account` authentication.
3. Enter a recipient address in **Send Test Email** and click **Send Test Email**.
   - Initial API acceptance marks the delivery log as **`queued`** (`brevoEvent: api_accepted`).
4. To receive real delivery (`delivered`), bounce (`bounced`), open, click, and unsubscribe tracking:
   - In Brevo -> **Transactional -> Settings -> Webhooks** (and **Campaigns -> Settings -> Webhooks**), add URL:
     ```text
     https://<YOUR_SERVER_DOMAIN>/api/email/webhooks/brevo?secret=<YOUR_BREVO_WEBHOOK_SECRET>
     ```
     *(or send the secret in the `X-Brevo-Webhook-Secret` header)*.
   - Select events: `delivered`, `soft_bounce`, `hard_bounce`, `blocked`, `invalid_email`, `deferred`, `opened`, `click`, `unsubscribed`.
   - When Brevo delivers the test message, the log status automatically updates from `queued` to `delivered`.

### 7. Configure Promotional Campaigns & Contact Sync
1. From `/admin/campaigns`, click **Sync Contacts to Brevo** to ensure existing active candidates are synchronized with your Brevo `JOB_KARENGE_CANDIDATES` list along with their subscription attributes.
2. Create a new campaign with a **Name**, **Subject Line**, **Audience** (`All Subscribed Candidates`, `Daily`, `Weekly`, or `Featured`), and optional **Scheduled Date/Time**.
3. Scheduled campaigns run automatically via the persistent scheduler (`schedulerJobs.ts`), or click **Dispatch** to send immediately and **Sync Stats** to pull latest Brevo campaign metrics alongside tracked webhook counters.

---

## Local Development & Verification

```bash
npm install
npm run lint
npm run build
npm run dev
```

---

## Project Structure

- `client/` — Standalone React + Vite + Tailwind CSS frontend (`client/src`, `client/public`, `client/index.html`, `client/vite.config.ts`, `client/package.json`).
- `server/` — Standalone Express + Socket.IO + MongoDB + Brevo v3 backend (`server/server.ts`, `server/src`, `server/package.json`).

---

## Production Deployment (Split Hosting vs Single Full-Stack Host)

### Option A: Split Hosting (Netlify `client/` + Render/Railway `server/`)
1. **Deploy Backend (`server/`)** on Render, Railway, Cloud Run, or a VPS:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start` *(runs `node server.ts`)*
   - Set environment variables (`PORT`, `NODE_ENV=production`, `MONGODB_URI`, `CLIENT_URL=https://your-site.netlify.app`, `SERVER_URL`, JWT secrets, Cloudinary, Brevo).
2. **Deploy Frontend (`client/`)** on Netlify or Vercel:
   - **Base Directory**: `client` (also configured automatically via root `netlify.toml`)
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist` (`client/dist`)
   - Set `VITE_API_URL=https://<your-backend-domain>` in Netlify **Site configuration -> Environment variables**, or enable the `/api/*` and `/socket.io/*` proxy rules inside `client/netlify.toml`.

### Option B: Single Full-Stack Host (From Repository Root)
1. **Build Command**: `npm run build` *(builds `client/dist`)*
2. **Start Command**: `npm start` *(runs `node server/server.ts`, serving both `/api/*` and `client/dist`)*
3. Leave `VITE_API_URL` empty for same-origin `/api`.


