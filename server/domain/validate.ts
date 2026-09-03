import {
  BOOKING_SOURCES,
  bookingId,
  courtId,
  manilaDate,
  minuteOfDay,
  type BookingId,
  type BookingSource,
  type CourtId,
  type ManilaDate,
  type MinutesFromMidnight,
  type NewBookingInput,
} from "../../shared/types.ts";

function isBookingSource(value: unknown): value is BookingSource {
  return BOOKING_SOURCES.some((candidate) => candidate === value);
}

export type FieldErrors = Record<string, string>;

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: FieldErrors };

export function unknownJson(value: unknown): unknown {
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePositiveIntParam(raw: string | undefined, field: string): ParseResult<number> {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return { ok: false, errors: { [field]: "Must be a positive integer." } };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, errors: { [field]: "Must be a positive integer." } };
  }
  return { ok: true, value };
}

export function parsePinInput(value: unknown): ParseResult<string> {
  if (!isRecord(value) || typeof value.pin !== "string" || !/^\d{4,8}$/.test(value.pin)) {
    return { ok: false, errors: { pin: "Enter your 4 to 8 digit PIN." } };
  }
  return { ok: true, value: value.pin };
}

export function parseBookingInput(value: unknown): ParseResult<NewBookingInput> {
  if (!isRecord(value)) {
    return { ok: false, errors: { body: "Expected a JSON object." } };
  }

  const errors: FieldErrors = {};
  let courtIdValue: CourtId | null = null;
  const rawCourtId = value.courtId;
  if (typeof rawCourtId !== "number" || !Number.isSafeInteger(rawCourtId) || rawCourtId <= 0) {
    errors.courtId = "Pick a court.";
  } else {
    courtIdValue = courtId(rawCourtId);
  }

  const rawCustomerName = value.customerName;
  let customerNameValue: string | null = null;
  if (typeof rawCustomerName !== "string" || rawCustomerName.trim().length === 0 || rawCustomerName.length > 120) {
    errors.customerName = "Enter the customer name.";
  } else {
    customerNameValue = rawCustomerName.trim();
  }

  const rawMobile = value.mobile;
  if (rawMobile !== null && rawMobile !== undefined && typeof rawMobile !== "string") {
    errors.mobile = "Mobile number must be text.";
  }

  const rawSource = value.source;
  let sourceValue: BookingSource | null = null;
  if (typeof rawSource !== "string" || !isBookingSource(rawSource)) {
    errors.source = "Pick a booking source.";
  } else {
    sourceValue = rawSource;
  }

  const rawDate = value.date;
  let dateValue: ManilaDate | null = null;
  if (typeof rawDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    errors.date = "Enter the booking date.";
  } else {
    dateValue = manilaDate(rawDate);
  }

  const rawStartMinute = value.startMinute;
  let startMinuteValue: MinutesFromMidnight | null = null;
  if (
    typeof rawStartMinute !== "number" ||
    !Number.isSafeInteger(rawStartMinute) ||
    rawStartMinute < 0 ||
    rawStartMinute >= 1440
  ) {
    errors.startMinute = "Enter a start time between 00:00 and 23:59.";
  } else {
    startMinuteValue = minuteOfDay(rawStartMinute);
  }

  const rawDuration = value.durationMinutes;
  let durationValue: number | null = null;
  if (
    typeof rawDuration !== "number" ||
    !Number.isSafeInteger(rawDuration) ||
    rawDuration < 30 ||
    rawDuration > 480 ||
    rawDuration % 30 !== 0
  ) {
    errors.durationMinutes = "Duration must be a multiple of 30 minutes between 30 and 480.";
  } else {
    durationValue = rawDuration;
  }

  const rawPlayers = value.players;
  let playersValue: number | null = null;
  if (typeof rawPlayers !== "number" || !Number.isSafeInteger(rawPlayers) || rawPlayers < 1 || rawPlayers > 24) {
    errors.players = "Players must be between 1 and 24.";
  } else {
    playersValue = rawPlayers;
  }

  const rawNotes = value.notes;
  if (rawNotes !== null && rawNotes !== undefined && typeof rawNotes !== "string") {
    errors.notes = "Notes must be text.";
  }

  if (
    Object.keys(errors).length > 0 ||
    courtIdValue === null ||
    customerNameValue === null ||
    sourceValue === null ||
    dateValue === null ||
    startMinuteValue === null ||
    durationValue === null ||
    playersValue === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      courtId: courtIdValue,
      customerName: customerNameValue,
      mobile: typeof rawMobile === "string" && rawMobile.trim().length > 0 ? rawMobile.trim() : null,
      source: sourceValue,
      date: dateValue,
      startMinute: startMinuteValue,
      durationMinutes: durationValue,
      players: playersValue,
      notes: typeof rawNotes === "string" && rawNotes.trim().length > 0 ? rawNotes.trim() : null,
    },
  };
}

export function parseBookingIdParam(raw: string | undefined): ParseResult<BookingId> {
  if (raw === undefined) {
    return { ok: false, errors: { id: "Missing booking id." } };
  }
  try {
    return { ok: true, value: bookingId(raw) };
  } catch {
    return { ok: false, errors: { id: `Booking id must match RP-YYMMDD-NNN, got ${raw}.` } };
  }
}
