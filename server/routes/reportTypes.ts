import { assertNever } from "../../shared/types.ts";

export const REPORT_RANGES = ["today", "7d", "30d"] as const;

export type ReportRange = (typeof REPORT_RANGES)[number];

export const REPORT_PAYMENT_METHODS = ["GCash", "Maya", "Cash", "Bank transfer"] as const;

export type ReportPaymentMethod = (typeof REPORT_PAYMENT_METHODS)[number];

export interface ReportCourtUtilization {
  readonly courtId: number;
  readonly court: string;
  readonly bookedMinutes: number;
  readonly playedMinutes: number;
  readonly availableMinutes: number;
  readonly utilization: number;
}

export interface ReportOutcomes {
  readonly played: number;
  readonly rescheduled: number;
  readonly cancelled: number;
  readonly noShow: number;
}

export interface ReportBusyBucket {
  readonly label: string;
  readonly startMinute: number;
}

export interface ReportBusyRow {
  readonly courtId: number;
  readonly court: string;
  readonly minutes: readonly number[];
  readonly levels: readonly number[];
}

export interface ReportPaymentMixEntry {
  readonly method: ReportPaymentMethod;
  readonly centavos: number;
  readonly share: number;
}

export interface ReportOpenPlay {
  readonly participants: number;
  readonly revenueCentavos: number;
  readonly bookedMinutes: number;
}

export interface ReportsResponse {
  readonly range: ReportRange;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
  readonly utilization: number;
  readonly utilizationDeltaPoints: number;
  readonly bookedMinutes: number;
  readonly playedMinutes: number;
  readonly revenueCentavos: number;
  readonly outstandingCentavos: number;
  readonly openPlay: ReportOpenPlay;
  readonly perCourt: readonly ReportCourtUtilization[];
  readonly outcomes: ReportOutcomes;
  readonly completionRate: number;
  readonly completionDeltaPoints: number;
  readonly busyBuckets: readonly ReportBusyBucket[];
  readonly busyRows: readonly ReportBusyRow[];
  readonly paymentMix: readonly ReportPaymentMixEntry[];
}

export function parseReportRange({ value }: { value: unknown }): ReportRange | null {
  if (value === "today" || value === "7d" || value === "30d") return value;
  return null;
}

export function reportRangeDays({ range }: { range: ReportRange }): number {
  switch (range) {
    case "today":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    default:
      return assertNever({ value: range });
  }
}
