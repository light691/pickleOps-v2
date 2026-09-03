import { ApiError, OverlapError, getActiveVenueId } from "../api.ts";
import {
  bookingId,
  courtId,
  manilaDate,
  minuteOfDay,
  type Booking,
  type BookingId,
  type ClashInfo,
  type ManilaDate,
  type VenueId,
} from "../../shared/types.ts";
import { parseCalendarBlockState, type CalendarBlock, type CalendarResponse } from "../../server/routes/calendarTypes.ts";
import { parseBooking } from "../api.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString({ record, field }: { record: Record<string, unknown>; field: string }): string {
  const value = record[field];
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected calendar shape at ${field}.`, status: 502 });
  return value;
}

function requiredNumber({ record, field }: { record: Record<string, unknown>; field: string }): number {
  const value = record[field];
  if (typeof value !== "number") throw new ApiError({ message: `Unexpected calendar shape at ${field}.`, status: 502 });
  return value;
}

function parseBlock(value: unknown): CalendarBlock {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected calendar block in response.", status: 502 });
  const state = parseCalendarBlockState({ value: value["state"] });
  if (state === null) throw new ApiError({ message: "Unexpected calendar block state in response.", status: 502 });
  const kind = value["kind"];
  if (kind !== "booking" && kind !== "openplay") {
    throw new ApiError({ message: "Unexpected calendar block kind in response.", status: 502 });
  }
  const bookingRaw = value["bookingId"];
  const sessionRaw = value["sessionId"];
  return {
    kind,
    courtId: courtId(requiredNumber({ record: value, field: "courtId" })),
    court: requiredString({ record: value, field: "court" }),
    bookingId: bookingRaw === null ? null : bookingId(requiredString({ record: value, field: "bookingId" })),
    sessionId: sessionRaw === null ? null : requiredNumber({ record: value, field: "sessionId" }),
    customer: requiredString({ record: value, field: "customer" }),
    date: manilaDate(requiredString({ record: value, field: "date" })),
    startMinute: minuteOfDay(requiredNumber({ record: value, field: "startMinute" })),
    durationMinutes: requiredNumber({ record: value, field: "durationMinutes" }),
    endMinute: minuteOfDay(requiredNumber({ record: value, field: "endMinute" })),
    state,
    paymentHint: requiredString({ record: value, field: "paymentHint" }),
  };
}

export function parseCalendar(value: unknown): CalendarResponse {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected calendar response.", status: 502 });
  const blocks = value["blocks"];
  if (!Array.isArray(blocks)) throw new ApiError({ message: "Unexpected calendar response.", status: 502 });
  return {
    date: manilaDate(requiredString({ record: value, field: "date" })),
    blocks: blocks.map((block) => parseBlock(block)),
  };
}

function parseClash(value: unknown): ClashInfo | null {
  if (!isRecord(value)) return null;
  try {
    return {
      court: requiredString({ record: value, field: "court" }),
      customer: requiredString({ record: value, field: "customer" }),
      startMinute: minuteOfDay(requiredNumber({ record: value, field: "startMinute" })),
      endMinute: minuteOfDay(requiredNumber({ record: value, field: "endMinute" })),
      summary: value["summary"] === undefined || value["summary"] === null ? "" : requiredString({ record: value, field: "summary" }),
    };
  } catch {
    return null;
  }
}

async function calendarRequest({
  path,
  method,
  body,
}: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const venueId: VenueId = getActiveVenueId();
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Venue-Id": venueId as string,
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

export async function fetchCalendar({ date }: { date: ManilaDate }): Promise<CalendarResponse> {
  return parseCalendar(await calendarRequest({ path: `/api/calendar?date=${date as string}`, method: "GET" }));
}

export interface PatchBookingRequest {
  readonly courtId?: number;
  readonly customerName?: string;
  readonly mobile?: string | null;
  readonly source?: string;
  readonly date?: string;
  readonly startMinute?: number;
  readonly durationMinutes?: number;
  readonly players?: number;
  readonly notes?: string | null;
  readonly status?: string;
}

export async function patchBookingRequest({
  id,
  input,
}: {
  id: BookingId;
  input: PatchBookingRequest;
}): Promise<Booking> {
  const payload = await calendarRequest({ path: `/api/bookings/${id as string}`, method: "PATCH", body: { ...input } });
  return parseBooking(payload);
}
