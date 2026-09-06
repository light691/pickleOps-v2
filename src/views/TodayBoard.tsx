import { useEffect, useId, useState } from "react";
import { ArrowUpRight, Clock, Info, TennisBall, UsersThree } from "@phosphor-icons/react";
import { fetchToday } from "../api.ts";
import { listOpenPlaySessions } from "./openplayApi.ts";
import type { TodayCourtCard } from "../../shared/types.ts";
import type { OpenPlaySession } from "../../server/routes/openplayTypes.ts";
import "./today.css";

const statuses = ["Available", "In play", "Arriving soon", "Open play soon", "Overtime"] as const;
const accents = ["available", "playing", "arriving", "openplay", "overtime"];
type StatusFilter = "All courts" | (typeof statuses)[number];

function matchesStatus(item: TodayCourtCard, status: string) {
  return status === "Open play soon" ? item.accent === "openplay" : item.status === status;
}

function courtActionLabel(item: TodayCourtCard) {
  return item.status === "Available" ? "Add walk-in" : item.accent === "openplay" ? "Manage session" : "View in Calendar";
}

function manilaNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return { date: now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }), minute: Number(parts.find(p => p.type === "hour")?.value) * 60 + Number(parts.find(p => p.type === "minute")?.value) };
}
function formatMinute(minute: number) {
  return `${Math.floor(minute / 60) % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${minute >= 720 ? "PM" : "AM"}`;
}
function CourtCard({ item, onAction }: { item: TodayCourtCard; onAction: (item: TodayCourtCard) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const revealed = !dismissed && (expanded || hovered);
  const id = useId();
  const timing = item.status === "Available" ? item.headline : item.status === "Arriving soon" || item.accent === "openplay" ? item.meta.split(" · ")[0] : item.next;
  return (
    <article className={`live-court ${item.accent} ${revealed ? "is-expanded" : ""}`}
      onPointerEnter={event => { if (event.pointerType === "mouse") { setHovered(true); setDismissed(false); } }}
      onPointerLeave={() => setHovered(false)}
      onFocus={event => { if (event.target.matches(":focus-visible")) { setExpanded(true); setDismissed(false); } }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }}
      onKeyDown={event => { if (event.key === "Escape") { setExpanded(false); setDismissed(true); } }}>
      <div className="live-court-head">
        <span className="live-court-name"><TennisBall size={19} weight="duotone" />{item.court}</span>
        <button className="court-info" aria-label={`Details for ${item.court}`} aria-expanded={revealed} aria-controls={id} onClick={() => { setExpanded(!expanded); setDismissed(expanded); }}><Info size={18} /></button>
      </div>
      <div className="live-court-status"><i />{item.status}</div>
      <p className="live-court-customer">{item.customer ?? "Ready for your next game"}</p>
      <div className="live-court-footer"><span><Clock size={14} />{timing}</span><button className="court-action-button" title={courtActionLabel(item)} aria-label={`${courtActionLabel(item)} — ${item.court}`} onClick={() => onAction(item)}>{courtActionLabel(item)}<ArrowUpRight size={14} /></button></div>
      <div className="court-reveal" id={id} hidden={!revealed}>
        <span className="court-reveal-label">SESSION DETAILS</span>
        <strong>{item.customer ?? item.headline ?? item.status}</strong>
        <p>{item.meta}</p><p>{item.next}</p>
        <button onClick={() => onAction(item)}>{courtActionLabel(item)}<ArrowUpRight size={15} /></button>
      </div>
    </article>
  );
}

export function TodayBoard({ onCourtAction, onOpenPlaySession, staffName }: { onCourtAction: (item: TodayCourtCard) => void; onOpenPlaySession?: (session: OpenPlaySession) => void; staffName: string }) {
  const [courts, setCourts] = useState<readonly TodayCourtCard[]>([]);
  const [sessions, setSessions] = useState<readonly OpenPlaySession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("All courts");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const now = manilaNow();
      const [today, openPlay] = await Promise.allSettled([fetchToday(), listOpenPlaySessions({ date: now.date })]);
      if (cancelled) return;
      if (today.status === "fulfilled") { setCourts(today.value.courts); setError(null); }
      else setError(today.reason instanceof Error ? today.reason.message : "Could not refresh courts.");
      if (openPlay.status === "fulfilled") { setSessions(openPlay.value); setSessionError(false); }
      else setSessionError(true);
      setLoaded(true);
    }
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  const now = manilaNow();
  const hour = Math.floor(now.minute / 60);
  const relevantSessions = sessions.filter(s => s.date === now.date && s.endMinute > now.minute).sort((a,b) => a.startMinute - b.startMinute);
  const visible = courts.filter(c => filter === "All courts" || matchesStatus(c, filter));
  const attention = courts.filter(c => c.urgent || c.status === "Arriving soon").sort((a,b) => Number(b.urgent)-Number(a.urgent));
  const hasFreshCounts = loaded && !error;
  const countFor = (status: (typeof statuses)[number]) => hasFreshCounts ? courts.filter(c => matchesStatus(c, status)).length : "—";
  const allCount = hasFreshCounts ? courts.length : "—";
  return (
    <div className="today-page">
      <header className="today-welcome"><div><span className="today-eyebrow">VENUE OVERVIEW</span><h1>Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, {staffName.split(" ")[0]}.</h1><p>Live court status and next actions.</p></div><div className="today-date"><span>{new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long" })}</span><strong>{new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" })}</strong></div></header>
      <section className="today-status-toolbar" aria-label="Filter courts by status">
        <div className="court-filters" role="group" aria-label="Court status filters">
          <button className={filter === "All courts" ? "active" : ""} aria-pressed={filter === "All courts"} aria-label={`Show all courts, ${allCount} total`} onClick={() => setFilter("All courts")}><span>All courts</span><strong>{allCount}</strong></button>
          {statuses.map((status, index) => {
            const label = status === "Open play soon" ? "Open Play" : status;
            return <button key={status} className={`${accents[index]} ${filter === status ? "active" : ""}`} aria-pressed={filter === status} aria-label={`Show ${label}, ${countFor(status)} courts`} onClick={() => setFilter(status)}><span>{label}</span><strong>{countFor(status)}</strong></button>;
          })}
        </div>
      </section>
      <section className="live-courts-section">
        <div className="today-section-head"><div><h2>On the courts <span>{courts.length}</span></h2><p>The whole venue, at a glance.</p></div><span className={`today-live ${error ? "has-error" : ""}`} title={loaded && !error ? "Refreshes every 15 seconds" : undefined}><i />{error ? "Refresh interrupted" : loaded ? "Live updates" : "Connecting…"}</span></div>
        {error && <p className="today-error" role="alert">{error}{courts.length > 0 ? " Showing the last received court statuses." : " Retrying automatically."}</p>}
        <div className="live-court-grid">{visible.map(item => <CourtCard key={item.courtId} item={item} onAction={onCourtAction} />)}</div>
        {!loaded && <div className="today-empty">Loading your courts…</div>}
        {loaded && !error && visible.length === 0 && <div className="today-empty">{courts.length === 0 ? "No courts configured yet. Add your courts in Settings." : "No courts with this status right now."}</div>}
        <div className="court-grid-note"><Info size={13} />Hover a court for details, or tap its info icon.</div>
      </section>
      {loaded && !error && <section className="today-attention" aria-labelledby="today-attention-title"><div className="today-section-head"><div><h2 id="today-attention-title">Needs attention <span>{attention.length}</span></h2><p>Arrivals and active court alerts.</p></div></div>{attention.length === 0 ? <div className="today-clear"><span className="clear-dot" /><strong>No arrivals or overtime.</strong></div> : <div className="attention-list">{attention.map(item => <button className={`attention-row ${item.accent}`} key={item.courtId} onClick={() => onCourtAction(item)}><span className="attention-court"><i />{item.court}</span><span className="attention-detail"><strong>{item.customer ?? item.status}</strong><small>{item.status} · {item.meta}</small></span><span className="attention-time">{item.next}</span><span className="attention-action">{courtActionLabel(item)}<ArrowUpRight size={14} /></span></button>)}</div>}</section>}
      {relevantSessions.length > 0 && <section className="today-openplay" aria-labelledby="today-openplay-title"><div className="today-openplay-head"><UsersThree size={21} /><div><h2 id="today-openplay-title">Open Play today</h2><p>{relevantSessions.length} active or upcoming {relevantSessions.length === 1 ? "session" : "sessions"}</p></div></div><div className="today-openplay-list">{relevantSessions.map(session => <button className="today-openplay-row" key={session.id} onClick={() => onOpenPlaySession?.(session)} aria-label={`Manage ${session.name}`}><span className="openplay-session-name"><strong>{session.name}</strong><small>{session.status} · {session.courtsLabel} · {session.level}</small></span><span className="openplay-session-time"><small>{session.startMinute <= now.minute ? "Started" : "Starts"}</small><strong>{formatMinute(session.startMinute)} – {formatMinute(session.endMinute)}</strong></span><span className="openplay-session-capacity"><small>Registered</small><strong>{session.rosterCount} / {session.capacity}</strong></span><span className="openplay-session-waitlist"><small>Waitlist</small><strong>{session.waitlistCount}</strong></span><span className="openplay-session-action">Manage<ArrowUpRight size={14} /></span></button>)}</div></section>}
      {sessionError && <p className="today-error" role="status">Open Play could not refresh. Retrying automatically.</p>}
    </div>
  );
}
