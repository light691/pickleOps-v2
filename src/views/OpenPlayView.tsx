import { useEffect, useState } from "react";
import { DotsThree, Funnel, Plus, UserPlus } from "@phosphor-icons/react";
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

function rosterSubline({ registration }: { registration: OpenPlayRegistration }): string {
  const payment = registration.paid ? "Paid" : "Payment due";
  if (registration.attendance === "present") return `${payment} · Present`;
  if (registration.attendance === "absent") return `${payment} · Absent`;
  return payment;
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
          <small>{rosterSubline({ registration })}</small>
        </p>
        <StatusPill kind={registration.paid ? "mint" : "gold"}>{registration.paid ? "Paid" : "Due"}</StatusPill>
      </div>
      <div className="roster-row-actions">
        {!registration.paid && (
          <button type="button" disabled={disabled} onClick={() => onPaid(registration)}>
            Mark paid
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={registration.attendance === "present"}
          className={registration.attendance === "present" ? "active" : undefined}
          onClick={() => onAttendance(registration, "present")}
        >
          Present
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={registration.attendance === "absent"}
          className={registration.attendance === "absent" ? "active" : undefined}
          onClick={() => onAttendance(registration, "absent")}
        >
          Absent
        </button>
      </div>
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

  async function loadSessions({ keepSelection }: { keepSelection: boolean }): Promise<readonly OpenPlaySession[]> {
    const listed = await listOpenPlaySessions({});
    setSessions(listed);
    const first = listed[0];
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
      const target = id ?? selectedId ?? (listed[0] === undefined ? null : (listed[0].id as number));
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
    void loadDetail({ id: selectedId }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load the roster.");
    });
  }, [selectedId]);

  const selected = sessions.find((session) => (session.id as number) === selectedId) ?? null;
  const registered = detail?.session.rosterCount ?? 0;
  const waitlisted = detail?.waitlist.length ?? 0;
  const totalRegistered = sessions.reduce((sum, session) => sum + session.rosterCount, 0);
  const totalWaitlisted = sessions.reduce((sum, session) => sum + session.waitlistCount, 0);
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
          <span>Upcoming sessions</span>
          <strong>{sessions.length}</strong>
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
          <span>Payments due</span>
          <strong>{dueCount}</strong>
        </div>
      </div>
      <div className="openplay-layout">
        <div className="session-list">
          <div className="list-heading">
            <h2>Upcoming sessions</h2>
            <button>
              <Funnel size={15} /> All sessions
            </button>
          </div>
          {!loaded && <p className="openplay-empty">Loading sessions…</p>}
          {loaded && sessions.length === 0 && <p className="openplay-empty">No open play sessions yet.</p>}
          {sessions.map((session) => (
            <button
              key={session.id as number}
              className={selectedId === (session.id as number) ? "session-row selected" : "session-row"}
              onClick={() => setSelectedId(session.id as number)}
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
                <button className="icon-button" aria-label="More session options">
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
                <progress value={registered} max={selected.capacity}></progress>
                <small>
                  {Math.max(selected.capacity - registered, 0)} spots available ·{" "}
                  {detail.roster.filter((registration) => registration.paid).length} paid
                </small>
              </div>
              <div className="roster-title">
                <h3>Player list</h3>
                <span>{registered} players</span>
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
                          <small>Position {registration.waitlistPosition ?? "–"}</small>
                        </p>
                        <StatusPill kind="gold">Waiting</StatusPill>
                      </div>
                    ))}
                  </div>
                  <button className="primary-button full-button" disabled={acting} onClick={() => void promoteNext()}>
                    Promote next player
                  </button>
                </>
              )}
              <form className="walkin-form" onSubmit={(event) => void addWalkIn({ event })}>
                <input
                  aria-label="Walk-in player name"
                  placeholder="Walk-in player name"
                  value={walkInName}
                  onChange={(event) => setWalkInName(event.target.value)}
                />
                <button className="secondary-button full-button" type="submit" disabled={acting || walkInName.trim().length === 0}>
                  <UserPlus size={16} /> Add walk-in player
                </button>
              </form>
              <button className="primary-button full-button" onClick={() => onManageSession(selected)}>
                Manage session
              </button>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
