import { ApiError, getActiveVenueId } from "../api.ts";
import type {
  ReportBusyBucket,
  ReportBusyRow,
  ReportCourtUtilization,
  ReportOpenPlay,
  ReportOutcomes,
  ReportPaymentMethod,
  ReportPaymentMixEntry,
  ReportRange,
  ReportsResponse,
} from "../../server/routes/reportTypes.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString({ record, field }: { record: Record<string, unknown>; field: string }): string {
  const value = record[field];
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected reports response at ${field}.`, status: 502 });
  return value;
}

function requiredNumber({ record, field }: { record: Record<string, unknown>; field: string }): number {
  const value = record[field];
  if (typeof value !== "number") throw new ApiError({ message: `Unexpected reports response at ${field}.`, status: 502 });
  return value;
}

function requiredRange({ value }: { value: unknown }): ReportRange {
  if (value === "today" || value === "7d" || value === "30d") return value;
  throw new ApiError({ message: "Unexpected reports range in response.", status: 502 });
}

function parseMethod({ value }: { value: unknown }): ReportPaymentMethod {
  if (value === "GCash" || value === "Maya" || value === "Cash" || value === "Bank transfer") return value;
  throw new ApiError({ message: "Unexpected payment method in response.", status: 502 });
}

function parseCourtUtilization(value: unknown): ReportCourtUtilization {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected court utilization in response.", status: 502 });
  return {
    courtId: requiredNumber({ record: value, field: "courtId" }),
    court: requiredString({ record: value, field: "court" }),
    bookedMinutes: requiredNumber({ record: value, field: "bookedMinutes" }),
    playedMinutes: requiredNumber({ record: value, field: "playedMinutes" }),
    availableMinutes: requiredNumber({ record: value, field: "availableMinutes" }),
    utilization: requiredNumber({ record: value, field: "utilization" }),
  };
}

function parseOutcomes(value: unknown): ReportOutcomes {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected booking outcomes in response.", status: 502 });
  return {
    played: requiredNumber({ record: value, field: "played" }),
    rescheduled: requiredNumber({ record: value, field: "rescheduled" }),
    cancelled: requiredNumber({ record: value, field: "cancelled" }),
    noShow: requiredNumber({ record: value, field: "noShow" }),
  };
}

function parseBucket(value: unknown): ReportBusyBucket {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected busy bucket in response.", status: 502 });
  return {
    label: requiredString({ record: value, field: "label" }),
    startMinute: requiredNumber({ record: value, field: "startMinute" }),
  };
}

function parseNumberList({ value }: { value: unknown }): readonly number[] {
  if (!Array.isArray(value)) throw new ApiError({ message: "Unexpected busy row in response.", status: 502 });
  return value.map((entry) => {
    if (typeof entry !== "number") throw new ApiError({ message: "Unexpected busy row in response.", status: 502 });
    return entry;
  });
}

function parseBusyRow(value: unknown): ReportBusyRow {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected busy row in response.", status: 502 });
  return {
    courtId: requiredNumber({ record: value, field: "courtId" }),
    court: requiredString({ record: value, field: "court" }),
    minutes: parseNumberList({ value: value["minutes"] }),
    levels: parseNumberList({ value: value["levels"] }),
  };
}

function parseMixEntry(value: unknown): ReportPaymentMixEntry {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected payment mix in response.", status: 502 });
  return {
    method: parseMethod({ value: value["method"] }),
    centavos: requiredNumber({ record: value, field: "centavos" }),
    share: requiredNumber({ record: value, field: "share" }),
  };
}

function parseOpenPlay(value: unknown): ReportOpenPlay {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected open play summary in response.", status: 502 });
  return {
    participants: requiredNumber({ record: value, field: "participants" }),
    revenueCentavos: requiredNumber({ record: value, field: "revenueCentavos" }),
    bookedMinutes: requiredNumber({ record: value, field: "bookedMinutes" }),
  };
}

export function parseReports(value: unknown): ReportsResponse {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected reports response.", status: 502 });
  const perCourt = value["perCourt"];
  const buckets = value["busyBuckets"];
  const rows = value["busyRows"];
  const mix = value["paymentMix"];
  if (!Array.isArray(perCourt) || !Array.isArray(buckets) || !Array.isArray(rows) || !Array.isArray(mix)) {
    throw new ApiError({ message: "Unexpected reports response.", status: 502 });
  }
  return {
    range: requiredRange({ value: value["range"] }),
    startDate: requiredString({ record: value, field: "startDate" }),
    endDate: requiredString({ record: value, field: "endDate" }),
    days: requiredNumber({ record: value, field: "days" }),
    utilization: requiredNumber({ record: value, field: "utilization" }),
    utilizationDeltaPoints: requiredNumber({ record: value, field: "utilizationDeltaPoints" }),
    bookedMinutes: requiredNumber({ record: value, field: "bookedMinutes" }),
    playedMinutes: requiredNumber({ record: value, field: "playedMinutes" }),
    revenueCentavos: requiredNumber({ record: value, field: "revenueCentavos" }),
    outstandingCentavos: requiredNumber({ record: value, field: "outstandingCentavos" }),
    openPlay: parseOpenPlay(value["openPlay"]),
    perCourt: perCourt.map((entry) => parseCourtUtilization(entry)),
    outcomes: parseOutcomes(value["outcomes"]),
    completionRate: requiredNumber({ record: value, field: "completionRate" }),
    completionDeltaPoints: requiredNumber({ record: value, field: "completionDeltaPoints" }),
    busyBuckets: buckets.map((entry) => parseBucket(entry)),
    busyRows: rows.map((entry) => parseBusyRow(entry)),
    paymentMix: mix.map((entry) => parseMixEntry(entry)),
  };
}

export async function fetchReports({ range }: { range: ReportRange }): Promise<ReportsResponse> {
  const res = await fetch(`/api/reports?range=${range}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { "X-Venue-Id": getActiveVenueId() as string },
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message =
      isRecord(payload) && typeof payload["error"] === "string" ? payload["error"] : `Request failed with status ${res.status}.`;
    throw new ApiError({ message, status: res.status });
  }
  return parseReports(payload);
}
