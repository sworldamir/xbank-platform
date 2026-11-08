# XBank Platform — secured application foundation

XBank is a multilingual web application with a separate Persian administration workspace. The application now uses PostgreSQL, server-side sessions, password hashing, CSRF protection, role-based API authorization and a double-entry ledger foundation. It is designed to be built and deployed as a single application service backed by PostgreSQL.

**Operational boundary:** this repository is not, by itself, authorisation to accept deposits, custody cryptoassets, offer investments, pay returns, extend credit or run paid prize draws. Financial feature flags default to OFF. Loans and paid lottery endpoints remain unavailable. Deposit crediting is a controlled manual workflow and does not independently verify an on-chain transfer. Before processing real customer funds, obtain jurisdiction-specific legal advice, required licences, payment/custody arrangements, independent security review and an independently operated blockchain verification process. Do not enable financial features simply by changing a UI setting.

## Stack

- Frontend: React 19, TypeScript, Vite
- Backend: Node.js 22 native HTTP API
- Database: PostgreSQL 17; ordered SQL migrations in `migrations/`
- Authentication: Scrypt password hashes, opaque server-side sessions, HttpOnly cookies, CSRF token and role checks
- Ledger: integer minor-unit amounts, balanced debit/credit entries, database balance checks and immutable posted records
- Market data: Binance public Spot WebSocket feed; market quotes are informational only
- Deployment: Docker Compose; Cloudflare can sit in front of a separately hosted VPS

## Requirements

For local development on Windows:

- Node.js 22 LTS and npm
- Docker Desktop with Linux containers (for local PostgreSQL)
- PowerShell 7 or Windows PowerShell 5.1

## Local setup on Windows

1. Copy the environment template and set a long, random, alphanumeric PostgreSQL password. Keep `.env` private; it is ignored by Git.

```powershell
Copy-Item .env.example .env
notepad .env
```

Use the same password in `POSTGRES_PASSWORD` and in the password part of `DATABASE_URL`. Prefer a randomly generated alphanumeric value so it does not require URL encoding. Leave `NODE_ENV=development` for local development. Do not set the production financial approval variables for local testing.

2. Start PostgreSQL. The database port is bound only to `127.0.0.1` on the host.

```powershell
docker compose up -d db
```

3. Install packages and apply migrations.

```powershell
npm install
npm run db:migrate
```

4. Create the first administrator. The command prompts for an email and a strong password; password input is hidden. No default `admin/123` credential exists.

```powershell
npm run admin:create
```

5. Start the API and Vite development server.

```powershell
npm run dev
```

Open:

- Public website: http://localhost:5173/
- User sign-in: http://localhost:5173/login
- User registration: http://localhost:5173/register
- Private administration sign-in: http://localhost:5173/admin/login
- Admin workspace (after staff login): http://localhost:5173/admin
- API health: http://localhost:4000/api/health

Staff accounts must use `/admin/login`. The public website does not expose an administration link. API authorization is enforced on the server; hiding a route or a button is not treated as access control.

## Docker deployment

1. Configure `.env` first. At minimum set a strong `POSTGRES_PASSWORD`, matching `DATABASE_URL` if you use host-side scripts, `ALLOWED_ORIGINS`, and `PUBLIC_BASE_URL`.
2. For production email verification and password recovery, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM`. Set `PUBLIC_BASE_URL` to the canonical HTTPS site URL.
3. Keep the financial operation flags disabled until the required approvals and controls have been independently confirmed.
4. Build and start:

```powershell
docker compose up -d --build
```

The container entrypoint applies database migrations before starting the application. Open http://localhost:3000.

Create the first admin in an interactive terminal:

```powershell
docker compose exec xbank node scripts/create-admin.mjs
```

The command fails if a staff account already exists. This is an initial bootstrap command, not a password recovery mechanism.

View logs and stop services:

```powershell
docker compose logs -f xbank
docker compose down
```

`docker compose down` preserves the named PostgreSQL volume. Do not use `docker compose down -v` unless you intentionally want to destroy the database.

## Authentication and administration

- Customer registration and login are separate from staff login.
- Staff roles: `admin`, `finance`, `support`; customer role: `customer`.
- Passwords are Scrypt-hashed. Session tokens are stored as hashes in PostgreSQL and delivered in HttpOnly cookies.
- Mutating API requests require a CSRF token and an allowed Origin.
- Production email verification is enforced when `EMAIL_VERIFICATION_REQUIRED=true`; SMTP must be configured.
- Password recovery uses expiring, one-use tokens. In development only, the API returns a development reset URL to support local testing. Production returns a generic response and sends the token by email.
- Suspended/closed customers have active sessions revoked.
- User and admin activity is written to `audit_logs`.

## Financial controls

- Amounts are represented in integer minor units; don't use JavaScript floating point for ledger calculations.
- Posted ledger entries are append-only. Reversals/corrections must be recorded as compensating transactions.
- PostgreSQL deferred constraints check that each posted ledger transaction has at least two entries and that total debits equal total credits.
- The admin reconciliation endpoint compares customer wallet balances with ledger balances.
- Deposits require review by an authorised finance/admin role. Reviewers must independently verify chain, chain ID, token contract, recipient and exact received amount. A TXID string or screenshot alone is not proof. This code does not yet integrate a trusted chain RPC/indexer for automated verification.
- Withdrawals reserve available balance, require a separate approval, and can only be marked paid after an external payout has happened and the reviewer records a TXID. This app does not sign or broadcast transactions.
- Manual ledger adjustments are disabled in production by default. Enabling them requires a separately controlled policy; the API always records a reason and supporting reference.
- Investments are guarded by server-side global feature flags, customer email/identity verification, project approval and balance checks. Do not activate them until the legal and financial basis is approved.
- Loans and paid lottery endpoints intentionally return `423 Locked` until their legal, licensing, funding and operational models are approved and implemented.
- Referral rewards are not immediately credited; they remain pending compliance review.

## Market data

The public Binance Spot market data WebSocket is consumed server-side using the official market-data-only stream endpoint. The UI receives snapshots through Server-Sent Events. Binance documents the individual 24-hour ticker stream at a 1,000 ms update speed and notes that a connection is limited to 24 hours; the service reconnects automatically and marks partial/stale data rather than presenting an old quote as live. See the [official Spot WebSocket stream documentation](https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md). Market values are indicative exchange quotes in USDT, not a consolidated global price and not an accounting rate. The feed is not used to value or credit customer balances.

## Local site population (synthetic test records)

After PostgreSQL is healthy, migrations are applied, and the first administrator is created, populate the local workspace with linked test records:

```powershell
npm run seed:site
```

The command prompts for a password for the `Argon` test account (input is hidden) and stores only a Scrypt hash. Use the requested local test password when prompted. The seed creates 23 synthetic customer accounts (Argon plus 22 referred accounts across three referral levels), eight multilingual projects, wallet/ledger examples, reviewed and pending deposit examples, investment history, withdrawal history, loan applications, mission progress, referral rewards, support tickets/replies, sample project entitlements/distributions, and four lottery rounds with sample ticket entries. It also creates visibly invalid deposit-address placeholders only when no active admin-configured address exists.

Every seeded public record is prefixed `XB-DEMO-` and carries synthetic notes. Test records use `.example.test` email addresses and `TEST-ONLY` wallet addresses / `SYNTHETIC-TXID` references. These values are not valid payment details. The feature flags for all real financial operations stay disabled. The seeder refuses to run in `NODE_ENV=production`, refuses to overwrite an existing non-seed user with a colliding username/email, and uses deterministic identifiers so a repeat run does not multiply the same seeded records. Re-running will reset the sample Argon password and synthetic wallet snapshots; use it only to reset the local sample dataset, not after treating seeded balances as real user activity.

Test user: `Argon` · Email: `argon@example.test`. The test password is entered interactively and is not embedded in source code. Change it before any shared or network-accessible use.

## GitHub

Repository: https://github.com/sworldamir/xbank-platform

After applying source updates locally:

```powershell
git status --short
git add -A
git commit -m "feat: harden XBank application foundation"
git push origin main
```

## Checks

```powershell
npm test
npm run build
```

The test suite currently covers market-feed parsing, partial-vs-live freshness state, configured assets and password-hash policy primitives. Manual mission submissions can be resubmitted after rejection; review decisions and notes are audited. A production release still requires database integration tests against a real PostgreSQL instance, end-to-end browser tests, external penetration testing, backup/restore drills, dependency review and legal/compliance sign-off. A successful frontend build does not prove those controls.

## Not yet production-authorised

The codebase is a stronger application foundation, not a certification that the overall XBank business model is legal, solvent, licensed, insured, or safe to accept public funds. Before any public financial launch, complete a formal threat model and security review, verify identity and sanctions/AML controls as applicable, establish custody/payment provider arrangements, deploy chain monitoring and reconciliation, add operational incident response and independently validate the financial product terms in each target jurisdiction.
