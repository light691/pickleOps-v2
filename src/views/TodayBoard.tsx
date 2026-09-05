import { useEffect, useId, useState } from "react";
import { ArrowUpRight, Clock, Info, TennisBall, UsersThree } from "@phosphor-icons/react";
import { fetchToday } from "../api.ts";
import { listOpenPlaySessions } from "./openplayApi.ts";
import type { TodayCourtCard } from "../../shared/types.ts";
import type { OpenPlaySession } from "../../server/routes/openplayTypes.ts";
import "./today.css";

const statuses = ["Available", "In play", "Arriving soon", "Open play soon", "Overtime"] as const;
const accents = ["available", "playing", "arriving", "openplay", "overtime"];
function matchesStatus(item: TodayCourtCard, status: string) {
  return status === "Open play soon" ? item.accent === "openplay" : item.status === status;
}
function courtAction(item: TodayCourtCard) {
  return item.status === "Available" ? item.action : item.accent === "openplay" ? "Manage Open Play" : "View in Calendar";
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
      <div className="live-court-footer"><span><Clock size={14} />{timing}</span><button title={courtAction(item)} aria-label={`${courtAction(item)} — ${item.court}`} onClick={() => onAction(item)}><ArrowUpRight size={18} /></button></div>
      <div className="court-reveal" id={id} hidden={!revealed}>
        <span className="court-reveal-label">SESSION DETAILS</span>
        <strong>{item.customer ?? item.headline ?? item.status}</strong>
        <p>{item.meta}</p><p>{item.next}</p>
        <button onClick={() => onAction(item)}>{courtAction(item)}<ArrowUpRight size={15} /></button>
      </div>
    </article>
  );
}
export function TodayBoard({ onCourtAction, staffName }: { onCourtAction: (item: TodayCourtCard) => void; staffName: string }) {
  const [courts, setCourts] = useState<readonly TodayCourtCard[]>([]);
  const [sessions, setSessions] = useState<readonly OpenPlaySession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [filter, setFilter] = useState<string>("All courts");
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
  return (
    <div className="today-page">
      <header className="today-welcome"><div><span className="today-eyebrow">VENUE OVERVIEW</span><h1>Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, {staffName.split(" ")[0]}.</h1><p>A little less to manage. More room to play.</p></div><div className="today-date"><span>{new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long" })}</span><strong>{new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" })}</strong></div></header>
      <section className="today-summary" aria-label="Current court counts">{statuses.map((status, index) => <div className={accents[index]} key={status}><span><i />{status === "Open play soon" ? "Open Play" : status}</span><strong>{loaded && !error ? courts.filter(c => matchesStatus(c, status)).length : "—"}</strong></div>)}</section>
      <section className="live-courts-section">
        <div className="today-section-head"><div><h2>On the courts <span>{courts.length}</span></h2><p>The whole venue, at a glance.</p></div><span className={`today-live ${error ? "has-error" : ""}`}><i />{error ? "Refresh interrupted" : loaded ? "Live · refreshes every 15s" : "Connecting…"}</span></div>
        <div className="court-filters" aria-label="Filter courts">{["All courts", ...statuses].map(status => <button key={status} aria-pressed={filter === status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "Open play soon" ? "Open Play" : status}</button>)}</div>
        {error && <p className="today-error" role="alert">{error}{courts.length > 0 ? " Showing the last received court statuses." : " Retrying automatically."}</p>}
        <div className="live-court-grid">{visible.map(item => <CourtCard key={item.courtId} item={item} onAction={onCourtAction} />)}</div>
        {!loaded && <div className="today-empty">Loading your courts…</div>}
        {loaded && !error && visible.length === 0 && <div className="today-empty">{courts.length === 0 ? "No courts configured yet. Add your courts in Settings." : "No courts with this status right now."}</div>}
        <div className="court-grid-note"><Info size={13} />Hover a court for details, or tap its info icon.</div>
      </section>
      {loaded && !error && <section className="today-attention"><div className="today-section-head"><h2>Keep an eye on <span>{attention.length}</span></h2><span>Arrivals & attention</span></div>{attention.length === 0 ? <div className="today-clear"><span className="clear-dot" /><div><strong>You're all caught up</strong><p>No arrivals or court alerts need your attention right now.</p></div></div> : attention.map(item => <button className={`attention-row ${item.accent}`} key={item.courtId} onClick={() => onCourtAction(item)}><span className="attention-court"><i />{item.court}</span><span><strong>{item.customer ?? item.status}</strong><small>{item.status} · {item.meta}</small></span><span>{item.next}</span><ArrowUpRight size={16} /></button>)}</section>}
      {relevantSessions.length > 0 && <section className="today-openplay"><div className="today-openplay-title"><UsersThree size={23} /><div><h2>Open Play today</h2><p>{relevantSessions.length} active or upcoming {relevantSessions.length === 1 ? "session" : "sessions"}</p></div></div><div><span>{relevantSessions[0]!.startMinute <= now.minute ? "Started at" : "Next start"}</span><strong>{formatMinute(relevantSessions[0]!.startMinute)}</strong></div><div><span>Registered</span><strong>{relevantSessions.reduce((n,s) => n+s.rosterCount,0)} / {relevantSessions.reduce((n,s) => n+s.capacity,0)}</strong></div><div><span>Waitlisted</span><strong>{relevantSessions.reduce((n,s) => n+s.waitlistCount,0)}</strong></div></section>}
      {sessionError && <p className="today-error" role="status">Open Play could not refresh. Retrying automatically.</p>}
    </div>
  );
}
