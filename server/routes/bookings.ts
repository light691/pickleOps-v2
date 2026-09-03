import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { minuteOfDay, type BookingId, type MinutesFromMidnight } from "../../shared/types.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { parseBookingIdParam, parseBookingInput, unknownJson } from "../domain/validate.ts";
import { createBooking, endBooking, getToday, manilaNow, startBooking } from "../domain/venue.ts";
import { readAuth, requirePermission, requireStaff, requireVenue, type AuthedContext } from "../middleware.ts";

function errorStatus({ error }: { error: unknown }): { status: 400 | 403 | 404 | 409; body: Record<string, unknown> } {
  if (error instanceof ConflictError) return { status: 409, body: { error: error.message, clash: error.clash ?? null } };
  if (error instanceof ForbiddenError) return { status: 403, body: { error: error.message } };
  if (error instanceof NotFoundError) return { status: 404, body: { error: error.message } };
  if (error instanceof ValidationError) return { status: 400, body: { error: error.message } };
  throw error;
}

function parseOptionalMinute(value: unknown): MinutesResult {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value === "object" && value !== null && !("nowMinute" in value)) {
    return { ok: true, value: null };
  }
  if (!isMinuteRecord(value)) return { ok: false };
  try {
    return { ok: true, value: minuteOfDay(value.nowMinute) };
  } catch {
    return { ok: false };
  }
}

type MinutesResult =
  | { readonly ok: true; readonly value: MinutesFromMidnight | null }
  | { readonly ok: false };

function isMinuteRecord(value: unknown): value is { nowMinute: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "nowMinute" in value &&
    typeof (value as Record<string, unknown>).nowMinute === "number"
  );
}

function parseId({ raw }: { raw: string | undefined }): { id: BookingId } | { errors: Record<string, string> } {
  const parsed = parseBookingIdParam(raw);
  if (!parsed.ok) return { errors: parsed.errors };
  return { id: parsed.value };
}

export function createBookingRoutes({ db }: { db: DatabaseSync }): Hono<AuthedContext> {
  const app = new Hono<AuthedContext>();
  const staffOnly = requireStaff({ db });
  const venueOnly = requireVenue({ db });

  app.post("/api/bookings", staffOnly, venueOnly, requirePermission({ permission: "book" }), async (c) => {
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseBookingInput(body);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { staffId, venueId } = readAuth({ c, db });
    try {
      const booking = createBooking({ db, venueId, input: parsed.value, staffId });
      return c.json(booking, 201);
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/api/bookings/:id/start", staffOnly, venueOnly, requirePermission({ permission: "manage-sessions" }), async (c) => {
    const idResult = parseId({ raw: c.req.param("id") });
    if ("errors" in idResult) return c.json({ errors: idResult.errors }, 400);
    let body: unknown = null;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      body = null;
    }
    const minuteResult = parseOptionalMinute(body);
    if (!minuteResult.ok) return c.json({ errors: { nowMinute: "Minutes from midnight must be 0..1439." } }, 400);
    const { staffId, venueId } = readAuth({ c, db });
    const nowMinute = minuteResult.value ?? manilaNow({}).nowMinute;
    try {
      const session = startBooking({ db, venueId, bookingId: idResult.id, staffId, nowMinute });
      return c.json(session);
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/api/bookings/:id/end", staffOnly, venueOnly, requirePermission({ permission: "manage-sessions" }), async (c) => {
    const idResult = parseId({ raw: c.req.param("id") });
    if ("errors" in idResult) return c.json({ errors: idResult.errors }, 400);
    let body: unknown = null;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      body = null;
    }
    const minuteResult = parseOptionalMinute(body);
    if (!minuteResult.ok) return c.json({ errors: { nowMinute: "Minutes from midnight must be 0..1439." } }, 400);
    const { staffId, venueId } = readAuth({ c, db });
    const nowMinute = minuteResult.value ?? manilaNow({}).nowMinute;
    try {
      const result = endBooking({ db, venueId, bookingId: idResult.id, staffId, nowMinute });
      return c.json(result);
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.get("/api/today", staffOnly, venueOnly, (c) => {
    const { venueId } = readAuth({ c, db });
    const now = manilaNow({});
    try {
      return c.json(getToday({ db, venueId, date: now.date, nowMinute: now.nowMinute }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  return app;
}
