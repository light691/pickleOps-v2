import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import {
  assertNever,
  manilaDate,
  minuteOfDay,
  type Booking,
  type BookingStatus,
  type Court,
  type VenueId,
} from "../../shared/types.ts";
import { parseBookingRow, parseCourtRow } from "../db.ts";
import { listOpenPlayBlocks } from "./openplay.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { paymentShortLabel } from "../domain/venue.ts";
import { readAuth, requireStaff, requireVenue, type AuthedContext } from "../middleware.ts";
import type { CalendarBlock, CalendarBlockState, CalendarResponse } from "./calendarTypes.ts";

function errorStatus({ error }: { error: unknown }): { status: 400 | 403 | 404 | 409; body: Record<string, unknown> } {
  if (error instanceof ConflictError) return { status: 409, body: { error: error.message, clash: error.clash ?? null } };
  if (error instanceof ForbiddenError) return { status: 403, body: { error: error.message } };
  if (error instanceof NotFoundError) return { status: 404, body: { error: error.message } };
  if (error instanceof ValidationError) return { status: 400, body: { error: error.message } };
  throw error;
}

function blockState({ status }: { status: BookingStatus }): CalendarBlockState {
  switch (status) {
    case "Reserved":
      return "confirmed";
    case "Arrived":
      return "held";
    case "In play":
      return "playing";
    case "Completed":
      return "confirmed";
    case "Cancelled":
      return "confirmed";
    case "No-show":
      return "confirmed";
    default:
      return assertNever({ value: status });
  }
}

function toBlock({ booking, courts }: { booking: Booking; courts: ReadonlyMap<number, Court> }): CalendarBlock {
  const court = courts.get(booking.courtId as number);
  if (court === undefined) throw new NotFoundError({ message: `Court ${booking.courtId as number} was not found.` });
  return {
    kind: "booking",
    courtId: booking.courtId,
    court: court.name,
    bookingId: booking.id,
    sessionId: null,
    customer: booking.customerName,
    date: booking.date,
    startMinute: booking.startMinute,
    durationMinutes: booking.durationMinutes,
    endMinute: minuteOfDay((booking.startMinute as number) + booking.durationMinutes),
    state: blockState({ status: booking.status }),
    paymentHint: paymentShortLabel({ status: booking.paymentStatus }),
  };
}

export function getCalendarBlocks({
  db,
  venueId,
  date,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  date: string;
}): CalendarResponse {
  const day = manilaDate(date);
  const courtRows = db
    .prepare("SELECT * FROM courts WHERE venue_id = ? ORDER BY sort_order ASC")
    .all(venueId) as readonly unknown[];
  const courts = new Map<number, Court>();
  for (const row of courtRows) {
    const court = parseCourtRow(row);
    courts.set(court.id as number, court);
  }
  const bookingRows = db
    .prepare(
      `SELECT * FROM bookings WHERE venue_id = ? AND date = ?
       AND status IN ('Reserved', 'Arrived', 'In play', 'Completed')
       ORDER BY start_minute ASC`,
    )
    .all(venueId, day) as readonly unknown[];
  const blocks = bookingRows
    .map((row) => parseBookingRow(row))
    .map((booking) => toBlock({ booking, courts }));
  for (const session of listOpenPlayBlocks({ db, venueId, date: day })) {
    const court = courts.get(session.courtId as number);
    if (court === undefined) continue;
    blocks.push({
      kind: "openplay",
      courtId: session.courtId,
      court: court.name,
      bookingId: null,
      sessionId: session.sessionId as number,
      customer: session.name,
      date: session.date,
      startMinute: session.startMinute,
      durationMinutes: (session.endMinute as number) - (session.startMinute as number),
      endMinute: session.endMinute,
      state: "openplay",
      paymentHint: "",
    });
  }
  blocks.sort((left, right) => (left.startMinute as number) - (right.startMinute as number));
  return { date: day, blocks };
}

export function createCalendarRoutes({ db }: { db: DatabaseSync }): Hono<AuthedContext> {
  const app = new Hono<AuthedContext>();
  const staffOnly = requireStaff({ db });
  const venueOnly = requireVenue({ db });

  app.get("/api/calendar", staffOnly, venueOnly, (c) => {
    const raw = c.req.query("date");
    if (raw === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return c.json({ errors: { date: "Send the day as ?date=YYYY-MM-DD." } }, 400);
    }
    const { venueId } = readAuth({ c, db });
    try {
      return c.json(getCalendarBlocks({ db, venueId, date: raw }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  return app;
}
