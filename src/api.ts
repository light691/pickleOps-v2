import {
  bookingId,
  centavos,
  courtId,
  courtSessionId,
  manilaDate,
  minuteOfDay,
  orgId,
  staffId,
  venueId,
  type Booking,
  type BookingId,
  type BookingSource,
  type BookingStatus,
  type Centavos,
  type ClashInfo,
  type CourtId,
  type CourtSession,
  type CourtStatus,
  type ManilaDate,
  type MinutesFromMidnight,
  type PaymentStatus,
  type StaffMember,
  type TodayCourtCard,
  type TodayResponse,
  type VenueId,
} from "../shared/types.ts";

export const DEFAULT_VENUE_ID = "venue-qc-01";
const VENUE_STORAGE_KEY = "pickleops.venueId";

export class ApiError extends Error {
  readonly status: number;
  constructor({ message, status }: { message: string; status: number }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export class OverlapError extends ApiError {
  readonly clash: ClashInfo | null;
  constructor({ message, clash }: { message: string; clash: ClashInfo | null }) {
    super({ message, status: 409 });
    this.name = "OverlapError";
    this.clash = clash;
  }
}

export function getActiveVenueId(): VenueId {
  try {
    const stored = window.localStorage.getItem(VENUE_STORAGE_KEY);
    if (stored !== null && stored.trim().length > 0) return venueId(stored.trim());
  } catch {
    // Storage is unavailable; fall through to the seeded venue.
  }
  return venueId(DEFAULT_VENUE_ID);
}

export function setActiveVenueId({ id }: { id: VenueId }): void {
  try {
    window.localStorage.setItem(VENUE_STORAGE_KEY, id as string);
  } catch {
    // Storage is unavailable; the header still carries the venue for this session.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString({ record, field }: { record: Record<string, unknown>; field: string }): string {
  const value = record[field];
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected response shape at ${field}.`, status: 502 });
  return value;
}

function optionalString({ record, field }: { record: Record<string, unknown>; field: string }): string | null {
  const value = record[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected response shape at ${field}.`, status: 502 });
  return value;
}

function requiredNumber({ record, field }: { record: Record<string, unknown>; field: string }): number {
  const value = record[field];
  if (typeof value !== "number") throw new ApiError({ message: `Unexpected response shape at ${field}.`, status: 502 });
  return value;
}

function optionalNumber({ record, field }: { record: Record<string, unknown>; field: string }): number | null {
  const value = record[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") throw new ApiError({ message: `Unexpected response shape at ${field}.`, status: 502 });
  return value;
}

function parseStatus({ value }: { value: unknown }): CourtStatus {
  if (
    value === "Available" ||
    value === "Arriving soon" ||
    value === "In play" ||
    value === "Open play soon" ||
    value === "Open play" ||
    value === "Overtime"
  ) {
    return value;
  }
  throw new ApiError({ message: "Unexpected court status in response.", status: 502 });
}

function parseSource({ value }: { value: unknown }): BookingSource {
  if (value === "Messenger" || value === "Viber" || value === "Phone" || value === "Walk-in") return value;
  throw new ApiError({ message: "Unexpected booking source in response.", status: 502 });
}

function parseBookingStatus({ value }: { value: unknown }): BookingStatus {
  if (
    value === "Reserved" ||
    value === "Arrived" ||
    value === "In play" ||
    value === "Completed" ||
    value === "Cancelled" ||
    value === "No-show"
  ) {
    return value;
  }
  throw new ApiError({ message: "Unexpected booking status in response.", status: 502 });
}

function parsePaymentStatus({ value }: { value: unknown }): PaymentStatus {
  if (value === "Awaiting payment" || value === "In review" || value === "Verified" || value === "Rejected") return value;
  throw new ApiError({ message: "Unexpected payment status in response.", status: 502 });
}

function parseClash(value: unknown): ClashInfo | null {
  if (!isRecord(value)) return null;
  try {
    const start = minuteOfDay(requiredNumber({ record: value, field: "startMinute" }));
    return {
      court: requiredString({ record: value, field: "court" }),
      customer: requiredString({ record: value, field: "customer" }),
      startMinute: start,
      endMinute: minuteOfDay(requiredNumber({ record: value, field: "endMinute" })),
      summary: optionalString({ record: value, field: "summary" }) ?? "",
    };
  } catch {
    return null;
  }
}

export function parseBooking(value: unknown): Booking {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected booking in response.", status: 502 });
  const total = optionalNumber({ record: value, field: "totalCentavos" });
  return {
    id: bookingId(requiredString({ record: value, field: "id" })),
    venueId: venueId(requiredString({ record: value, field: "venueId" })),
    courtId: courtId(requiredNumber({ record: value, field: "courtId" })),
    customerName: requiredString({ record: value, field: "customerName" }),
    mobile: optionalString({ record: value, field: "mobile" }),
    source: parseSource({ value: value["source"] }),
    date: manilaDate(requiredString({ record: value, field: "date" })),
    startMinute: minuteOfDay(requiredNumber({ record: value, field: "startMinute" })),
    durationMinutes: requiredNumber({ record: value, field: "durationMinutes" }),
    players: requiredNumber({ record: value, field: "players" }),
    notes: optionalString({ record: value, field: "notes" }),
    status: parseBookingStatus({ value: value["status"] }),
    paymentStatus: parsePaymentStatus({ value: value["paymentStatus"] }),
    totalCentavos: total === null ? null : centavos(total),
    createdByStaffId: staffId(requiredNumber({ record: value, field: "createdByStaffId" })),
  };
}

export function parseSession(value: unknown): CourtSession {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected session in response.", status: 502 });
  const ended = optionalNumber({ record: value, field: "endedMinute" });
  return {
    id: courtSessionId(requiredNumber({ record: value, field: "id" })),
    venueId: venueId(requiredString({ record: value, field: "venueId" })),
    bookingId: bookingId(requiredString({ record: value, field: "bookingId" })),
    courtId: courtId(requiredNumber({ record: value, field: "courtId" })),
    scheduledEndMinute: minuteOfDay(requiredNumber({ record: value, field: "scheduledEndMinute" })),
    startedMinute: minuteOfDay(requiredNumber({ record: value, field: "startedMinute" })),
    endedMinute: ended === null ? null : minuteOfDay(ended),
  };
}

function parseTodayCard(value: unknown): TodayCourtCard {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected court card in response.", status: 502 });
  const headline = value["headline"];
  const customer = value["customer"];
  if (headline !== null && headline !== undefined && typeof headline !== "string") {
    throw new ApiError({ message: "Unexpected court card in response.", status: 502 });
  }
  if (customer !== null && customer !== undefined && typeof customer !== "string") {
    throw new ApiError({ message: "Unexpected court card in response.", status: 502 });
  }
  const urgent = value["urgent"];
  if (typeof urgent !== "boolean") throw new ApiError({ message: "Unexpected court card in response.", status: 502 });
  return {
    courtId: courtId(requiredNumber({ record: value, field: "courtId" })),
    court: requiredString({ record: value, field: "court" }),
    status: parseStatus({ value: value["status"] }),
    kind: requiredString({ record: value, field: "kind" }),
    accent: requiredString({ record: value, field: "accent" }),
    headline: typeof headline === "string" ? headline : null,
    customer: typeof customer === "string" ? customer : null,
    meta: requiredString({ record: value, field: "meta" }),
    next: requiredString({ record: value, field: "next" }),
    action: requiredString({ record: value, field: "action" }),
    urgent,
  };
}

export function parseToday(value: unknown): TodayResponse {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected today response.", status: 502 });
  const courts = value["courts"];
  if (!Array.isArray(courts)) throw new ApiError({ message: "Unexpected today response.", status: 502 });
  return {
    date: manilaDate(requiredString({ record: value, field: "date" })),
    courts: courts.map((card) => parseTodayCard(card)),
  };
}

export interface StaffPayload {
  readonly staff: StaffMember;
  readonly venues: readonly VenueId[];
}

export function parseStaffPayload(value: unknown): StaffPayload {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected staff response.", status: 502 });
  const staff = value["staff"];
  const venues = value["venues"];
  if (!isRecord(staff) || !Array.isArray(venues)) {
    throw new ApiError({ message: "Unexpected staff response.", status: 502 });
  }
  const role = staff["role"];
  if (role !== "Attendant" && role !== "Manager" && role !== "Invited") {
    throw new ApiError({ message: "Unexpected staff role in response.", status: 502 });
  }
  const venueIds: VenueId[] = [];
  for (const entry of venues) {
    if (typeof entry !== "string") throw new ApiError({ message: "Unexpected venue in response.", status: 502 });
    venueIds.push(venueId(entry));
  }
  return {
    staff: {
      id: staffId(requiredNumber({ record: staff, field: "id" })),
      orgId: orgId(requiredString({ record: staff, field: "orgId" })),
      name: requiredString({ record: staff, field: "name" }),
      role,
    },
    venues: venueIds,
  };
}

async function request({
  path,
  method,
  body,
  venueId: active,
}: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  venueId?: VenueId;
}): Promise<unknown> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Venue-Id": ((active ?? getActiveVenueId()) as string),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (res.status === 409) {
    const message = isRecord(payload) && typeof payload["error"] === "string" ? payload["error"] : "Booking clashes.";
    throw new OverlapError({ message, clash: isRecord(payload) ? parseClash(payload["clash"]) : null });
  }
  if (!res.ok) {
    const message =
      isRecord(payload) && typeof payload["error"] === "string"
        ? payload["error"]
        : isRecord(payload) && typeof payload["errors"] === "object"
          ? "Check the highlighted fields and try again."
          : `Request failed with status ${res.status}.`;
    throw new ApiError({ message, status: res.status });
  }
  return payload;
}

export async function login({ name, pin }: { name: string; pin: string }): Promise<StaffPayload> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin }),
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message = isRecord(payload) && typeof payload["error"] === "string" ? payload["error"] : "Sign in failed.";
    throw new ApiError({ message, status: res.status });
  }
  return parseStaffPayload(payload);
}

export async function fetchMe(): Promise<StaffPayload> {
  const res = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message = isRecord(payload) && typeof payload["error"] === "string" ? payload["error"] : "Sign in with your staff PIN first.";
    throw new ApiError({ message, status: res.status });
  }
  return parseStaffPayload(payload);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  });
}

export async function fetchToday(): Promise<TodayResponse> {
  return parseToday(await request({ path: "/api/today", method: "GET" }));
}

export interface CreateBookingRequest {
  readonly courtId: number;
  readonly customerName: string;
  readonly mobile: string | null;
  readonly source: BookingSource;
  readonly date: string;
  readonly startMinute: number;
  readonly durationMinutes: number;
  readonly players: number;
  readonly notes: string | null;
}

export async function createBookingRequest({ input }: { input: CreateBookingRequest }): Promise<Booking> {
  const payload = await request({
    path: "/api/bookings",
    method: "POST",
    body: {
      courtId: courtId(input.courtId) as number,
      customerName: input.customerName,
      mobile: input.mobile,
      source: input.source,
      date: manilaDate(input.date) as string,
      startMinute: minuteOfDay(input.startMinute) as number,
      durationMinutes: input.durationMinutes,
      players: input.players,
      notes: input.notes,
    },
  });
  return parseBooking(payload);
}

export async function startBookingRequest({ id }: { id: BookingId }): Promise<CourtSession> {
  return parseSession(await request({ path: `/api/bookings/${id as string}/start`, method: "POST", body: {} }));
}

export async function endBookingRequest({ id }: { id: BookingId }): Promise<{ booking: Booking; totalCentavos: Centavos | null }> {
  const payload = await request({ path: `/api/bookings/${id as string}/end`, method: "POST", body: {} });
  if (!isRecord(payload)) throw new ApiError({ message: "Unexpected end-session response.", status: 502 });
  const total = optionalNumber({ record: payload, field: "totalCentavos" });
  return {
    booking: parseBooking(payload["booking"]),
    totalCentavos: total === null ? null : centavos(total),
  };
}

export type { BookingId, CourtId, ManilaDate, MinutesFromMidnight, VenueId };
