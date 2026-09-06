# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Prototype-specific design direction

- Match the supplied FlowDesk reference: dark charcoal operations dashboard, narrow black sidebar, compact Space Grotesk typography, 8–12px spacing rhythm, low-contrast borders, and restrained lavender, pink, gold, mint, and coral status accents.
- Adapt the visual language to a Philippine pickleball venue without copying the CRM content.
- Keep the primary experience desktop-first and dense, with responsive tablet and mobile behavior.
- Keep utilization and performance analytics on Reports, not Today.
- Today should use one minimal status card per court instead of kanban-style status columns.
- Connection status in the top bar is icon-only; expose Online/Offline through accessible text and tooltip.
- Open Play is a separate staff-managed workflow for shared sessions with capacity, registrations, waitlist, attendance, and per-player fees.
- Surface Open Play on Today and Calendar only when operationally relevant; keep its management in a dedicated section between Calendar and Payments.
- The global creation action offers Court booking, Open Play session, and Walk-in.
- Reports owns performance metrics and keeps utilization, booking outcomes, busy hours, and payment mix together with simple Today, 7-day, and 30-day ranges.
- Settings is organized around Venue, Courts & rates, Payments, and Staff; keep configuration compact, editable, and staff-friendly rather than exposing technical administration.

## Build decisions

- One Node process serves the API and the client. `npm run dev` mounts Vite middleware. Production serves `dist/client` from the same process.
- API is Hono with node:sqlite in one `pickleops.db` file. Money is integer centavos. Times are minutes from midnight, Asia/Manila.
- Domain rules live only in `server/domain/venue.js`. The client never computes prices or statuses.
- Multi-tenant from day one. Organizations own venues and every row is venue-scoped.
- The full contract is `docs/architecture.md`. Build against it.

- Today court cards should use minimal neutral surfaces with explicit status dots and labels; keep court identity, customer, and essential timing visible. Reveal secondary details on hover and keyboard focus, with a tap-accessible info control.
- Keep operational panels compact and independently scrollable when lists are long. Avoid repeating per-player payment status; keep roster/session and payment actions visible while their records scroll.

## Today UI decisions (September 2026)

- Today is an operations surface: keep the existing charcoal FlowDesk language and shell, with one neutral card per court and no analytics or utilization metrics.
- Use one count-bearing status filter toolbar for All courts, Available, In play, Arriving soon, Open Play, and Overtime. Counts remain visible even when a state is zero, and the All courts count is the venue total.
- Court cards keep server-derived status, dot, court identity, customer, and essential timing visible. Keep secondary session detail progressively disclosed on hover, keyboard focus, or the info control. Card actions use clear text labels and preserve existing booking, Calendar, and Open Play handlers.
- Keep the Needs attention and Open Play panels compact and independently scrollable when populated. Open Play rows show the session name, time, registrations/capacity, waitlist, and a clear Manage action.
