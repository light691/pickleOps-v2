# PickleOps MVP architecture (arena synthesis)

## Problem

The mockup is a Vite React SPA with all data hardcoded and no backend. The MVP needs every mock replaced by persisted entities, the no-overlap rule enforced in exactly one place, staff roles enforced on the server, and a dev loop that verifies on Windows with no cloud account. The Sites handoff files stay intact.

## Usage

Staff books a walk-in for Court 3 from Today. The drawer calls one function.

```ts
// src/api.ts
export async function createBooking(input: NewBooking): Promise<Booking> {
  const res = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 409) throw new OverlapError(await res.json());
  if (!res.ok) throw new ApiError(await res.json());
  return parseBooking(await res.json());
}
```

```ts
// server/routes/bookings.ts
app.post("/api/bookings", (c) => {
  const input = validateBooking(unknownJson(await c.req.json()));
  requireRole(c.get("staff"), "book");
  return c.json(domain.createBooking(db, input, c.get("staff")), 201);
});
```

`domain.createBooking` runs the overlap SELECT plus the insert in one transaction and throws ConflictError on clash. The client renders the 409 by highlighting the clashing block. Remaining views call one endpoint group each. Calendar reads `GET /api/calendar?date=`. Open Play uses the `/api/openplay` group for sessions, registrations, and promotion. Payments reads the Review queue and patches verdicts. Reports renders aggregates. Settings reads and writes settings, courts, and staff.

## Shape

One Node process. `npm run dev` mounts Vite middleware for hot reload. Production serves `dist/client` plus the SPA fallback from the same process.

- `server/index.ts` owns the Hono app, route mounting, dev middleware, and static serving.
- `server/db.ts` plus `server/schema.sql` open the SQLite file, run migrations, and seed venue settings and courts once.
- `server/routes/*.ts` are thin handlers for bookings, sessions, calendar, openplay, payments, reports, settings, staff, courts, auth.
- `server/domain/venue.ts` is the one domain module. Overlap check, centavo fee and overtime math, BOOKING_FLOW and PAYMENT_FLOW transition maps with `canTransition`, waitlist promotion, auto-flip to Full at capacity, and the PERMISSIONS map all live here.
- `server/domain/validate.ts` returns field errors that handlers turn into 400s. `server/domain/errors.ts` holds ConflictError, ForbiddenError, NotFoundError.
- `shared/types.ts` holds branded types (`Centavos`, `MinutesFromMidnight`, `BookingId`, `OrgId`, `VenueId`), string-literal unions for every status, role, source, and level, discriminated unions where variants differ, and the `Organization`, `Venue`, and `StaffVenueMembership` entities. Both sides import it. Erasable syntax only, no enums, so Node 24 runs it with no build step.
- `src/api.ts` holds every fetch call and error mapping. `src/views/*.tsx` holds one module per view. `src/drawers/*.tsx` holds the two forms. `src/styles.css` carries over.

TypeScript runs strict. External data enters as `unknown` and parses into domain types at route boundaries. No `as` casts without validation. New union variants must extend the exhaustive switches or the build fails.

Money is integer centavos and times are minutes from midnight, Manila day. Fractional pesos are unrepresentable. Court status is never stored. The server derives Available, Arriving soon, In play, Open play soon, and Overtime from sessions. Booking ids keep the RP-240904-031 form, generated server-side. Marking a registration paid creates a PaymentSubmission in Review, so manual verification stays the single money gate. Today polls every 15 seconds. No SSE for MVP.

Auth is PIN login at `POST /api/auth/login` setting a signed cookie. Middleware resolves staff and checks the PERMISSIONS map. Every mutation records its actor. Attendants cannot verify payments or edit rates.

Tenancy is foundational, not a later phase. Organizations own venues. Every court, booking, session, registration, payment, and staff membership row carries a venue id, and every query scopes by it. Staff belong to an organization and reach venues through the membership table. Managers see all venues in their org. Attendants see assigned venues only. The client sends the active venue on every request and the server rejects cross-venue ids. Venue name, rates, payment details, and settings live per venue.

Interface depth is deliberate. Views see fetch, JSON, and string enums. The overlap transaction, rounding, state machines, promotion, role checks, derived statuses, and the dev/prod serving split hide behind `npm run dev`.

Decisions cite `boundary-discipline` (guards at routes, pure domain inside), `model-the-domain` (flow maps instead of scattered conditionals), `type-system-discipline` (unions, brands, and exhaustive switches instead of stringly typed code), and `laziness-protocol` (no ORM, no second process).

## Synthesis decision

Base is candidate B, single server. It won on the rubric: one command to verify, centavo integers, minutes-from-midnight times, derived court status. Grafted from candidate A: PIN login with signed cookie and the PERMISSIONS map, explicit BOOKING_FLOW and PAYMENT_FLOW maps with `canTransition`, explicit session start and end endpoints with fee computed on end, auto-flip to Full at capacity, and paid registration creating a Review submission. Rejected from B: the generic `PATCH /api/sessions/:id`, replaced by the explicit start and end endpoints. Rejected from A: the two-process split with proxy wiring, float peso amounts, and validators generated from a fields registry. No dropouts. Both candidates delivered.

## Tradeoffs accepted

- We accept a single server process in exchange for one-command dev and no proxy drift.
- We accept TypeScript strictness in exchange for compiler-checked unions, brands, and exhaustive switches across the client-server seam.
- We accept 15-second polling on Today in exchange for skipping realtime infrastructure in the MVP.
- We accept SQLite on disk in exchange for zero-dependency persistence; multi-device concurrency beyond one writer is out of scope.

## Alternatives considered

- Split client and server processes lost on verify cost. Two terminals and proxy ports add failure modes every run.
- A fullstack framework lost because the Sites worker serves static files, so it buys nothing here.
- Plain JS lost on your call. The compiler now checks the seam.
- better-sqlite3 and ORMs lost. Node 24 ships SQLite and eight tables do not need a mapper.

## Open questions and risks

- Is a 4-digit staff PIN an acceptable credential for venue staff, or should managers get passwords?
- Receipt screenshots need storage. Local disk works now, but what is the plan when this deploys?
- The 15-second poll keeps Today fresh enough for attendants, but is it enough during peak walk-in hours?

## Next implementation step

Build slice 1 against this sketch: server skeleton with schema, seed, auth, booking endpoints with overlap plus session start and end, `GET /api/today`, and the Today view with the booking drawer wired to real POST calls.
