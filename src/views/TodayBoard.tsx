import { useEffect, useState } from "react";
import { Clock, DotsThree } from "@phosphor-icons/react";
import { fetchToday } from "../api.ts";
import type { TodayCourtCard } from "../../shared/types.ts";

function StatusPill({ children, kind = "" }: { children: string; kind?: string }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

function eventKind({ status }: { status: TodayCourtCard["status"] }): string {
  if (status === "Overtime") return "danger";
  if (status === "Arriving soon") return "gold";
  if (status === "In play") return "lavender";
  if (status === "Open play soon") return "pink";
  return "";
}

function greetingForHour({ hour }: { hour: number }): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function OperationsOverview({ courts, staffName }: { courts: readonly TodayCourtCard[]; staffName: string }) {
  const available = courts.filter((court) => court.status === "Available").length;
  const inPlay = courts.filter((court) => court.status === "In play").length;
  const attention = courts.filter((court) => court.status === "Overtime" || court.status === "Arriving soon").length;
  const events = courts.filter((court) => court.status !== "Available");

  return (
    <section className="operations-overview">
      <div className="events-panel">
        <div className="section-heading">
          <div>
            <h1>{greetingForHour({ hour: new Date().getHours() })}, {staffName.split(" ")[0]}</h1>
            <p>What needs your attention in the next 90 minutes.</p>
          </div>
          <button className="period">
            Now & next
          </button>
        </div>
        <div className="event-list">
          {events.length === 0 && (
            <div className="event-row">
              <span className="event-marker"></span>
              <time>Now</time>
              <span className="event-court">All courts</span>
              <div>
                <strong>Every court is available</strong>
                <small>No upcoming arrivals in the next 30 minutes</small>
              </div>
            </div>
          )}
          {events.map((event) => (
            <div className="event-row" key={event.court}>
              <span className={`event-marker ${eventKind({ status: event.status })}`}></span>
              <time>{event.status === "Overtime" ? "Now" : event.next}</time>
              <span className="event-court">{event.court}</span>
              <div>
                <strong>{event.customer ?? event.headline ?? event.status}</strong>
                <small>{event.meta}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="ops-metrics">
        <div className="ops-metric">
          <span>Available now</span>
          <strong>
            {available} <small>courts</small>
          </strong>
        </div>
        <div className="ops-metric">
          <span>In play</span>
          <strong>
            {inPlay} <small>courts</small>
          </strong>
        </div>
        <div className="ops-metric attention">
          <span>Needs attention</span>
          <strong>
            {attention} <small>items</small>
          </strong>
        </div>
      </div>
    </section>
  );
}

function CourtCard({ item, onAction }: { item: TodayCourtCard; onAction: (item: TodayCourtCard) => void }) {
  return (
    <article className={`court-tile ${item.accent}`}>
      <div className="court-tile-head">
        <div>
          <span className="court-label">{item.court}</span>
          <StatusPill kind={item.kind}>{item.status}</StatusPill>
        </div>
        <button aria-label={`More options for ${item.court}`}>
          <DotsThree size={19} weight="bold" />
        </button>
      </div>
      <h3>{item.headline ?? item.customer ?? item.status}</h3>
      <p>{item.meta}</p>
      <div className="court-next">
        <Clock size={15} />
        <span>{item.next}</span>
      </div>
      <button className="court-action" onClick={() => onAction(item)}>
        {item.action}
      </button>
    </article>
  );
}

export function TodayBoard({ onCourtAction, staffName }: { onCourtAction: (item: TodayCourtCard) => void; staffName: string }) {
  const [courts, setCourts] = useState<readonly TodayCourtCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      const today = await fetchToday();
      setCourts(today.courts);
      setError(null);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load today.");
      setLoaded(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load();
    })();
    const timer = window.setInterval(() => {
      if (!cancelled) void load();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      <OperationsOverview courts={courts} staffName={staffName} />
      <section className="openplay-strip">
        <div>
          <h2>Open Play</h2>
          <p>Shared sessions, capacity, waitlist, and payment status for the day.</p>
        </div>
        <div className="openplay-strip-meta">
          <div>
            <span>Next session</span>
            <strong>2:00 PM</strong>
          </div>
          <div>
            <span>Registration</span>
            <strong>9 / 12</strong>
          </div>
          <div>
            <span>Needs payment</span>
            <strong>1 player</strong>
          </div>
        </div>
      </section>
      <section className="courts-section">
        <div className="courts-heading">
          <div>
            <h2>Courts right now</h2>
            <p>Live status for all six courts</p>
          </div>
          <span>{error ?? (loaded ? "Updated just now" : "Loading live status…")}</span>
        </div>
        <div className="court-grid">
          {courts.map((item) => (
            <CourtCard item={item} onAction={onCourtAction} key={item.court} />
          ))}
        </div>
      </section>
    </>
  );
}
