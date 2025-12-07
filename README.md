# FinFlow

[![Node Version](https://img.shields.io/badge/node-22.14.0-339933?logo=node.js)](https://nodejs.org/en/download)
[![Astro](https://img.shields.io/badge/Astro-5.x-FF5D01?logo=astro&logoColor=white)](https://astro.build/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/license-TBD-lightgrey.svg)](#8-license)

A desktop‑first personal finance app (MVP) focused on manual income/expense tracking with a closed set of categories, saving goals, and clear monthly summaries and visualizations.

## Table of Contents

- [1. Project name](#1-project-name)
- [2. Project description](#2-project-description)
- [3. Tech stack](#3-tech-stack)
- [4. Getting started locally](#4-getting-started-locally)
- [5. Available scripts](#5-available-scripts)
- [6. Project scope](#6-project-scope)
- [7. Project status](#7-project-status)
- [8. License](#8-license)

## 1. Project name

FinFlow

## 2. Project description

FinFlow is a web application (desktop‑first) that simplifies personal finance control. Users manually add incomes and expenses from a closed list of categories, create saving goals, and review monthly summaries and charts. The MVP includes authentication, a transactions list with filters, a dashboard, and goal management. There are no bank integrations and no mobile app in the MVP.

Key characteristics from the Product Requirements Document (PRD):

- Currency: PLN, amounts stored in cents (integers); input normalization accepts comma and dot; half‑even (banker’s) rounding in aggregations.
- Dates: reports use DATE (calendar month); audit logs use TIMESTAMP WITH TIME ZONE (UTC).
- Data safety: soft‑delete for business records; account hard delete within 24h (audit_log retained 30 days).
- API (planned): REST v1 endpoints `/auth`, `/transactions`, `/goals`, `/goal-events`, `/me`.
- UX/quality: optimistic updates with fast rollback, inline validations, Polish i18n, saved filters in localStorage, accessibility for interactive components.
- Performance target: typical list queries ≤ 200 ms; keyset pagination by `(date, id)` with descending date.

References:

- PRD: `.ai/prd.md`
- Tech stack notes: `.ai/tech-stack.md`

## 3. Tech stack

- Application
  - Astro 5
  - React 19 (single large island for the app shell after login)
  - Tailwind CSS 4
  - shadcn/ui (on top of Radix UI primitives)
- Platform (planned)
  - Supabase: Postgres with RLS, Auth, and Edge Functions
  - Email via SMTP: Postmark with DKIM/SPF/DMARC; fast fallback to Resend or Brevo via configuration only
- Tooling and libraries
  - `@astrojs/react`, `@astrojs/node`, `@astrojs/sitemap`
  - `@tailwindcss/vite`
  - `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`
  - `lucide-react` (icons)
  - Charts (planned per PRD): Recharts
- Testing
  - Unit & Integration: Vitest with React Testing Library
  - E2E: Playwright
  - API Mocking: MSW (Mock Service Worker)
  - Integration DB: Testcontainers (PostgreSQL)
  - Coverage: Vitest Coverage (v8 provider)
- Runtime
  - Node.js 22.14.0 (see `.nvmrc`)

## 4. Getting started locally

Prerequisites:

- Node.js 22.14.0 (use `.nvmrc`)

Setup:

```bash
# Use the exact Node version
nvm use

# Install dependencies
npm install

# Start the dev server (Astro)
npm run dev
# Default: http://localhost:4321

# Build for production
npm run build

# Preview the production build
npm run preview

# Lint and fix
npm run lint
npm run lint:fix

# Format with Prettier
npm run format
```

Optional configuration (planned features):

- SMTP (Postmark) configuration for Supabase Auth emails; switchable to Resend/Brevo without code changes.

```bash
# .env (example) — only required if/when enabling SMTP-backed Auth
AUTH_SMTP_HOST=smtp.postmarkapp.com
AUTH_SMTP_PORT=587
AUTH_SMTP_USER=<POSTMARK_USERNAME_FROM_DOCS>
AUTH_SMTP_PASS=<POSTMARK_SERVER_TOKEN>
AUTH_EMAIL_FROM="FinFlow <no-reply@yourdomain.pl>"
```

See `.ai/tech-stack.md` for details and operational guidance (rate limits 3/30 min via an Edge Function, audit_log retention, backups/restore with GitHub Actions).

## 5. Available scripts

These come directly from `package.json`:

- `dev`: start the Astro dev server
- `build`: build the site for production
- `preview`: preview the production build
- `astro`: run the Astro CLI directly
- `lint`: run ESLint across the project
- `lint:fix`: run ESLint with auto‑fix
- `format`: run Prettier on supported files
- `test`: run all tests (unit + integration)
- `test:unit`: run unit tests
- `test:unit:watch`: run unit tests in watch mode
- `test:unit:coverage`: run unit tests with coverage report
- `test:integration`: run integration tests
- `test:e2e`: run E2E tests with Playwright
- `test:e2e:ui`: run E2E tests in Playwright UI mode
- `test:all`: run complete test suite (unit + integration + E2E)

## 6. Project scope

In scope (MVP):

- Accounts & security: email/password sign‑up/login with email verification; password reset with rate limiting (3 per 30 min). Access allowed only after email verification.
- Data & model: transactions (INCOME/EXPENSE) with closed category dictionaries; goals with `DEPOSIT`/`WITHDRAW` events; monthly change indicator; audit_log with 30‑day retention.
- Transactions: add/edit/soft‑delete; default sort by date (desc), filters by type/month/category/text; keyset pagination by `(date, id)`; 50 records per page.
- Dashboard & reporting: four monthly cards (Income, Expenses, Net saved, Free funds) and two visualizations (category expenses bar chart, priority goal progress with current month delta). Time navigation with month/year switch.
- UX & quality: optimistic updates with quick rollback; inline validations; Polish toasts via centralized i18n; saved filters in localStorage; basic responsiveness and accessibility; idempotency for critical writes.
- API surface (planned): REST v1 `/auth`, `/transactions`, `/goals`, `/goal-events`, `/me`; consistent error format for 4xx/5xx.

Out of scope (MVP):

- Bank integrations
- Subscriptions/payments
- Reminders/automatic alerts
- Multi‑currency support
- File import/export (CSV, etc.)
- Mobile apps (web only in MVP)
- Product telemetry and extensive e2e tests (postponed)
- Advanced CSP/CORS/CSRF policies and feature flags (to be clarified later)

## 7. Project status

- Status: Work in progress (MVP).
- Frontend skeleton: Astro 5 + React 19 + Tailwind 4 + shadcn/ui in place.
- Testing: Vitest (unit/integration) + Playwright (E2E); see `.ai/test-plan.md` for complete testing strategy.
- Planned (not yet added to dependencies): `@supabase/supabase-js` for data access and `recharts` for charts (per PRD).
- Documentation: see `.ai/prd.md` for full requirements, `.ai/tech-stack.md` for architectural notes, and `.ai/test-plan.md` for testing strategy.

## 8. License

TBD. No license file has been added yet.
