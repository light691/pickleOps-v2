# PickleOps

Operations dashboard for a Philippine pickleball venue. Front-desk staff run the day from one screen: court bookings, walk-ins, shared Open Play sessions, payment verification and reports.

## Features

- **Today:** one status card per court, with live session state and quick actions
- **Court booking:** create, edit, start, end and cancel bookings; overlaps are rejected on the server inside a single transaction and returned as `409 Conflict`
- **Calendar:** day view across all courts
- **Open Play:** staff-managed shared sessions with capacity, registrations, waitlist promotion, attendance and per-player fees
- **Payments:** review queue for submitted payments where staff record a verdict on each one
- **Reports:** utilization and revenue aggregates
- **Settings:** venue settings, courts and staff, with role checks enforced on the server
- Light and dark themes; desktop-first, responsive down to mobile

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Hono on Node.js (one process serves the API and the SPA) |
| Database | SQLite via the built-in `node:sqlite` module |
| Auth | Session cookies, `scrypt` password hashing |
| Testing | `node:test` against in-memory SQLite, Playwright UI flows |

Money is stored as integer centavos, and all dates and times use Asia/Manila.

## Getting started

Requires Node.js 24 or later.

```bash
npm install
npm run dev
```

Optional: load demo bookings for today.

```bash
node scripts/seed-demo.mjs
```

## Tests

```bash
node --test server/domain/*.test.ts server/routes/*.test.ts
npm run typecheck
```

## Project layout

```
server/
  index.ts        Hono app, route mounting, dev middleware, static serving
  domain/         business rules (booking overlap, fees, Today view)
  routes/         one route group per screen, each with tests
  *.sql           schema
shared/types.ts   types shared by client and server
src/              React app (views, drawers, API client)
docs/architecture.md
```

See [docs/architecture.md](docs/architecture.md) for design decisions.
