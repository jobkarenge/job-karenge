# Job Karenge — Full-Stack Recruitment & Career Platform

Job Karenge is a production-ready recruitment platform built with React, Vite, Tailwind CSS, Express, TypeScript, Socket.IO, Cloudinary, MongoDB (with an automatic local JSON fallback in development), and **Gmail SMTP via Nodemailer** for transactional and promotional email infrastructure.

---

## Core Email Infrastructure Architecture (Gmail SMTP + Nodemailer)

All email workflows are handled exclusively server-side (`server/src/`) without exposing credentials to the browser, while preserving **100% of Job Karenge's branded HTML email templates, design, colors, typography, and layouts**:

- `server/src/config/mailer.ts` — Singleton pooled Nodemailer Gmail SMTP transporter (`smtp.gmail.com`, port `465`, `secure: true`), runtime sender resolution (Admin Settings override + server env fallback), connection verification (`verifyGmailSmtpConnection()`), and masked diagnostics.
- `server/src/services/gmailSmtpService.ts` — Production Gmail SMTP dispatch wrapper with recipient/sender validation, header-injection protection (`\r`/`\n` sanitization), intelligent permanent-vs-transient error classification (fail-fast on `535`/`550`, exponential retry on `4xx`/socket drops), and secret redaction in logs.
- `server/src/services/emailTemplateService.ts` — Preserved responsive Job Karenge branded HTML email shell (`#102A43` navy header, `#F8FAFC` card surface, `#2563EB` CTA buttons, structured footer), HTML-to-plaintext conversion, XSS-safe escaping, URL protocol sanitization, and signed JWT unsubscribe tokens.
- `server/src/templates/` — Preserved modular HTML email templates (`welcomeEmail.ts`, `applicationEmail.ts`, `shortlistEmail.ts`, `interviewEmail.ts`, `selectionEmail.ts`, `rejectionEmail.ts`, `promotionalEmail.ts`).
- `server/src/services/emailService.ts` — Central orchestrator for all transactional & promotional dispatches, delivery logging (`sent` on SMTP acceptance, `failed` on SMTP rejection, `simulated` preview when credentials are absent), unsubscribe enforcement, and candidate-job preference matching.
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
- Candidates manage preferences under `/candidate/email-preferences` (`dailyJobAlerts`, `weeklyJobAlerts`, `newJobNotifications`, `featuredJobAnnouncements`, `promotionalEmails`, preferred categories, skills, locations, remote preference, and employment types).
- Unsubscribing opts candidates out of promotional campaigns cleanly while ensuring transactional hiring emails (application updates, interview schedules, password resets) always continue.
- Duplicate sends are prevented using persistent `dedupeKey` tracking.

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

# Gmail SMTP via Nodemailer (Server-Side Only)
EMAIL_PROVIDER=gmail
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
EMAIL_FROM_NAME=Job Karenge
EMAIL_FROM_EMAIL=your-gmail@gmail.com
```

> **Security Note:** `GMAIL_APP_PASSWORD` is strictly a server-side secret and is never exposed in frontend UI, logs, or API responses. Only non-secret sender display overrides (`EMAIL_FROM_EMAIL`, `EMAIL_FROM_NAME`, `CLIENT_URL`, `SERVER_URL`) can be adjusted in Admin Governance Settings.

---

## Gmail SMTP Setup Guide (Google App Password — Step-by-Step)

Gmail no longer permits normal account passwords for SMTP login. You must use a **16-character Google App Password**:

### 1. Enable 2-Step Verification on Google Account
1. Sign in to the Google / Gmail account you want Job Karenge to send emails from.
2. Open [Google Account Security](https://myaccount.google.com/security).
3. Under **How you sign in to Google**, enable **2-Step Verification** if it is not already turned on.

### 2. Generate a 16-Character Google App Password
1. In Google Account Security, open **App passwords** (or visit [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
2. Enter an app name such as `Job Karenge Backend`.
3. Click **Create** and copy the generated 16-character password (spaces are stripped automatically by the server, or you can remove them yourself).

### 3. Configure Environment Variables (Local or Render)
Add the variables to `.env` locally or to your **Render -> Web Service -> Environment** tab:
```env
EMAIL_PROVIDER=gmail
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=your16charapppassword
EMAIL_FROM_NAME=Job Karenge
EMAIL_FROM_EMAIL=your-gmail@gmail.com
```
Restart the server (`npm run dev` locally or trigger a deploy on Render).

### 4. Verify & Test Live Sending from Admin Dashboard
1. Sign in as **Admin** and navigate to `/admin/campaigns` (or `/admin/governance`).
2. Check the **Active Gmail SMTP Configuration** card (`smtp.gmail.com:465`, SSL/TLS, masked `GMAIL_USER`, and 16-char password indicator).
3. Click **Verify SMTP Connection** to test live SMTP authentication against Gmail (`GET /api/admin/email-diagnostics?verify=true`).
4. Enter a recipient address in **Send Test Email** and click **Send Test Email**.
   - On SMTP acceptance, the delivery log records **`sent`** (`provider: gmail_smtp`, `smtpEvent: smtp_accepted`) with Gmail's returned `messageId`.

### 5. Troubleshooting Common Gmail SMTP Issues
- **`535 / EAUTH (Username and password not accepted)`**: Ensure 2-Step Verification is enabled and `GMAIL_APP_PASSWORD` is the 16-character App Password (not your regular Gmail login password).
- **Sender mismatch / spam filtering**: Set `EMAIL_FROM_EMAIL` equal to `GMAIL_USER` (or a verified Gmail **Send mail as** alias). Note that Gmail may rewrite custom `From` addresses back to `GMAIL_USER` unless the alias is verified in Gmail Settings.
- **Connection timeouts (`ETIMEDOUT`)**: Confirm outbound TCP port `465` (SSL/TLS) is permitted in your hosting/firewall environment.

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
- `server/` — Standalone Express + Socket.IO + MongoDB + Gmail SMTP (Nodemailer) backend (`server/server.ts`, `server/src`, `server/package.json`).

---

## Production Deployment (Split Hosting vs Single Full-Stack Host)

### Option A: Split Hosting (Netlify `client/` + Render/Railway `server/`)
1. **Deploy Backend (`server/`)** on Render, Railway, Cloud Run, or a VPS:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start` *(runs `node server.ts`)*
   - Set environment variables (`PORT`, `NODE_ENV=production`, `MONGODB_URI`, `CLIENT_URL=https://your-site.netlify.app`, `SERVER_URL`, JWT secrets, Cloudinary, Gmail SMTP `EMAIL_PROVIDER=gmail`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME`, `EMAIL_FROM_EMAIL`).
2. **Deploy Frontend (`client/`)** on Netlify or Vercel:
   - **Base Directory**: `client` (also configured automatically via root `netlify.toml`)
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist` (`client/dist`)
   - Set `VITE_API_URL=https://<your-backend-domain>` in Netlify **Site configuration -> Environment variables**, or enable the `/api/*` and `/socket.io/*` proxy rules inside `client/netlify.toml`.

### Option B: Single Full-Stack Host (From Repository Root)
1. **Build Command**: `npm run build` *(builds `client/dist`)*
2. **Start Command**: `npm start` *(runs `node server/server.ts`, serving both `/api/*` and `client/dist`)*
3. Leave `VITE_API_URL` empty for same-origin `/api`.
