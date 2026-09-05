import { useEffect, useState } from "react";
import { DotsThree, Plus, UserPlus } from "@phosphor-icons/react";
import { openPlayStatusKind } from "../../server/routes/openplayTypes.ts";
import type {
  AttendanceMark,
  OpenPlayRegistration,
  OpenPlaySession,
  OpenPlaySessionDetail,
} from "../../server/routes/openplayTypes.ts";
import {
  addOpenPlayRegistration,
  getOpenPlayDetail,
  listOpenPlaySessions,
  patchOpenPlayRegistration,
  promoteOpenPlayWaitlist,
} from "./openplayApi.ts";
import "./openplay.css";

function StatusPill({ children, kind = "" }: { children: string; kind?: string }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

function isUpcoming(session: OpenPlaySession): boolean {
  return new Date(`${session.date}T00:00:00+08:00`).getTime() + session.endMinute * 60000 > Date.now();
}

function formatClock({ minute }: { minute: number }): string {
  const hour24 = Math.floor(minute / 60);
  const rest = minute % 60;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(rest).padStart(2, "0")} ${suffix}`;
}

function formatDateLabel({ date }: { date: string }): string {
  const parsed = new Date(`${date}T12:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function formatFee({ feeCentavos }: { feeCentavos: number }): string {
  return `₱${(feeCentavos as number) / 100}`;
}

function initials({ name }: { name: string }): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function RosterRow({
  registration,
  accent,
  onPaid,
  onAttendance,
  disabled,
}: {
  registration: OpenPlayRegistration;
  accent: string;
  onPaid: (registration: OpenPlayRegistration) => void;
  onAttendance: (registration: OpenPlayRegistration, mark: AttendanceMark) => void;
  disabled: boolean;
}) {
  return (
    <div className="openplay-roster-row">
      <div>
        <span className={`avatar ${accent}`}>{initials({ name: registration.playerName })}</span>
        <p>
          <strong>{registration.playerName}</strong>
        </p>
        {registration.paid ? <StatusPill kind="mint">Paid</StatusPill> : <button className="roster-payment" type="button" disabled={disabled} aria-label={`Mark ${registration.playerName} paid`} onClick={() => onPaid(registration)}>Mark paid</button>}
      </div>
      <select className="roster-attendance" aria-label={`Attendance for ${registration.playerName}`} value={registration.attendance ?? ""} disabled={disabled} onChange={event => { if (event.target.value === "present" || event.target.value === "absent") onAttendance(registration, event.target.value); }}>
        <option value="" disabled>Not marked</option><option value="present">Present</option><option value="absent">Absent</option>
      </select>
    </div>
  );
}

export function OpenPlayView({
  onNewSession,
  onManageSession,
}: {
  onNewSession: (session: OpenPlaySession | null) => void;
  onManageSession: (session: OpenPlaySession) => void;
}) {
  const [sessions, setSessions] = useState<readonly OpenPlaySession[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OpenPlaySessionDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [acting, setActing] = useState(false);
  const [sessionFilter, setSessionFilter] = useState("Upcoming");

  async function loadSessions({ keepSelection }: { keepSelection: boolean }): Promise<readonly OpenPlaySession[]> {
    const listed = (await listOpenPlaySessions({})).sort((a,b) => Number(isUpcoming(b)) - Number(isUpcoming(a)) || a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
    setSessions(listed);
    const first = listed.find(session => sessionFilter === "All" || isUpcoming(session) === (sessionFilter === "Upcoming"));
    if (!keepSelection || selectedId === null || !listed.some((session) => (session.id as number) === selectedId)) {
      setSelectedId(first === undefined ? null : (first.id as number));
    }
    return listed;
  }

  async function loadDetail({ id }: { id: number }): Promise<void> {
    setDetail(await getOpenPlayDetail({ id }));
  }

  async function refresh({ id }: { id: number | null }): Promise<void> {
    try {
      setError(null);
      const listed = await loadSessions({ keepSelection: true });
      const first = listed.find(session => sessionFilter === "All" || isUpcoming(session) === (sessionFilter === "Upcoming"));
      const target = id ?? selectedId ?? (first?.id ?? null);
      if (target !== null) await loadDetail({ id: target });
      else setDetail(null);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load open play.");
      setLoaded(true);
    }
  }

  useEffect(() => {
    void refresh({ id: null });
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    void getOpenPlayDetail({ id: selectedId }).then(result => { if (!cancelled) setDetail(result); }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load the roster.");
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  const visibleSessions = sessions.filter(session => sessionFilter === "All" || isUpcoming(session) === (sessionFilter === "Upcoming"));
  const selected = visibleSessions.find((session) => (session.id as number) === selectedId) ?? null;
  const registered = detail?.session.rosterCount ?? 0;
  const waitlisted = detail?.waitlist.length ?? 0;
  const totalRegistered = visibleSessions.reduce((sum, session) => sum + session.rosterCount, 0);
  const totalWaitlisted = visibleSessions.reduce((sum, session) => sum + session.waitlistCount, 0);
  const dueCount = (detail?.roster.filter((registration) => !registration.paid).length ?? 0) +
    (detail?.waitlist.filter((registration) => !registration.paid).length ?? 0);

  async function addWalkIn({ event }: { event: React.FormEvent }): Promise<void> {
    event.preventDefault();
    if (selectedId === null || walkInName.trim().length === 0) return;
    setActing(true);
    try {
      await addOpenPlayRegistration({ sessionId: selectedId, playerName: walkInName.trim(), mobile: null });
      setWalkInName("");
      await refresh({ id: selectedId });
    } catch (walkInError) {
      setError(walkInError instanceof Error ? walkInError.message : "Could not add the walk-in player.");
    } finally {
      setActing(false);
    }
  }

  async function promoteNext(): Promise<void> {
    if (selectedId === null) return;
    setActing(true);
    try {
      await promoteOpenPlayWaitlist({ sessionId: selectedId });
      await refresh({ id: selectedId });
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : "Could not promote the waitlist.");
    } finally {
      setActing(false);
    }
  }

  async function markPaid({ registration }: { registration: OpenPlayRegistration }): Promise<void> {
    setActing(true);
    try {
      await patchOpenPlayRegistration({ id: registration.id as number, paid: true });
      await refresh({ id: selectedId });
    } catch (paidError) {
      setError(paidError instanceof Error ? paidError.message : "Could not mark the player as paid.");
    } finally {
      setActing(false);
    }
  }

  async function markAttendance({
    registration,
    mark,
  }: {
    registration: OpenPlayRegistration;
    mark: AttendanceMark;
  }): Promise<void> {
    setActing(true);
    try {
      await patchOpenPlayRegistration({ id: registration.id as number, attendance: mark });
      await refresh({ id: selectedId });
    } catch (attendanceError) {
      setError(attendanceError instanceof Error ? attendanceError.message : "Could not mark attendance.");
    } finally {
      setActing(false);
    }
  }

  return (
    <section className="page-panel openplay-page">
      <div className="page-title">
        <div>
          <h1>Open Play</h1>
          <p>Shared sessions, player capacity, attendance, and payments.</p>
        </div>
        <button className="primary-button" onClick={() => onNewSession(null)}>
          <Plus size={17} /> New Open Play
        </button>
      </div>
      {error !== null && (
        <p className="clash-banner" role="alert">
          {error}
        </p>
      )}
      <div className="openplay-summary">
        <div>
          <span>{sessionFilter} sessions</span>
          <strong>{visibleSessions.length}</strong>
        </div>
        <div>
          <span>Registered players</span>
          <strong>{totalRegistered}</strong>
        </div>
        <div>
          <span>Waitlisted</span>
          <strong>{totalWaitlisted}</strong>
        </div>
        <div>
          <span>Unpaid · selected session</span>
          <strong>{dueCount}</strong>
        </div>
      </div>
      <div className="openplay-layout">
        <div className="session-list">
          <div className="list-heading">
            <h2>Sessions</h2>
            <div className="session-tabs" aria-label="Session period">
              {["Upcoming", "Past", "All"].map(filter => <button key={filter} className={sessionFilter === filter ? "active" : ""} aria-pressed={sessionFilter === filter} onClick={() => {
                setSessionFilter(filter);
                const nextId = sessions.find(session => filter === "All" || isUpcoming(session) === (filter === "Upcoming"))?.id ?? null;
                if (nextId !== selectedId) setDetail(null);
                setSelectedId(nextId);
              }}>{filter}</button>)}
            </div>
          </div>
          <div className="session-scroll" role="region" aria-label="Sessions" tabIndex={0}>
          {!loaded && <p className="openplay-empty">Loading sessions…</p>}
          {loaded && visibleSessions.length === 0 && <p className="openplay-empty">No {sessionFilter === "All" ? "" : sessionFilter.toLowerCase()} sessions to show.</p>}
          {visibleSessions.map((session) => (
            <button
              key={session.id as number}
              className={selectedId === (session.id as number) ? "session-row selected" : "session-row"}
              onClick={() => { if (selectedId !== session.id) { setDetail(null); setSelectedId(session.id as number); } }}
            >
              <div className="session-date">
                <strong>{formatDateLabel({ date: session.date as string })}</strong>
                <span>
                  {formatClock({ minute: session.startMinute as number })}–
                  {formatClock({ minute: session.endMinute as number })}
                </span>
              </div>
              <div className="session-main">
                <div>
                  <h3>{session.name}</h3>
                  <StatusPill kind={openPlayStatusKind({ status: session.status })}>{session.status}</StatusPill>
                </div>
                <p>
                  {session.courtsLabel} · {session.level} · {formatFee({ feeCentavos: session.feeCentavos as number })} per
                  player
                </p>
              </div>
              <div className="session-capacity">
                <strong>
                  {session.rosterCount}/{session.capacity}
                </strong>
                <span>{session.waitlistCount > 0 ? `${session.waitlistCount} waitlisted` : "spots filled"}</span>
                <progress value={session.rosterCount} max={session.capacity}></progress>
              </div>
            </button>
          ))}
          </div>
        </div>
        <aside className="roster-panel">
          {selected === null || detail === null ? (
            <p className="openplay-empty">Pick a session to see its roster.</p>
          ) : (
            <>
              <div className="roster-head">
                <div>
                  <span>OP-{(selected.id as number).toString().padStart(4, "0")}</span>
                  <h2>{selected.name}</h2>
                  <p>
                    {formatDateLabel({ date: selected.date as string })} ·{" "}
                    {formatClock({ minute: selected.startMinute as number })}–
                    {formatClock({ minute: selected.endMinute as number })}
                  </p>
                </div>
                <button className="icon-button" aria-label="Edit session" onClick={() => onManageSession(selected)}>
                  <DotsThree size={20} />
                </button>
              </div>
              <div className="capacity-card">
                <div>
                  <span>Registered</span>
                  <strong>
                    {registered} / {selected.capacity}
                  </strong>
                </div>
                <small>
                  {Math.max(selected.capacity - registered, 0)} spots available ·{" "}
                  {detail.roster.filter((registration) => registration.paid).length} paid
                </small>
              </div>
              <div className="roster-scroll" role="region" aria-label="Players and waitlist" tabIndex={0} key={selected.id}>
              <div className="roster-title">
                <h3>Players</h3>
                <span>Payment · Attendance</span>
              </div>
              <div className="roster-list">
                {detail.roster.map((registration, index) => (
                  <RosterRow
                    key={registration.id as number}
                    registration={registration}
                    accent={index % 2 === 0 ? "lilac" : "coral"}
                    disabled={acting}
                    onPaid={(row) => void markPaid({ registration: row })}
                    onAttendance={(row, mark) => void markAttendance({ registration: row, mark })}
                  />
                ))}
                {detail.roster.length === 0 && <p className="openplay-empty">No players registered yet.</p>}
              </div>
              {waitlisted > 0 && (
                <>
                  <div className="roster-title">
                    <h3>Waitlist</h3>
                    <span>
                      {waitlisted} waiting
                    </span>
                  </div>
                  <div className="roster-list">
                    {detail.waitlist.map((registration) => (
                      <div key={registration.id as number}>
                        <span className="avatar">{registration.waitlistPosition ?? "–"}</span>
                        <p>
                          <strong>{registration.playerName}</strong>
                        </p>
                        <StatusPill kind="gold">Waiting</StatusPill>
                      </div>
                    ))}
                  </div>
                  <button className="primary-button full-button" disabled={acting || registered >= selected.capacity} title={registered >= selected.capacity ? "A roster spot must open before promoting a player" : undefined} onClick={() => void promoteNext()}>
                    Promote next player
                  </button>
                </>
              )}
              </div>
              <div className="roster-footer">
              <form className="walkin-form" onSubmit={(event) => void addWalkIn({ event })}>
                <input
                  aria-label="Walk-in player name"
                  placeholder="Walk-in player name"
                  value={walkInName}
                  onChange={(event) => setWalkInName(event.target.value)}
                />
                <button className="secondary-button full-button" type="submit" disabled={acting || walkInName.trim().length === 0}>
                  <UserPlus size={16} /> {registered >= selected.capacity ? "Join waitlist" : "Add player"}
                </button>
              </form>
              <button className="primary-button full-button" onClick={() => onManageSession(selected)}>
                Manage session
              </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
