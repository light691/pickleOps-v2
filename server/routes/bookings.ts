import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import {
  BOOKING_SOURCES,
  canTransition,
  courtId,
  manilaDate,
  minuteOfDay,
  type Booking,
  type BookingId,
  type BookingSource,
  type BookingStatus,
  type ClashInfo,
  type Court,
  type CourtId,
  type ManilaDate,
  type MinutesFromMidnight,
  type VenueId,
} from "../../shared/types.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { parseBookingIdParam, parseBookingInput, unknownJson } from "../domain/validate.ts";
import { computeFee, createBooking, endBooking, formatClock, getToday, manilaNow, startBooking } from "../domain/venue.ts";
import { parseBookingRow, parseCourtRow, parseVenueSettingsRow } from "../db.ts";
import { readAuth, requirePermission, requireStaff, requireVenue, type AuthedContext } from "../middleware.ts";
import { emptyPatchFields, type PatchBookingFields } from "./calendarTypes.ts";

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

  app.patch("/api/bookings/:id", staffOnly, venueOnly, requirePermission({ permission: "book" }), async (c) => {
    const idResult = parseId({ raw: c.req.param("id") });
    if ("errors" in idResult) return c.json({ errors: idResult.errors }, 400);
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parsePatchBody(body);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { staffId, venueId } = readAuth({ c, db });
    void staffId;
    try {
      const booking = applyPatch({ db, venueId, bookingId: idResult.id, fields: parsed.value });
      return c.json(booking);
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  return app;
}

type PatchParseResult =
  | { readonly ok: true; readonly value: PatchBookingFields }
  | { readonly ok: false; readonly errors: Record<string, string> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBookingSource(value: unknown): value is BookingSource {
  return BOOKING_SOURCES.some((candidate) => candidate === value);
}

function isBookingStatus(value: unknown): value is BookingStatus {
  return (
    value === "Reserved" ||
    value === "Arrived" ||
    value === "In play" ||
    value === "Completed" ||
    value === "Cancelled" ||
    value === "No-show"
  );
}

function parsePatchBody(value: unknown): PatchParseResult {
  if (!isRecord(value)) return { ok: false, errors: { body: "Expected a JSON object." } };
  const errors: Record<string, string> = {};
  let fields = emptyPatchFields();
  let touched = 0;

  if ("courtId" in value) {
    touched += 1;
    const raw = value["courtId"];
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw <= 0) {
      errors["courtId"] = "Pick a court.";
    } else {
      fields = { ...fields, courtId: courtId(raw) };
    }
  }
  if ("customerName" in value) {
    touched += 1;
    const raw = value["customerName"];
    if (typeof raw !== "string" || raw.trim().length === 0 || raw.length > 120) {
      errors["customerName"] = "Enter the customer name.";
    } else {
      fields = { ...fields, customerName: raw.trim() };
    }
  }
  if ("mobile" in value) {
    touched += 1;
    const raw = value["mobile"];
    if (raw !== null && typeof raw !== "string") {
      errors["mobile"] = "Mobile number must be text.";
    } else {
      fields = { ...fields, mobile: typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null, mobileTouched: true };
    }
  }
  if ("source" in value) {
    touched += 1;
    const raw = value["source"];
    if (!isBookingSource(raw)) {
      errors["source"] = "Pick a booking source.";
    } else {
      fields = { ...fields, source: raw };
    }
  }
  if ("date" in value) {
    touched += 1;
    const raw = value["date"];
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      errors["date"] = "Enter the booking date.";
    } else {
      fields = { ...fields, date: manilaDate(raw) };
    }
  }
  if ("startMinute" in value) {
    touched += 1;
    const raw = value["startMinute"];
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw >= 1440) {
      errors["startMinute"] = "Enter a start time between 00:00 and 23:59.";
    } else {
      fields = { ...fields, startMinute: minuteOfDay(raw) };
    }
  }
  if ("durationMinutes" in value) {
    touched += 1;
    const raw = value["durationMinutes"];
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 30 || raw > 480 || raw % 30 !== 0) {
      errors["durationMinutes"] = "Duration must be a multiple of 30 minutes between 30 and 480.";
    } else {
      fields = { ...fields, durationMinutes: raw };
    }
  }
  if ("players" in value) {
    touched += 1;
    const raw = value["players"];
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 1 || raw > 24) {
      errors["players"] = "Players must be between 1 and 24.";
    } else {
      fields = { ...fields, players: raw };
    }
  }
  if ("notes" in value) {
    touched += 1;
    const raw = value["notes"];
    if (raw !== null && typeof raw !== "string") {
      errors["notes"] = "Notes must be text.";
    } else {
      fields = { ...fields, notes: typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null, notesTouched: true };
    }
  }
  if ("status" in value) {
    touched += 1;
    const raw = value["status"];
    if (!isBookingStatus(raw)) {
      errors["status"] = "Unknown booking status.";
    } else {
      fields = { ...fields, status: raw };
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (touched === 0) return { ok: false, errors: { body: "Nothing to update." } };
  if (fields.status !== null && (fields.courtId !== null || fields.date !== null || fields.startMinute !== null || fields.durationMinutes !== null || fields.customerName !== null || fields.mobileTouched || fields.source !== null || fields.players !== null || fields.notesTouched)) {
    return { ok: false, errors: { status: "Send either a status change or booking edits, not both." } };
  }
  return { ok: true, value: fields };
}

function loadScopedBooking({
  db,
  venueId,
  bookingId: id,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  bookingId: BookingId;
}): Booking {
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
  if (row === undefined) throw new NotFoundError({ message: `Booking ${id as string} was not found.` });
  const booking = parseBookingRow(row);
  if (booking.venueId !== venueId) {
    throw new ForbiddenError({ message: `Booking ${id as string} does not belong to this venue.` });
  }
  return booking;
}

function loadScopedCourt({
  db,
  venueId,
  courtId: id,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  courtId: CourtId;
}): Court {
  const row = db.prepare("SELECT * FROM courts WHERE id = ?").get(id);
  if (row === undefined) throw new NotFoundError({ message: `Court ${id as number} was not found.` });
  const court = parseCourtRow(row);
  if (court.venueId !== venueId) {
    throw new ForbiddenError({ message: `Court ${court.name} does not belong to this venue.` });
  }
  return court;
}

function findClashExcluding({
  db,
  venueId,
  courtId: court,
  date,
  startMinute,
  durationMinutes,
  excludeId,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  courtId: CourtId;
  date: ManilaDate;
  startMinute: MinutesFromMidnight;
  durationMinutes: number;
  excludeId: BookingId;
}): ClashInfo | null {
  const end = (startMinute as number) + durationMinutes;
  const rows = db
    .prepare(
      `SELECT c.name AS court_name, b.customer_name, b.start_minute, b.duration_minutes
       FROM bookings b JOIN courts c ON c.id = b.court_id
       WHERE b.venue_id = ? AND b.court_id = ? AND b.date = ? AND b.id != ?
         AND b.status IN ('Reserved', 'Arrived', 'In play')
         AND b.start_minute < ? AND (b.start_minute + b.duration_minutes) > ?`,
    )
    .all(venueId, court, date, excludeId, end, startMinute) as readonly unknown[];
  const first = rows[0];
  if (first === undefined) return null;
  if (!isRecord(first)) throw new TypeError("Expected overlap row object");
  const startValue = first["start_minute"];
  const durationValue = first["duration_minutes"];
  const courtValue = first["court_name"];
  const customerValue = first["customer_name"];
  if (
    typeof startValue !== "number" ||
    typeof durationValue !== "number" ||
    typeof courtValue !== "string" ||
    typeof customerValue !== "string"
  ) {
    throw new TypeError("Expected overlap row columns");
  }
  const start = minuteOfDay(startValue);
  const finish = minuteOfDay(startValue + durationValue);
  return {
    court: courtValue,
    customer: customerValue,
    startMinute: start,
    endMinute: finish,
    summary: `${courtValue} is already booked by ${customerValue} from ${formatClock({ minute: start })} to ${formatClock({ minute: finish })}.`,
  };
}

function hasOpenSession({ db, bookingId: id }: { db: DatabaseSync; bookingId: BookingId }): boolean {
  const row = db.prepare("SELECT id FROM court_sessions WHERE booking_id = ? AND ended_minute IS NULL").get(id);
  return row !== undefined;
}

function applyPatch({
  db,
  venueId,
  bookingId: id,
  fields,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  bookingId: BookingId;
  fields: PatchBookingFields;
}): Booking {
  const booking = loadScopedBooking({ db, venueId, bookingId: id });

  if (fields.status !== null) {
    const target = fields.status;
    if (!canTransition({ flow: "booking", from: booking.status, to: target })) {
      throw new ConflictError({ message: `Booking ${id as string} is ${booking.status} and cannot move to ${target}.` });
    }
    db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(target, id);
    return loadScopedBooking({ db, venueId, bookingId: id });
  }

  if (booking.status !== "Reserved" && booking.status !== "Arrived" && booking.status !== "In play") {
    throw new ConflictError({ message: `Booking ${id as string} is ${booking.status} and cannot be edited.` });
  }

  const courtId = fields.courtId ?? booking.courtId;
  const date = fields.date ?? booking.date;
  const startMinute = fields.startMinute ?? booking.startMinute;
  const durationMinutes = fields.durationMinutes ?? booking.durationMinutes;
  const scheduleChanged =
    fields.courtId !== null || fields.date !== null || fields.startMinute !== null || fields.durationMinutes !== null;
  if (scheduleChanged && hasOpenSession({ db, bookingId: id })) {
    throw new ConflictError({ message: `Booking ${id as string} has a live session and cannot be moved.` });
  }

  const court = loadScopedCourt({ db, venueId, courtId });
  if (!court.bookable) {
    throw new ConflictError({ message: `${court.name} is not bookable right now.` });
  }
  const settings = parseVenueSettingsRow(db.prepare("SELECT * FROM venue_settings WHERE venue_id = ?").get(venueId));
  const end = (startMinute as number) + durationMinutes;
  if ((startMinute as number) < (settings.openMinute as number) || end > (settings.closeMinute as number)) {
    throw new ValidationError({
      message: `Bookings must stay inside ${formatClock({ minute: settings.openMinute })} and ${formatClock({ minute: settings.closeMinute })}.`,
    });
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const clash = findClashExcluding({ db, venueId, courtId, date, startMinute, durationMinutes, excludeId: id });
    if (clash !== null) {
      throw new ConflictError({ message: clash.summary, clash });
    }
    const total = computeFee({ hourlyRate: court.hourlyRate, durationMinutes, overtimeMinutes: 0 });
    db.prepare(
      `UPDATE bookings SET court_id = ?, customer_name = ?, mobile = ?, source = ?, date = ?,
       start_minute = ?, duration_minutes = ?, players = ?, notes = ?, total_centavos = ? WHERE id = ?`,
    ).run(
      courtId,
      fields.customerName ?? booking.customerName,
      fields.mobileTouched ? fields.mobile : booking.mobile,
      fields.source ?? booking.source,
      date,
      startMinute,
      durationMinutes,
      fields.players ?? booking.players,
      fields.notesTouched ? fields.notes : booking.notes,
      total,
      id,
    );
    db.exec("COMMIT");
    return loadScopedBooking({ db, venueId, bookingId: id });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
