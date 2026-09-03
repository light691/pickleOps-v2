import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import {
  assertNever,
  manilaDate,
  minuteOfDay,
  type Booking,
  type Court,
  type CourtSession,
  type ManilaDate,
  type MinutesFromMidnight,
  type VenueId,
} from "../../shared/types.ts";
import { parseBookingRow, parseCourtRow, parseSessionRow, parseVenueSettingsRow } from "../db.ts";
import { formatClock, manilaNow } from "../domain/venue.ts";
import { readAuth, requireStaff, requireVenue, type AuthedContext } from "../middleware.ts";
import {
  REPORT_PAYMENT_METHODS,
  parseReportRange,
  reportRangeDays,
  type ReportBusyBucket,
  type ReportBusyRow,
  type ReportCourtUtilization,
  type ReportOpenPlay,
  type ReportOutcomes,
  type ReportPaymentMixEntry,
  type ReportRange,
  type ReportsResponse,
} from "./reportTypes.ts";

const BUCKET_MINUTES = 120;

function round1({ value }: { value: number }): number {
  return Math.round(value * 10) / 10;
}

function shiftDate({ date, days }: { date: ManilaDate; days: number }): ManilaDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86400000);
  const text = `${String(shifted.getUTCFullYear()).padStart(4, "0")}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  return manilaDate(text);
}

function percent({ part, whole }: { part: number; whole: number }): number {
  if (whole <= 0) return 0;
  return round1({ value: (part / whole) * 100 });
}

function levelFor({ minutes, max }: { minutes: number; max: number }): number {
  if (minutes <= 0 || max <= 0) return 0;
  const ratio = minutes / max;
  if (ratio <= 1 / 3) return 1;
  if (ratio <= 2 / 3) return 2;
  return 3;
}

interface WindowPayment {
  readonly method: string | null;
  readonly centavos: number;
  readonly day: string;
  readonly status: string;
  readonly kind: string;
}

interface WindowOpenPlay {
  readonly minutes: number;
  readonly participants: number;
}

interface WindowInput {
  readonly bookings: readonly Booking[];
  readonly sessionsByBooking: ReadonlyMap<string, CourtSession>;
  readonly courts: readonly Court[];
  readonly openMinute: MinutesFromMidnight;
  readonly closeMinute: MinutesFromMidnight;
  readonly days: number;
  readonly payments: readonly WindowPayment[];
  readonly openPlay: WindowOpenPlay;
}

interface WindowResult {
  readonly utilization: number;
  readonly bookedMinutes: number;
  readonly playedMinutes: number;
  readonly revenueCentavos: number;
  readonly outstandingCentavos: number;
  readonly openPlay: ReportOpenPlay;
  readonly perCourt: readonly ReportCourtUtilization[];
  readonly outcomes: ReportOutcomes;
  readonly completionRate: number;
  readonly busyBuckets: readonly ReportBusyBucket[];
  readonly busyRows: readonly ReportBusyRow[];
  readonly paymentMix: readonly ReportPaymentMixEntry[];
}

function playedFor({ booking, sessionsByBooking }: { booking: Booking; sessionsByBooking: ReadonlyMap<string, CourtSession> }): number {
  if (booking.status !== "Completed") return 0;
  const session = sessionsByBooking.get(booking.id as string);
  if (session?.endedMinute !== null && session?.endedMinute !== undefined) {
    return (session.endedMinute as number) - (session.startedMinute as number);
  }
  return booking.durationMinutes;
}

function buildBuckets({
  openMinute,
  closeMinute,
}: {
  openMinute: MinutesFromMidnight;
  closeMinute: MinutesFromMidnight;
}): ReportBusyBucket[] {
  const buckets: ReportBusyBucket[] = [];
  for (let start = openMinute as number; start < (closeMinute as number); start += BUCKET_MINUTES) {
    const minute = minuteOfDay(start);
    buckets.push({ label: formatClock({ minute }), startMinute: start });
  }
  return buckets;
}

function aggregateWindow(input: WindowInput): WindowResult {
  const open = input.openMinute as number;
  const close = input.closeMinute as number;
  const buckets = buildBuckets({ openMinute: input.openMinute, closeMinute: input.closeMinute });
  const booked = input.bookings.filter((booking) => booking.status !== "Cancelled");
  const bookedMinutes = booked.reduce((total, booking) => total + booking.durationMinutes, 0);
  const playedMinutes = input.bookings.reduce(
    (total, booking) => total + playedFor({ booking, sessionsByBooking: input.sessionsByBooking }),
    0,
  );
  const revenueCentavos = input.bookings.reduce((total, booking) => {
    if (booking.paymentStatus === "Verified" && booking.totalCentavos !== null) return total + (booking.totalCentavos as number);
    return total;
  }, 0);
  const outstandingCentavos = input.bookings.reduce((total, booking) => {
    if (booking.paymentStatus !== "Verified" && booking.status !== "Cancelled" && booking.totalCentavos !== null) {
      return total + (booking.totalCentavos as number);
    }
    return total;
  }, 0);

  const availablePerCourt = Math.max(0, close - open) * input.days;
  const perCourt: ReportCourtUtilization[] = input.courts.map((court) => {
    const courtBooked = booked
      .filter((booking) => booking.courtId === court.id)
      .reduce((total, booking) => total + booking.durationMinutes, 0);
    const courtPlayed = input.bookings
      .filter((booking) => booking.courtId === court.id)
      .reduce((total, booking) => total + playedFor({ booking, sessionsByBooking: input.sessionsByBooking }), 0);
    return {
      courtId: court.id as number,
      court: court.name,
      bookedMinutes: courtBooked,
      playedMinutes: courtPlayed,
      availableMinutes: availablePerCourt,
      utilization: percent({ part: courtPlayed, whole: availablePerCourt }),
    };
  });

  const outcomes: ReportOutcomes = {
    played: input.bookings.filter((booking) => booking.status === "Completed").length,
    rescheduled: 0,
    cancelled: input.bookings.filter((booking) => booking.status === "Cancelled").length,
    noShow: input.bookings.filter((booking) => booking.status === "No-show").length,
  };
  const terminal = outcomes.played + outcomes.rescheduled + outcomes.cancelled + outcomes.noShow;
  const completionRate = percent({ part: outcomes.played, whole: terminal });

  const cells = new Map<number, number[]>();
  for (const court of input.courts) {
    cells.set(court.id as number, buckets.map(() => 0));
  }
  for (const booking of booked) {
    const row = cells.get(booking.courtId as number);
    if (row === undefined) continue;
    const raw = Math.floor(((booking.startMinute as number) - open) / BUCKET_MINUTES);
    const index = Math.max(0, Math.min(raw, buckets.length - 1));
    const current = row[index] ?? 0;
    row[index] = current + booking.durationMinutes;
  }
  let maxCell = 0;
  for (const row of cells.values()) {
    for (const minutes of row) {
      if (minutes > maxCell) maxCell = minutes;
    }
  }
  const busyRows: ReportBusyRow[] = input.courts.map((court) => {
    const minutes = cells.get(court.id as number) ?? buckets.map(() => 0);
    return {
      courtId: court.id as number,
      court: court.name,
      minutes,
      levels: minutes.map((entry) => levelFor({ minutes: entry, max: maxCell })),
    };
  });

  const mixTotals = REPORT_PAYMENT_METHODS.map((method) => ({
    method,
    centavos: input.payments
      .filter((payment) => payment.status === "Verified" && payment.method === method)
      .reduce((total, payment) => total + payment.centavos, 0),
  }));
  const mixTotal = mixTotals.reduce((total, entry) => total + entry.centavos, 0);
  const paymentMix: ReportPaymentMixEntry[] = mixTotals.map((entry) => ({
    method: entry.method,
    centavos: entry.centavos,
    share: mixTotal > 0 ? round1({ value: (entry.centavos / mixTotal) * 100 }) : 0,
  }));

  return {
    utilization: percent({ part: playedMinutes, whole: availablePerCourt * input.courts.length }),
    bookedMinutes,
    playedMinutes,
    revenueCentavos,
    outstandingCentavos,
    openPlay: {
      participants: input.openPlay.participants,
      revenueCentavos: input.payments
        .filter((payment) => payment.status === "Verified" && payment.kind === "openplay")
        .reduce((total, payment) => total + payment.centavos, 0),
      bookedMinutes: input.openPlay.minutes,
    },
    perCourt,
    outcomes,
    completionRate,
    busyBuckets: buckets,
    busyRows,
    paymentMix,
  };
}

function tableExists({ db, table }: { db: DatabaseSync; table: string }): boolean {
  const row = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return typeof row === "object" && row !== null && "n" in row && row.n === 1;
}

function loadWindow({
  db,
  venueId,
  start,
  end,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  start: ManilaDate;
  end: ManilaDate;
}): WindowInput {
  const settings = parseVenueSettingsRow(db.prepare("SELECT * FROM venue_settings WHERE venue_id = ?").get(venueId));
  const courtRows = db
    .prepare("SELECT * FROM courts WHERE venue_id = ? ORDER BY sort_order ASC")
    .all(venueId) as readonly unknown[];
  const bookingRows = db
    .prepare("SELECT * FROM bookings WHERE venue_id = ? AND date >= ? AND date <= ?")
    .all(venueId, start as string, end as string) as readonly unknown[];
  const sessionRows = db.prepare("SELECT * FROM court_sessions WHERE venue_id = ?").all(venueId) as readonly unknown[];
  const bookings = bookingRows.map((row) => parseBookingRow(row));
  const wanted = new Set(bookings.map((booking) => booking.id as string));
  const sessionsByBooking = new Map<string, CourtSession>();
  for (const row of sessionRows) {
    const session = parseSessionRow(row);
    if (wanted.has(session.bookingId as string)) sessionsByBooking.set(session.bookingId as string, session);
  }
  let days = 0;
  let cursor = start;
  while (cursor <= (end as string)) {
    days += 1;
    cursor = shiftDate({ date: cursor, days: 1 });
  }
  return {
    bookings,
    sessionsByBooking,
    courts: courtRows.map((row) => parseCourtRow(row)),
    openMinute: settings.openMinute,
    closeMinute: settings.closeMinute,
    days,
    payments: loadWindowPayments({ db, venueId, start, end }),
    openPlay: loadWindowOpenPlay({ db, venueId, start, end }),
  };
}

function loadWindowPayments({
  db,
  venueId,
  start,
  end,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  start: ManilaDate;
  end: ManilaDate;
}): WindowPayment[] {
  if (!tableExists({ db, table: "payments" })) return [];
  const rows = db
    .prepare("SELECT method, submitted_centavos, status, kind, substr(created_at, 1, 10) AS day FROM payments WHERE venue_id = ?")
    .all(venueId) as readonly unknown[];
  const payments: WindowPayment[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const day = record["day"];
    if (typeof day !== "string" || day < (start as string) || day > (end as string)) continue;
    const centavos = record["submitted_centavos"];
    const status = record["status"];
    const kind = record["kind"];
    const method = record["method"];
    if (typeof centavos !== "number" || typeof status !== "string" || typeof kind !== "string") continue;
    if (method !== null && typeof method !== "string") continue;
    payments.push({ method, centavos, day, status, kind });
  }
  return payments;
}

function loadWindowOpenPlay({
  db,
  venueId,
  start,
  end,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  start: ManilaDate;
  end: ManilaDate;
}): WindowOpenPlay {
  if (!tableExists({ db, table: "openplay_sessions" }) || !tableExists({ db, table: "openplay_registrations" })) {
    return { minutes: 0, participants: 0 };
  }
  const sessions = db
    .prepare("SELECT id, start_minute, end_minute FROM openplay_sessions WHERE venue_id = ? AND date >= ? AND date <= ?")
    .all(venueId, start as string, end as string) as readonly unknown[];
  let minutes = 0;
  let participants = 0;
  for (const row of sessions) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const id = record["id"];
    const startMinute = record["start_minute"];
    const endMinute = record["end_minute"];
    if (typeof id !== "number" || typeof startMinute !== "number" || typeof endMinute !== "number") continue;
    minutes += Math.max(0, endMinute - startMinute);
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM openplay_registrations WHERE session_id = ? AND slot = 'roster'")
      .get(id);
    if (typeof count === "object" && count !== null && "n" in count && typeof count.n === "number") {
      participants += count.n;
    }
  }
  return { minutes, participants };
}

export function buildReports({ db, venueId, range }: { db: DatabaseSync; venueId: VenueId; range: ReportRange }): ReportsResponse {
  const days = reportRangeDays({ range });
  const end = manilaNow({}).date;
  const start = shiftDate({ date: end, days: -(days - 1) });
  const current = aggregateWindow(loadWindow({ db, venueId, start, end }));
  const priorEnd = shiftDate({ date: start, days: -1 });
  const priorStart = shiftDate({ date: priorEnd, days: -(days - 1) });
  const prior = aggregateWindow(loadWindow({ db, venueId, start: priorStart, end: priorEnd }));
  return {
    range,
    startDate: start as string,
    endDate: end as string,
    days,
    utilization: current.utilization,
    utilizationDeltaPoints: round1({ value: current.utilization - prior.utilization }),
    bookedMinutes: current.bookedMinutes,
    playedMinutes: current.playedMinutes,
    revenueCentavos: current.revenueCentavos,
    outstandingCentavos: current.outstandingCentavos,
    openPlay: current.openPlay,
    perCourt: current.perCourt,
    outcomes: current.outcomes,
    completionRate: current.completionRate,
    completionDeltaPoints: round1({ value: current.completionRate - prior.completionRate }),
    busyBuckets: current.busyBuckets,
    busyRows: current.busyRows,
    paymentMix: current.paymentMix,
  };
}

export function createReportRoutes({ db }: { db: DatabaseSync }): Hono<AuthedContext> {
  const app = new Hono<AuthedContext>();
  const staffOnly = requireStaff({ db });
  const venueOnly = requireVenue({ db });

  app.get("/api/reports", staffOnly, venueOnly, (c) => {
    const raw = c.req.query("range") ?? "7d";
    const range = parseReportRange({ value: raw });
    if (range === null) {
      return c.json({ error: "Range must be one of today, 7d, 30d." }, 400);
    }
    const auth = readAuth({ c, db });
    return c.json(buildReports({ db, venueId: auth.venueId, range }));
  });

  return app;
}

export function describeRange({ range }: { range: ReportRange }): string {
  switch (range) {
    case "today":
      return "Today";
    case "7d":
      return "7 days";
    case "30d":
      return "30 days";
    default:
      return assertNever({ value: range });
  }
}
