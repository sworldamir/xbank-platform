# XBank — Multilingual Financial Platform Demo

A runnable research/student prototype inspired by the supplied XBank dashboard reference. It includes a multilingual user workspace (English, Arabic, Turkish) and a Persian RTL administration panel.

> **Important:** This repository is a UI and workflow prototype only. Balances, deposits, projects, returns, referrals, loans, withdrawals and lottery data are simulated. It does not connect to a bank, payment processor, blockchain RPC, wallet provider or investment venue. Approving a deposit only updates the local demo JSON store. Do not use this application to accept, hold, invest or pay real customer funds.

## Included workflows

- User dashboard with portfolio snapshot, sample market watch, projects, updates and quick actions.
- User language selector: English (LTR), Arabic (RTL), Turkish (LTR). Choice is persisted in browser local storage.
- Deposit request form using the wallet addresses configured by the administrator.
- Deposit requests are sent to the admin review queue. Admin can approve/reject; approval changes the demo balance once and records an audit event.
- Persian administration panel with summary metrics, user search and detailed wallet report, deposit queue, project management, settings and CSV export.
- Administrator can change the displayed deposit addresses and homepage statistics. Changes persist in `data/db.json` and immediately appear in the user deposit form.
- Demo balance adjustment creates an activity/audit record. It is not a real accounting ledger.
- Projects can be added in all three languages and their status/featured flag can be changed.

## Publish to the existing GitHub repository

After extracting this folder, open PowerShell in the `xbank-platform` folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\push-to-github.ps1
```

The script verifies that the active GitHub CLI account is `sworldamir`, sets the repository remote to `https://github.com/sworldamir/xbank-platform`, commits the source and pushes the `main` branch.

## Run on Windows with PowerShell

Prerequisites: Node.js 22 LTS (or compatible modern Node.js) and npm.

```powershell
cd xbank-platform
npm install
npm run dev
```

Open:

- User website: http://localhost:5173
- Persian admin panel: http://localhost:5173/admin
- API health: http://localhost:4000/api/health

The API server writes demo data to `data/db.json`. The file is ignored by Git so local demo activity is not committed.

## Run with Docker

Install Docker Desktop, open PowerShell in this directory and run:

```powershell
docker compose up --build
```

Then open http://localhost:3000. Stop with `Ctrl+C`; remove containers with `docker compose down`. The `data` directory is mounted so demo data persists between container restarts.

## Seeded demo data

The prototype opens directly into a sample user workspace (Alex Morgan). The admin panel is opened from the gear icon or by visiting `/admin`. There is no real authentication in this prototype; the admin route is not protected and must not be exposed to the public internet.

Two pending deposit requests are preloaded so the admin review workflow can be tested immediately. To reset all demo records, stop the app and delete `data/db.json`; the next startup recreates seed data.

## Cloudflare

Cloudflare is not required for local development or Docker execution. For a future public deployment, Cloudflare can provide DNS, TLS, WAF and proxy protection in front of a separately hosted application. It does not replace the application server or database. Before public deployment, replace the demo data store with PostgreSQL, implement authentication and role-based authorization, add a double-entry ledger, secure audit logging, backups, rate limiting, transaction verification and a legal/security review.

## Architecture note

This deliberately small prototype uses a Vite + React client and an Node.js HTTP API with a file-backed JSON store to make the demo easy to run and inspect. The JSON store is suitable only for a single-instance local prototype. It is not concurrency-safe or appropriate for multiple users or production financial records. A production/research-next iteration should move persistence to PostgreSQL and implement proper identity, authorization, database transactions and financial-ledger invariants.
