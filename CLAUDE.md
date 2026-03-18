# Safeheld

The global client funds verification layer — proving client money is safeguarded across every regulated sector and jurisdiction. An autonomous compliance engine that replaces manual safeguarding work entirely.

## What It Does

Core engine: reconciliation, breach detection, audit trail, governance, reporting, bank oversight. Live at app.safeheld.com.

## Regulatory Modules

Modular overlays on the core engine:

| Module | Scope | Status |
|--------|-------|--------|
| PS25 | UK EMIs/PIs | Built and live |
| CASS | UK investment firms (CASS 6/7/10, CMAR reporting) | To build |
| Crypto | On-chain wallet reconciliation, proof of reserves, hot/cold wallet monitoring | To build |
| Stablecoin | Peg verification, reserve proof, issuer compliance | To build |
| MiCA | EU crypto regulation | To build |
| GENIUS Act | US stablecoin regulation | To build |
| Legal | SRA client money rules | Future |
| Insurance | FCA client premium rules | Future |
| Gaming | Gambling Commission player funds | Future |
| Real estate | Client deposit protection | Future |

## Brand

- Primary: deep navy `#0C1445`
- Accent: bright blue `#3D3DFF`
- Tone: banking-grade trust, not startup. Like vanta.com.

## Tech Stack

- **API:** TypeScript, Express, Prisma, PostgreSQL, Redis, Pino logging, Sentry error tracking
- **Web:** React, Vite, TypeScript, React Router, TanStack Query
- **Infra:** Docker Compose, Hetzner VPS, nginx, Let's Encrypt SSL
- **PDF:** PDFKit for report generation
- **Email:** Nodemailer (SMTP config via env vars, gracefully skips if unconfigured)
- **Auth:** JWT + MFA (TOTP via otpauth), bcrypt, passport

## Project Structure

```
packages/
  api/          Express API server (port 3001)
    src/
      modules/    auth, reconciliation, breach, reporting, governance, audit, admin, bank-dashboard
      middleware/  auth, errorHandler
      utils/      email, pdf, crypto, prisma, redis, logger
    prisma/       schema + migrations + seed
  web/          React frontend (Vite, port 8080)
    src/
      pages/      dashboard, upload, reconciliation, breach, reports, governance, audit, bank-dashboard, admin, auth
      components/ ui (Button, Card, Table, etc.), layout (Sidebar, TopBar, Layout)
      api/        client.ts (axios with token refresh)
      hooks/      useAuth
```

## Deployment

- **Server:** 46.225.129.132 (root)
- **Project path on server:** `/opt/safeheld/`
- **Domains:** app.safeheld.com (main app), status.safeheld.com (status page)
- **Docker services:** postgres, redis, minio, api, web
- **Deploy flow:** commit → push → SSH pull on server → `docker compose build <service>` → `docker compose up -d`
- **GitHub:** github.com/safeheld/safeheld-deploy

## User Roles

| Role | Access |
|------|--------|
| ADMIN | Everything |
| COMPLIANCE_OFFICER | All firm pages, audit log |
| FINANCE_OPS | Dashboard, upload, reconciliation, breaches, reports, governance |
| AUDITOR | Dashboard, reconciliation, breaches, reports, governance, audit log |
| BANK_VIEWER | Bank Dashboard only (blocked from all firm-specific pages) |

## Key Conventions

- CSS variables defined in `packages/web/index.html` (navy palette from `#0C1445`, accent from `#3D3DFF`)
- All components use inline React styles referencing CSS variables
- API responses follow `{ status: "success", data: ... }` or `{ status: "error", error: { code, message } }`
- Auth rate limit: 10 requests per 15 minutes per IP (in-memory, resets on API restart)
- MFA secrets are AES-256-GCM encrypted in DB using `MFA_ENCRYPTION_KEY` env var
- PDF exports use blob download pattern (not window.open) to include auth headers
