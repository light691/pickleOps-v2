import type {
  BookingId,
  BookingStatus,
  BookingSource,
  CourtId,
  ManilaDate,
  MinutesFromMidnight,
} from "../../shared/types.ts";

export const CALENDAR_BLOCK_STATES = ["confirmed", "playing", "held", "openplay"] as const;

export type CalendarBlockState = (typeof CALENDAR_BLOCK_STATES)[number];

export function parseCalendarBlockState({ value }: { value: unknown }): CalendarBlockState | null {
  for (const state of CALENDAR_BLOCK_STATES) {
    if (value === state) return state;
  }
  return null;
}

export interface CalendarBlock {
  readonly kind: "booking" | "openplay";
  readonly courtId: CourtId;
  readonly court: string;
  readonly bookingId: BookingId | null;
  readonly sessionId: number | null;
  readonly customer: string;
  readonly date: ManilaDate;
  readonly startMinute: MinutesFromMidnight;
  readonly durationMinutes: number;
  readonly endMinute: MinutesFromMidnight;
  readonly state: CalendarBlockState;
  readonly paymentHint: string;
}

export interface CalendarResponse {
  readonly date: ManilaDate;
  readonly blocks: readonly CalendarBlock[];
}

export const PATCH_BOOKING_STATUSES = ["Cancelled"] as const;

export type PatchBookingStatus = (typeof PATCH_BOOKING_STATUSES)[number];

export interface PatchBookingFields {
  readonly courtId: CourtId | null;
  readonly customerName: string | null;
  readonly mobile: string | null;
  readonly mobileTouched: boolean;
  readonly source: BookingSource | null;
  readonly date: ManilaDate | null;
  readonly startMinute: MinutesFromMidnight | null;
  readonly durationMinutes: number | null;
  readonly players: number | null;
  readonly notes: string | null;
  readonly notesTouched: boolean;
  readonly status: BookingStatus | null;
}

export function emptyPatchFields(): PatchBookingFields {
  return {
    courtId: null,
    customerName: null,
    mobile: null,
    mobileTouched: false,
    source: null,
    date: null,
    startMinute: null,
    durationMinutes: null,
    players: null,
    notes: null,
    notesTouched: false,
    status: null,
  };
}
