/// <reference types="vite/client" />
import { useEffect, useState } from "react";
import { ApiError, login } from "../api.ts";
import type { ReportRange, ReportsResponse } from "../../server/routes/reportTypes.ts";
import { fetchReports } from "./reportsApi.ts";
import "./reports.css";

const TABS: readonly { label: string; range: ReportRange }[] = [
  { label: "Today", range: "today" },
  { label: "7 days", range: "7d" },
  { label: "30 days", range: "30d" },
];

const OUTCOME_LABELS: readonly { label: string; key: "played" | "rescheduled" | "cancelled" | "noShow" }[] = [
  { label: "Played", key: "played" },
  { label: "Rescheduled", key: "rescheduled" },
  { label: "Cancelled", key: "cancelled" },
  { label: "No-show", key: "noShow" },
];

function formatHours({ minutes }: { minutes: number }): string {
  const rounded = Math.round((minutes / 60) * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)} hrs`;
}

function formatPesoShort({ centavos }: { centavos: number }): string {
  const pesos = centavos / 100;
  if (Number.isInteger(pesos)) return `₱${pesos.toLocaleString("en-PH")}`;
  return `₱${pesos.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedPoints({ value }: { value: number }): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function playedShare({ playedMinutes, bookedMinutes }: { playedMinutes: number; bookedMinutes: number }): string {
  if (bookedMinutes <= 0) return "No booked time";
  return `${Math.round((playedMinutes / bookedMinutes) * 100)}% of booked time`;
}

function openPlayNote({ report }: { report: ReportsResponse }): string {
  const hours = formatHours({ minutes: report.openPlay.bookedMinutes });
  if (report.openPlay.participants > 0) {
    return `Includes ${hours} open play · ${report.openPlay.participants} players`;
  }
  return `Includes ${hours} open play`;
}

function rangeNote({ report }: { report: ReportsResponse }): string {
  if (report.range === "today") return `Today · ${report.endDate}`;
  return `${report.startDate} to ${report.endDate}`;
}

export function ReportsView() {
  const [range, setRange] = useState<ReportRange>("7d");
  const [report, setReport] = useState<ReportsResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [pin, setPin] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetchReports({ range })
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setError(null);
        setNeedsLogin(false);
        setLoaded(true);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load reports.");
        setNeedsLogin(loadError instanceof ApiError && loadError.status === 401);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  async function signIn({ event }: { event: React.FormEvent }): Promise<void> {
    event.preventDefault();
    setSigningIn(true);
    try {
      await login({ name: staffName.trim(), pin });
      setPin("");
      const result = await fetchReports({ range });
      setReport(result);
      setError(null);
      setNeedsLogin(false);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Sign in failed.");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <section className="page-panel reports-page">
      <div className="page-title reports-title">
        <div>
          <h1>Venue reports</h1>
          <p>See how courts, bookings, and collections are performing.</p>
        </div>
        <div className="range-switch" aria-label="Report period">
          {TABS.map((tab) => (
            <button
              key={tab.range}
              className={range === tab.range ? "active" : ""}
              aria-pressed={range === tab.range}
              onClick={() => setRange(tab.range)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {needsLogin && (
        <form className="login-inline" onSubmit={(event) => void signIn({ event })}>
          <strong>Sign in to see venue reports</strong>
          <span>Use your staff name and 4-digit PIN.</span>
          <div>
            <input
              aria-label="Staff name"
              placeholder="Staff name"
              value={staffName}
              onChange={(event) => setStaffName(event.target.value)}
            />
            <input
              aria-label="Staff PIN"
              placeholder="PIN"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
            <button className="primary-button" type="submit" disabled={signingIn}>
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      )}
      {!loaded && <p className="reports-status">{error ?? "Loading venue reports…"}</p>}
      {loaded && error !== null && !needsLogin && <p className="reports-status">{error}</p>}
      {report !== null && (
        <>
          <div className="report-metrics">
            <article>
              <span>Court utilization</span>
              <strong>{report.utilization}%</strong>
              <small className={report.utilizationDeltaPoints >= 0 ? "positive" : undefined}>
                {formatSignedPoints({ value: report.utilizationDeltaPoints })} points vs prior period
              </small>
            </article>
            <article>
              <span>Booked court time</span>
              <strong>{formatHours({ minutes: report.bookedMinutes })}</strong>
              <small>{openPlayNote({ report })}</small>
            </article>
            <article>
              <span>Actual played time</span>
              <strong>{formatHours({ minutes: report.playedMinutes })}</strong>
              <small>{playedShare({ playedMinutes: report.playedMinutes, bookedMinutes: report.bookedMinutes })}</small>
            </article>
            <article>
              <span>Collected revenue</span>
              <strong>{formatPesoShort({ centavos: report.revenueCentavos })}</strong>
              <small>{formatPesoShort({ centavos: report.outstandingCentavos })} still pending</small>
            </article>
          </div>
          <div className="report-grid">
            <article className="report-card utilization-card">
              <div className="report-card-head">
                <div>
                  <h2>Utilization by court</h2>
                  <p>Played hours ÷ available court hours</p>
                </div>
                <span>{rangeNote({ report })}</span>
              </div>
              <div className="court-performance">
                {report.perCourt.map((court) => (
                  <div key={court.courtId}>
                    <strong>{court.court}</strong>
                    <progress value={court.utilization} max="100" aria-label={`${court.court} utilization ${court.utilization}%`} />
                    <span>{court.utilization}%</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="report-card outcomes-card">
              <div className="report-card-head">
                <div>
                  <h2>Booking outcomes</h2>
                  <p>What happened after a reservation</p>
                </div>
              </div>
              {OUTCOME_LABELS.map((outcome, index) => (
                <div className="outcome-row" key={outcome.label}>
                  <span>
                    <i className={`outcome-dot outcome-${index}`} />
                    {outcome.label}
                  </span>
                  <strong>{report.outcomes[outcome.key]}</strong>
                </div>
              ))}
              <div className="report-callout">
                <span>Completion rate</span>
                <strong>{report.completionRate}%</strong>
                <small>
                  {formatSignedPoints({ value: report.completionDeltaPoints })} points vs prior period
                </small>
              </div>
            </article>
            <article className="report-card heatmap-card">
              <div className="report-card-head">
                <div>
                  <h2>Busiest court hours</h2>
                  <p>Average utilization by time of day</p>
                </div>
                <span>Mon–Sun</span>
              </div>
              <div className="heatmap" role="table" aria-label="Court utilization by time">
                <div className="heatmap-row heatmap-labels">
                  <span />
                  {report.busyBuckets.map((bucket) => (
                    <span key={bucket.startMinute}>{bucket.label}</span>
                  ))}
                </div>
                {report.busyRows.map((row) => (
                  <div className="heatmap-row" key={row.courtId}>
                    <strong>C{row.courtId}</strong>
                    {row.levels.map((level, cell) => {
                      const bucket = report.busyBuckets[cell];
                      return (
                        <span
                          key={bucket?.startMinute ?? cell}
                          className={`heat-${level}`}
                          title={`${row.court}, ${bucket?.label ?? ""}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="heat-legend">
                <span>Quieter</span>
                <i className="heat-0" />
                <i className="heat-1" />
                <i className="heat-2" />
                <i className="heat-3" />
                <span>Busier</span>
              </div>
            </article>
            <article className="report-card payment-mix-card">
              <div className="report-card-head">
                <div>
                  <h2>Payment mix</h2>
                  <p>Share of collected revenue</p>
                </div>
              </div>
              {report.paymentMix.map((entry) => (
                <div className="mix-row" key={entry.method}>
                  <div>
                    <span>{entry.method}</span>
                    <strong>{entry.share}%</strong>
                  </div>
                  <progress value={entry.share} max="100" aria-label={`${entry.method} ${entry.share}%`} />
                </div>
              ))}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
