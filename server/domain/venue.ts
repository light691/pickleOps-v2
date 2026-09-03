import type { DatabaseSync } from "node:sqlite";
import {
  assertNever,
  bookingId,
  canTransition,
  centavos,
  manilaDate,
  minuteOfDay,
  statusPresentation,
  type Booking,
  type BookingId,
  type Centavos,
  type ClashInfo,
  type Court,
  type CourtId,
  type CourtSession,
  type CourtStatus,
  type ManilaDate,
  type MinutesFromMidnight,
  type NewBookingInput,
  type PaymentStatus,
  type StaffId,
  type TodayCourtCard,
  type TodayResponse,
  type VenueId,
} from "../../shared/types.ts";
import { parseBookingRow, parseCourtRow, parseSessionRow, parseVenueSettingsRow } from "../db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors.ts";

export function manilaNow({ at }: { at?: Date }): { date: ManilaDate; nowMinute: MinutesFromMidnight } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at ?? new Date());
  const get = (type: string): string => {
    for (const part of parts) {
      if (part.type === type) return part.value;
    }
    throw new TypeError(`Missing ${type} in Manila date parts`);
  };
  const date = manilaDate(`${get("year")}-${get("month")}-${get("day")}`);
  const nowMinute = minuteOfDay(Number(get("hour")) * 60 + Number(get("minute")));
  return { date, nowMinute };
}

export function formatClock({ minute }: { minute: MinutesFromMidnight }): string {
  const raw = minute as number;
  const hour24 = Math.floor(raw / 60);
  const rest = raw % 60;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(rest).padStart(2, "0")} ${suffix}`;
}

export function formatRange({ start, end }: { start: MinutesFromMidnight; end: MinutesFromMidnight }): string {
  return `${formatClock({ minute: start })}–${formatClock({ minute: end })}`;
}

export function formatPeso({ value }: { value: Centavos }): string {
  const raw = value as number;
  return `₱${(raw / 100).toFixed(2)}`;
}

export function formatRate({ value }: { value: Centavos }): string {
  return `₱${(value as number) / 100}`;
}

export function paymentShortLabel({ status }: { status: PaymentStatus }): string {
  switch (status) {
    case "Awaiting payment":
      return "Unpaid";
    case "In review":
      return "In review";
    case "Verified":
      return "Paid";
    case "Rejected":
      return "Rejected";
    default:
      return assertNever({ value: status });
  }
}

export function computeFee({
  hourlyRate,
  durationMinutes,
  overtimeMinutes,
}: {
  hourlyRate: Centavos;
  durationMinutes: number;
  overtimeMinutes: number;
}): Centavos {
  const rate = hourlyRate as number;
  return centavos(Math.ceil((rate * durationMinutes) / 60) + Math.ceil((rate * Math.max(0, overtimeMinutes)) / 60));
}

function bookingEndMinute({ start, durationMinutes }: { start: MinutesFromMidnight; durationMinutes: number }): number {
  return (start as number) + durationMinutes;
}

function nextBookingId({ db, date }: { db: DatabaseSync; date: ManilaDate }): BookingId {
  const prefix = `RP-${date.slice(2).replaceAll("-", "")}-`;
  const rows = db
    .prepare("SELECT id FROM bookings WHERE id LIKE ? ORDER BY id DESC LIMIT 1")
    .all(`${prefix}%`) as readonly unknown[];
  let sequence = 1;
  const first = rows[0];
  if (typeof first === "object" && first !== null && "id" in first && typeof first.id === "string") {
    const tail = Number(first.id.slice(prefix.length));
    if (Number.isSafeInteger(tail)) sequence = tail + 1;
  }
  return bookingId(`${prefix}${String(sequence).padStart(3, "0")}`);
}

interface OverlapRow {
  readonly courtName: string;
  readonly customerName: string;
  readonly startMinute: MinutesFromMidnight;
  readonly endMinute: MinutesFromMidnight;
}

function findOverlap({
  db,
  venueId,
  input,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  input: NewBookingInput;
}): OverlapRow | null {
  const end = bookingEndMinute({ start: input.startMinute, durationMinutes: input.durationMinutes });
  const rows = db
    .prepare(
      `SELECT c.name AS court_name, b.customer_name, b.start_minute, b.duration_minutes
       FROM bookings b JOIN courts c ON c.id = b.court_id
       WHERE b.venue_id = ? AND b.court_id = ? AND b.date = ?
         AND b.status IN ('Reserved', 'Arrived', 'In play')
         AND b.start_minute < ? AND (b.start_minute + b.duration_minutes) > ?`,
    )
    .all(venueId, input.courtId, input.date, end, input.startMinute) as readonly unknown[];
  const first = rows[0];
  if (first === undefined) return null;
  if (typeof first !== "object" || first === null) throw new TypeError("Expected overlap row object");
  const record = first as Record<string, unknown>;
  const startValue = record["start_minute"];
  const durationValue = record["duration_minutes"];
  const courtValue = record["court_name"];
  const customerValue = record["customer_name"];
  if (
    typeof startValue !== "number" ||
    typeof durationValue !== "number" ||
    typeof courtValue !== "string" ||
    typeof customerValue !== "string"
  ) {
    throw new TypeError("Expected overlap row columns");
  }
  const start = minuteOfDay(startValue);
  return {
    courtName: courtValue,
    customerName: customerValue,
    startMinute: start,
    endMinute: minuteOfDay((start as number) + durationValue),
  };
}

function toClash({ overlap }: { overlap: OverlapRow }): ClashInfo {
  return {
    court: overlap.courtName,
    customer: overlap.customerName,
    startMinute: overlap.startMinute,
    endMinute: overlap.endMinute,
    summary: `${overlap.courtName} is already booked by ${overlap.customerName} from ${formatClock({ minute: overlap.startMinute })} to ${formatClock({ minute: overlap.endMinute })}.`,
  };
}

function loadCourt({ db, venueId, courtId: id }: { db: DatabaseSync; venueId: VenueId; courtId: CourtId }): Court {
  const row = db.prepare("SELECT * FROM courts WHERE id = ?").get(id);
  if (row === undefined) throw new NotFoundError({ message: `Court ${id} was not found.` });
  const court = parseCourtRow(row);
  if (court.venueId !== venueId) {
    throw new ForbiddenError({ message: `Court ${court.name} does not belong to this venue.` });
  }
  return court;
}

function loadBooking({
  db,
  venueId,
  bookingId: id,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  bookingId: BookingId;
}): Booking {
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
  if (row === undefined) throw new NotFoundError({ message: `Booking ${id} was not found.` });
  const booking = parseBookingRow(row);
  if (booking.venueId !== venueId) {
    throw new ForbiddenError({ message: `Booking ${id} does not belong to this venue.` });
  }
  return booking;
}

export function createBooking({
  db,
  venueId,
  input,
  staffId,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  input: NewBookingInput;
  staffId: StaffId;
}): Booking {
  const court = loadCourt({ db, venueId, courtId: input.courtId });
  if (!court.bookable) {
    throw new ConflictError({ message: `${court.name} is not bookable right now.` });
  }
  const settings = parseVenueSettingsRow(db.prepare("SELECT * FROM venue_settings WHERE venue_id = ?").get(venueId));
  const end = bookingEndMinute({ start: input.startMinute, durationMinutes: input.durationMinutes });
  if ((input.startMinute as number) < (settings.openMinute as number) || end > (settings.closeMinute as number)) {
    throw new ValidationError({
      message: `Bookings must stay inside ${formatClock({ minute: settings.openMinute })} and ${formatClock({ minute: settings.closeMinute })}.`,
    });
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const overlap = findOverlap({ db, venueId, input });
    if (overlap !== null) {
      throw new ConflictError({ message: toClash({ overlap }).summary, clash: toClash({ overlap }) });
    }
    const id = nextBookingId({ db, date: input.date });
    const total = computeFee({ hourlyRate: court.hourlyRate, durationMinutes: input.durationMinutes, overtimeMinutes: 0 });
    db.prepare(
      `INSERT INTO bookings (id, venue_id, court_id, customer_name, mobile, source, date, start_minute, duration_minutes, players, notes, status, payment_status, total_centavos, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Reserved', ?, ?, ?, ?)`,
    ).run(
      id,
      venueId,
      input.courtId,
      input.customerName,
      input.mobile,
      input.source,
      input.date,
      input.startMinute,
      input.durationMinutes,
      input.players,
      input.notes,
      settings.defaultPaymentStatus,
      total,
      staffId,
      new Date().toISOString(),
    );
    db.exec("COMMIT");
    return loadBooking({ db, venueId, bookingId: id });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function startBooking({
  db,
  venueId,
  bookingId: id,
  staffId,
  nowMinute,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  bookingId: BookingId;
  staffId: StaffId;
  nowMinute: MinutesFromMidnight;
}): CourtSession {
  const booking = loadBooking({ db, venueId, bookingId: id });
  if (!canTransition({ flow: "booking", from: booking.status, to: "In play" })) {
    throw new ConflictError({ message: `Booking ${id} is ${booking.status} and cannot start.` });
  }
  const existing = db.prepare("SELECT * FROM court_sessions WHERE booking_id = ?").get(id);
  if (existing !== undefined) {
    throw new ConflictError({ message: `Booking ${id} already has a session.` });
  }
  void staffId;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "INSERT INTO court_sessions (venue_id, booking_id, court_id, scheduled_end_minute, started_minute, ended_minute) VALUES (?, ?, ?, ?, ?, NULL)",
    ).run(
      venueId,
      id,
      booking.courtId,
      bookingEndMinute({ start: booking.startMinute, durationMinutes: booking.durationMinutes }),
      nowMinute,
    );
    db.prepare("UPDATE bookings SET status = 'In play' WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const row = db.prepare("SELECT * FROM court_sessions WHERE booking_id = ?").get(id);
  if (row === undefined) throw new NotFoundError({ message: `Session for booking ${id} was not found.` });
  return parseSessionRow(row);
}

export function endBooking({
  db,
  venueId,
  bookingId: id,
  staffId,
  nowMinute,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  bookingId: BookingId;
  staffId: StaffId;
  nowMinute: MinutesFromMidnight;
}): { booking: Booking; session: CourtSession; totalCentavos: Centavos } {
  const booking = loadBooking({ db, venueId, bookingId: id });
  const sessionRow = db
    .prepare("SELECT * FROM court_sessions WHERE booking_id = ? AND ended_minute IS NULL")
    .get(id);
  if (sessionRow === undefined) {
    throw new ConflictError({ message: `Booking ${id} has no running session to end.` });
  }
  const session = parseSessionRow(sessionRow);
  if (!canTransition({ flow: "booking", from: booking.status, to: "Completed" })) {
    throw new ConflictError({ message: `Booking ${id} is ${booking.status} and cannot end.` });
  }
  const court = loadCourt({ db, venueId, courtId: booking.courtId });
  const overtime = Math.max(0, (nowMinute as number) - (session.scheduledEndMinute as number));
  const total = computeFee({
    hourlyRate: court.hourlyRate,
    durationMinutes: booking.durationMinutes,
    overtimeMinutes: overtime,
  });
  void staffId;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE court_sessions SET ended_minute = ? WHERE booking_id = ?").run(nowMinute, id);
    db.prepare("UPDATE bookings SET status = 'Completed', total_centavos = ? WHERE id = ?").run(total, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const updatedSession = parseSessionRow(db.prepare("SELECT * FROM court_sessions WHERE booking_id = ?").get(id));
  return { booking: loadBooking({ db, venueId, bookingId: id }), session: updatedSession, totalCentavos: total };
}

export function deriveCourtStatus({
  openSession,
  nextBooking,
  nowMinute,
  openPlaySoon,
}: {
  openSession: { scheduledEndMinute: MinutesFromMidnight } | null;
  nextBooking: { startMinute: MinutesFromMidnight } | null;
  nowMinute: MinutesFromMidnight;
  openPlaySoon: boolean;
}): CourtStatus {
  if (openSession !== null) {
    if ((nowMinute as number) > (openSession.scheduledEndMinute as number)) return "Overtime";
    return "In play";
  }
  if (openPlaySoon) return "Open play soon";
  if (nextBooking !== null && (nextBooking.startMinute as number) - (nowMinute as number) <= 30) return "Arriving soon";
  return "Available";
}

interface TodayCourtInput {
  readonly court: Court;
  readonly openSession: { booking: Booking; session: CourtSession } | null;
  readonly upcoming: readonly Booking[];
  readonly nowMinute: MinutesFromMidnight;
  readonly closeMinute: MinutesFromMidnight;
  readonly openPlaySoon: boolean;
}

function buildCourtCard(input: TodayCourtInput): TodayCourtCard {
  const status = deriveCourtStatus({
    openSession: input.openSession?.session ?? null,
    nextBooking: input.upcoming[0] ?? null,
    nowMinute: input.nowMinute,
    openPlaySoon: input.openPlaySoon && input.openSession === null,
  });
  const presentation = statusPresentation({ status });
  const base = {
    courtId: input.court.id,
    court: input.court.name,
    status,
    kind: presentation.kind,
    accent: presentation.accent,
    action: presentation.action,
    urgent: false,
  };

  switch (status) {
    case "Overtime": {
      const session = input.openSession;
      if (session === null) throw new ConflictError({ message: `${input.court.name} has no running session.` });
      const overtime = (input.nowMinute as number) - (session.session.scheduledEndMinute as number);
      const due = computeFee({ hourlyRate: input.court.hourlyRate, durationMinutes: 0, overtimeMinutes: overtime });
      return {
        ...base,
        headline: null,
        customer: session.booking.customerName,
        meta: `${formatRange({ start: session.booking.startMinute, end: minuteOfDay(bookingEndMinute({ start: session.booking.startMinute, durationMinutes: session.booking.durationMinutes })) })} · ${session.booking.players} players`,
        next: `+${overtime} min · ${formatPeso({ value: due })} due`,
        urgent: true,
      };
    }
    case "In play": {
      const session = input.openSession;
      if (session === null) throw new ConflictError({ message: `${input.court.name} has no running session.` });
      const remaining = (session.session.scheduledEndMinute as number) - (input.nowMinute as number);
      const nextBooking = input.upcoming[0];
      return {
        ...base,
        headline: null,
        customer: session.booking.customerName,
        meta: `${formatRange({ start: session.booking.startMinute, end: minuteOfDay(bookingEndMinute({ start: session.booking.startMinute, durationMinutes: session.booking.durationMinutes })) })} · ${session.booking.players} players`,
        next:
          nextBooking === undefined
            ? `${remaining} min left`
            : `${remaining} min left · Next booking ${formatClock({ minute: nextBooking.startMinute })}`,
      };
    }
    case "Arriving soon": {
      const nextBooking = input.upcoming[0];
      if (nextBooking === undefined) throw new ConflictError({ message: `${input.court.name} has no upcoming booking.` });
      return {
        ...base,
        headline: null,
        customer: nextBooking.customerName,
        meta: `${formatRange({ start: nextBooking.startMinute, end: minuteOfDay(bookingEndMinute({ start: nextBooking.startMinute, durationMinutes: nextBooking.durationMinutes })) })} · ${nextBooking.players} players`,
        next: `${paymentShortLabel({ status: nextBooking.paymentStatus })} · ${nextBooking.source}`,
      };
    }
    case "Open play soon": {
      const nextBooking = input.upcoming[0];
      return {
        ...base,
        headline: null,
        customer: nextBooking?.customerName ?? "Open Play",
        meta: nextBooking
          ? `${formatRange({ start: nextBooking.startMinute, end: minuteOfDay(bookingEndMinute({ start: nextBooking.startMinute, durationMinutes: nextBooking.durationMinutes })) })} · Shared session`
          : "Shared session today",
        next: "Check the Open Play section",
      };
    }
    case "Available": {
      const nextBooking = input.upcoming[0];
      return {
        ...base,
        headline: `Open until ${formatClock({ minute: nextBooking?.startMinute ?? input.closeMinute })}`,
        customer: null,
        meta: `${formatRate({ value: input.court.hourlyRate })} / hour`,
        next:
          nextBooking === undefined
            ? "No upcoming booking"
            : `Next: ${nextBooking.customerName} · ${formatClock({ minute: nextBooking.startMinute })}`,
      };
    }
    default:
      return assertNever({ value: status });
  }
}

export function getToday({
  db,
  venueId,
  date,
  nowMinute,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  date: ManilaDate;
  nowMinute: MinutesFromMidnight;
}): TodayResponse {
  const settings = parseVenueSettingsRow(db.prepare("SELECT * FROM venue_settings WHERE venue_id = ?").get(venueId));
  const courtRows = db
    .prepare("SELECT * FROM courts WHERE venue_id = ? ORDER BY sort_order ASC")
    .all(venueId) as readonly unknown[];
  const bookingRows = db
    .prepare("SELECT * FROM bookings WHERE venue_id = ? AND date = ? AND status IN ('Reserved', 'Arrived', 'In play')")
    .all(venueId, date) as readonly unknown[];
  const sessionRows = db
    .prepare("SELECT * FROM court_sessions WHERE venue_id = ? AND ended_minute IS NULL")
    .all(venueId) as readonly unknown[];

  const bookings = bookingRows.map((row) => parseBookingRow(row));
  const sessions = sessionRows.map((row) => parseSessionRow(row));
  const sessionByCourt = new Map<number, { booking: Booking; session: CourtSession }>();
  for (const session of sessions) {
    const booking = bookings.find((candidate) => candidate.id === session.bookingId);
    if (booking !== undefined) sessionByCourt.set(session.courtId as number, { booking, session });
  }

  const courts = courtRows.map((row) => parseCourtRow(row));
  const cards: TodayCourtCard[] = courts.map((court) => {
    const upcoming = bookings
      .filter((booking) => booking.courtId === court.id && bookingEndMinute({ start: booking.startMinute, durationMinutes: booking.durationMinutes }) > (nowMinute as number))
      .sort((a, b) => (a.startMinute as number) - (b.startMinute as number));
    return buildCourtCard({
      court,
      openSession: sessionByCourt.get(court.id as number) ?? null,
      upcoming,
      nowMinute,
      closeMinute: settings.closeMinute,
      openPlaySoon: false,
    });
  });
  return { date, courts: cards };
}
