import { useEffect, useState, type FormEvent, type JSX } from "react";
import { Check, DotsThree, UserPlus } from "@phosphor-icons/react";
import { ApiError, parseStaffPayload } from "../api.ts";
import "./settings.css";
import {
  createCourt,
  fetchCourts,
  fetchMeRole,
  fetchSettings,
  fetchStaff,
  fromPesos,
  fromTimeInput,
  inviteStaff,
  patchCourt,
  patchStaff,
  saveSettings,
  toPesos,
  toTimeInput,
  type CourtPayload,
  type SettingsPaymentMethod,
  type SettingsUpdateInput,
  type StaffRole,
  type VenueSettingsPayload,
  type VenueStaffEntry,
} from "./settingsApi.ts";

const TABS = ["Venue", "Courts & rates", "Payments", "Staff"] as const;

type SettingsTab = (typeof TABS)[number];

const HOLD_OPTIONS = [5, 10, 15, 30, 60] as const;

const INTERVAL_OPTIONS = [15, 30, 60] as const;

function initials({ name }: { name: string }): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.slice(0, 1) ?? "";
  const second = parts[1]?.slice(0, 1) ?? "";
  return `${first}${second}`.toUpperCase();
}

function avatarColor({ name }: { name: string }): string {
  let total = 0;
  for (const char of name) total += char.charCodeAt(0);
  return total % 2 === 0 ? "lilac" : "coral";
}

function useStatus(): {
  error: string | null;
  setError: (value: string | null) => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
  saved: boolean;
  setSaved: (value: boolean) => void;
  fail: (error: unknown) => void;
} {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  return {
    error,
    setError,
    saving,
    setSaving,
    saved,
    setSaved,
    fail: (cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setSaving(false);
    },
  };
}

function VenueTab({
  initial,
  canEdit,
  onSaved,
}: {
  initial: VenueSettingsPayload;
  canEdit: boolean;
  onSaved: (next: VenueSettingsPayload) => void;
}): JSX.Element {
  const [name, setName] = useState(initial.name);
  const [contact, setContact] = useState(initial.contact ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [interval, setInterval] = useState(String(initial.bookingIntervalMinutes));
  const [open, setOpen] = useState(toTimeInput({ minute: initial.openMinute }));
  const [close, setClose] = useState(toTimeInput({ minute: initial.closeMinute }));
  const status = useStatus();

  async function submit({ event }: { event: FormEvent }): Promise<void> {
    event.preventDefault();
    status.setSaving(true);
    status.setError(null);
    const openMinute = fromTimeInput({ value: open });
    const closeMinute = fromTimeInput({ value: close });
    if (openMinute === null || closeMinute === null) {
      status.fail(new Error("Enter opening and closing times as HH:MM."));
      return;
    }
    const parsedInterval = Number(interval);
    if (parsedInterval !== 15 && parsedInterval !== 30 && parsedInterval !== 60) {
      status.fail(new Error("Booking interval must be 15, 30, or 60 minutes."));
      return;
    }
    const input: SettingsUpdateInput = {
      name: name.trim(),
      contact: contact.trim().length === 0 ? null : contact.trim(),
      address: address.trim().length === 0 ? null : address.trim(),
      bookingIntervalMinutes: parsedInterval,
      openMinute,
      closeMinute,
    };
    try {
      const next = await saveSettings({ input });
      onSaved(next);
      status.setSaved(true);
      status.setSaving(false);
    } catch (submitError) {
      status.fail(submitError);
    }
  }

  return (
    <form className="settings-form" onSubmit={(event) => void submit({ event })}>
      <div className="settings-section-head">
        <h2>Venue details</h2>
        <p>Shown on booking confirmations and staff records.</p>
      </div>
      <div className="settings-fields two">
        <label>
          Venue name
          <input value={name} disabled={!canEdit} onChange={(event) => { setName(event.target.value); status.setSaved(false); }} />
        </label>
        <label>
          Contact number
          <input value={contact} disabled={!canEdit} onChange={(event) => { setContact(event.target.value); status.setSaved(false); }} />
        </label>
      </div>
      <label>
        Address
        <input value={address} disabled={!canEdit} onChange={(event) => { setAddress(event.target.value); status.setSaved(false); }} />
      </label>
      <div className="settings-fields two">
        <label>
          Timezone
          <select value="Asia/Manila" disabled>
            <option>Asia/Manila</option>
          </select>
        </label>
        <label>
          Booking interval
          <select
            value={interval}
            disabled={!canEdit}
            onChange={(event) => { setInterval(event.target.value); status.setSaved(false); }}
          >
            {INTERVAL_OPTIONS.map((option) => (
              <option key={option} value={option}>{option} minutes</option>
            ))}
          </select>
        </label>
      </div>
      <div className="settings-divider" />
      <div className="settings-section-head">
        <h2>Operating hours</h2>
        <p>Courts can only be reserved inside these hours. One daily window applies to every day.</p>
      </div>
      <div className="hours-list">
        {["Monday–Friday", "Saturday", "Sunday"].map((day) => (
          <div key={day}>
            <strong>{day}</strong>
            <label>
              <input type="checkbox" checked readOnly aria-label={`${day} open`} /> Open
            </label>
            <input
              aria-label={`${day} opening time`}
              type="time"
              value={open}
              disabled={!canEdit}
              onChange={(event) => { setOpen(event.target.value); status.setSaved(false); }}
            />
            <span>to</span>
            <input
              aria-label={`${day} closing time`}
              type="time"
              value={close}
              disabled={!canEdit}
              onChange={(event) => { setClose(event.target.value); status.setSaved(false); }}
            />
          </div>
        ))}
      </div>
      {!canEdit && (
        <div className="settings-note">
          <strong>Only managers can edit venue settings.</strong>
          <span>Attendants can view this page but cannot save changes.</span>
        </div>
      )}
      {status.error !== null && <p className="settings-error">{status.error}</p>}
      <div className="settings-actions">
        <span>{status.saved ? "All changes are up to date." : "Review changes before saving."}</span>
        <button className="primary-button" type="submit" disabled={!canEdit || status.saving}>
          <Check size={14} /> {status.saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

interface CourtDraft {
  readonly id: number;
  readonly name: string;
  readonly rate: string;
  readonly bookable: boolean;
  readonly dirty: boolean;
}

function CourtsTab({
  initial,
  canEdit,
  onSaved,
}: {
  initial: readonly CourtPayload[];
  canEdit: boolean;
  onSaved: (next: readonly CourtPayload[]) => void;
}): JSX.Element {
  const [drafts, setDrafts] = useState<readonly CourtDraft[]>(() =>
    initial.map((court) => ({
      id: court.id as number,
      name: court.name,
      rate: toPesos({ value: court.hourlyRateCentavos }),
      bookable: court.bookable,
      dirty: false,
    })),
  );
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const status = useStatus();

  function editDraft({ id, rate, bookable }: { id: number; rate?: string; bookable?: boolean }): void {
    setDrafts((previous) =>
      previous.map((draft) =>
        draft.id === id
          ? { ...draft, rate: rate ?? draft.rate, bookable: bookable ?? draft.bookable, dirty: true }
          : draft,
      ),
    );
    status.setSaved(false);
  }

  async function submit({ event }: { event: FormEvent }): Promise<void> {
    event.preventDefault();
    status.setSaving(true);
    status.setError(null);
    try {
      const dirty = drafts.filter((draft) => draft.dirty);
      for (const draft of dirty) {
        const centavos = fromPesos({ value: draft.rate });
        if (centavos === null || centavos <= 0) {
          throw new Error(`Enter a valid hourly rate for ${draft.name}.`);
        }
        const original = initial.find((court) => (court.id as number) === draft.id);
        await patchCourt({
          id: original === undefined ? (() => { throw new Error(`Court ${draft.name} is no longer listed.`); })() : original.id,
          input: { hourlyRateCentavos: centavos, bookable: draft.bookable },
        });
      }
      const next = await fetchCourts();
      onSaved(next);
      setDrafts(
        next.map((court) => ({
          id: court.id as number,
          name: court.name,
          rate: toPesos({ value: court.hourlyRateCentavos }),
          bookable: court.bookable,
          dirty: false,
        })),
      );
      status.setSaved(true);
      status.setSaving(false);
    } catch (submitError) {
      status.fail(submitError);
    }
  }

  async function addCourt({ event }: { event: FormEvent }): Promise<void> {
    event.preventDefault();
    const centavos = fromPesos({ value: newRate });
    if (newName.trim().length === 0 || centavos === null || centavos <= 0) {
      status.setError("Enter a court name and a valid hourly rate.");
      return;
    }
    status.setSaving(true);
    status.setError(null);
    try {
      await createCourt({ input: { name: newName.trim(), hourlyRateCentavos: centavos, bookable: true } });
      const next = await fetchCourts();
      onSaved(next);
      setDrafts(
        next.map((court) => ({
          id: court.id as number,
          name: court.name,
          rate: toPesos({ value: court.hourlyRateCentavos }),
          bookable: court.bookable,
          dirty: false,
        })),
      );
      setNewName("");
      setNewRate("");
      status.setSaved(true);
      status.setSaving(false);
    } catch (addError) {
      status.fail(addError);
    }
  }

  return (
    <form className="settings-form" onSubmit={(event) => void submit({ event })}>
      <div className="settings-section-head">
        <h2>Courts & rates</h2>
        <p>Set the standard hourly fee and booking availability.</p>
      </div>
      <div className="court-settings-head">
        <span>Court</span>
        <span>Hourly rate</span>
        <span>Bookable</span>
      </div>
      <div className="court-settings-list">
        {drafts.map((draft, index) => (
          <div key={draft.id}>
            <div>
              <i className={`court-color court-color-${index % 6}`} />
              <strong>{draft.name}</strong>
            </div>
            <label>
              <span>₱</span>
              <input
                aria-label={`${draft.name} hourly rate`}
                value={draft.rate}
                disabled={!canEdit}
                inputMode="decimal"
                onChange={(event) => editDraft({ id: draft.id, rate: event.target.value })}
              />
            </label>
            <input
              aria-label={`${draft.name} bookable`}
              type="checkbox"
              checked={draft.bookable}
              disabled={!canEdit}
              onChange={(event) => editDraft({ id: draft.id, bookable: event.target.checked })}
            />
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="court-add-row">
          <input aria-label="New court name" placeholder="Court 7" value={newName} onChange={(event) => setNewName(event.target.value)} />
          <label>
            <span>₱</span>
            <input aria-label="New court hourly rate" placeholder="650" inputMode="decimal" value={newRate} onChange={(event) => setNewRate(event.target.value)} />
          </label>
          <button type="button" className="secondary-button" onClick={(event) => void addCourt({ event })}>
            Add court
          </button>
        </div>
      )}
      <div className="settings-note">
        <strong>Open Play pricing is managed per session.</strong>
        <span>Shared-session fees do not change these private court rates.</span>
      </div>
      {!canEdit && (
        <div className="settings-note">
          <strong>Only managers can edit rates.</strong>
          <span>Attendants see the current rates but cannot change them.</span>
        </div>
      )}
      {status.error !== null && <p className="settings-error">{status.error}</p>}
      <div className="settings-actions">
        <span>{status.saved ? "All changes are up to date." : "Review changes before saving."}</span>
        <button className="primary-button" type="submit" disabled={!canEdit || status.saving}>
          <Check size={14} /> {status.saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function PaymentsTab({
  initial,
  canEdit,
  onSaved,
}: {
  initial: VenueSettingsPayload;
  canEdit: boolean;
  onSaved: (next: VenueSettingsPayload) => void;
}): JSX.Element {
  const [methods, setMethods] = useState<readonly SettingsPaymentMethod[]>(initial.paymentMethods);
  const [details, setDetails] = useState(initial.paymentDetails ?? "");
  const [defaultStatus, setDefaultStatus] = useState(initial.defaultPaymentStatus);
  const [hold, setHold] = useState(String(initial.holdUnpaidMinutes));
  const [overtimeGrace, setOvertimeGrace] = useState(String(initial.overtimeGraceMinutes));
  const [overtimeMinimum, setOvertimeMinimum] = useState(String(initial.overtimeMinimumMinutes));
  const status = useStatus();

  function toggleMethod({ index, enabled }: { index: number; enabled: boolean }): void {
    setMethods((previous) =>
      previous.map((method, position) => (position === index ? { ...method, enabled } : method)),
    );
    status.setSaved(false);
  }

  function editDetail({ index, detail }: { index: number; detail: string }): void {
    setMethods((previous) =>
      previous.map((method, position) => (position === index ? { ...method, detail } : method)),
    );
    status.setSaved(false);
  }

  async function submit({ event }: { event: FormEvent }): Promise<void> {
    event.preventDefault();
    status.setSaving(true);
    status.setError(null);
    const holdMinutes = Number(hold);
    const graceMinutes = Number(overtimeGrace);
    const minimumMinutes = Number(overtimeMinimum);
    if (!Number.isSafeInteger(holdMinutes) || holdMinutes < 0 || holdMinutes > 240) {
      status.fail(new Error("Hold duration must be between 0 and 240 minutes."));
      return;
    }
    if (!Number.isSafeInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 60) {
      status.fail(new Error("Overtime grace must be between 0 and 60 minutes."));
      return;
    }
    if (!Number.isSafeInteger(minimumMinutes) || minimumMinutes < 0 || minimumMinutes > 120) {
      status.fail(new Error("Minimum overtime must be between 0 and 120 minutes."));
      return;
    }
    try {
      const next = await saveSettings({
        input: {
          paymentMethods: methods,
          paymentDetails: details.trim().length === 0 ? null : details.trim(),
          defaultPaymentStatus: defaultStatus,
          holdUnpaidMinutes: holdMinutes,
          overtimeGraceMinutes: graceMinutes,
          overtimeMinimumMinutes: minimumMinutes,
        },
      });
      onSaved(next);
      status.setSaved(true);
      status.setSaving(false);
    } catch (submitError) {
      status.fail(submitError);
    }
  }

  return (
    <form className="settings-form" onSubmit={(event) => void submit({ event })}>
      <div className="settings-section-head">
        <h2>Accepted payment methods</h2>
        <p>Staff can record and verify these methods.</p>
      </div>
      <div className="method-list">
        {methods.map((method, index) => (
          <label key={method.name}>
            <input
              type="checkbox"
              checked={method.enabled}
              disabled={!canEdit}
              onChange={(event) => toggleMethod({ index, enabled: event.target.checked })}
            />
            <span>
              <strong>{method.name}</strong>
              <small>{method.detail}</small>
            </span>
            <input
              aria-label={`${method.name} account details`}
              value={method.detail}
              disabled={!canEdit}
              onChange={(event) => editDetail({ index, detail: event.target.value })}
            />
          </label>
        ))}
      </div>
      <label>
        Account details shown to players
        <input
          value={details}
          disabled={!canEdit}
          placeholder="GCash · 0917 842 6081 · RallyPoint QC"
          onChange={(event) => { setDetails(event.target.value); status.setSaved(false); }}
        />
      </label>
      <div className="settings-divider" />
      <div className="settings-section-head">
        <h2>Payment rules</h2>
        <p>Applied when staff create or review a booking.</p>
      </div>
      <div className="settings-fields two">
        <label>
          Default payment status
          <select
            value={defaultStatus}
            disabled={!canEdit}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "Awaiting payment" || next === "In review" || next === "Verified" || next === "Rejected") {
                setDefaultStatus(next);
                status.setSaved(false);
              }
            }}
          >
            <option>Awaiting payment</option>
            <option>In review</option>
            <option>Verified</option>
            <option>Rejected</option>
          </select>
        </label>
        <label>
          Hold unpaid booking for
          <select value={hold} disabled={!canEdit} onChange={(event) => { setHold(event.target.value); status.setSaved(false); }}>
            {HOLD_OPTIONS.map((option) => (
              <option key={option} value={option}>{option} minutes</option>
            ))}
          </select>
        </label>
      </div>
      <div className="settings-section-head">
        <h2>Overtime rules</h2>
        <p>Grace and minimum billing applied when a session runs past its end time.</p>
      </div>
      <div className="settings-fields two">
        <label>
          Overtime grace (minutes)
          <input
            value={overtimeGrace}
            disabled={!canEdit}
            inputMode="numeric"
            onChange={(event) => { setOvertimeGrace(event.target.value); status.setSaved(false); }}
          />
        </label>
        <label>
          Minimum overtime billed (minutes)
          <input
            value={overtimeMinimum}
            disabled={!canEdit}
            inputMode="numeric"
            onChange={(event) => { setOvertimeMinimum(event.target.value); status.setSaved(false); }}
          />
        </label>
      </div>
      {!canEdit && (
        <div className="settings-note">
          <strong>Only managers can edit payment settings.</strong>
          <span>Attendants see the current methods but cannot change them.</span>
        </div>
      )}
      {status.error !== null && <p className="settings-error">{status.error}</p>}
      <div className="settings-actions">
        <span>{status.saved ? "All changes are up to date." : "Review changes before saving."}</span>
        <button className="primary-button" type="submit" disabled={!canEdit || status.saving}>
          <Check size={14} /> {status.saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function StaffTab({
  initial,
  canEdit,
  actorName,
  refresh,
}: {
  initial: readonly VenueStaffEntry[];
  canEdit: boolean;
  actorName: string | null;
  refresh: () => Promise<void>;
}): JSX.Element {
  const [inviteName, setInviteName] = useState("");
  const status = useStatus();

  async function invite({ event }: { event: FormEvent }): Promise<void> {
    event.preventDefault();
    if (inviteName.trim().length === 0) {
      status.setError("Enter a staff name to invite.");
      return;
    }
    status.setSaving(true);
    status.setError(null);
    try {
      await inviteStaff({ name: inviteName.trim() });
      setInviteName("");
      await refresh();
      status.setSaved(true);
      status.setSaving(false);
    } catch (inviteError) {
      status.fail(inviteError);
    }
  }

  async function changeRole({ id, role }: { id: VenueStaffEntry["id"]; role: StaffRole }): Promise<void> {
    status.setSaving(true);
    status.setError(null);
    try {
      await patchStaff({ id, input: { role } });
      await refresh();
      status.setSaving(false);
    } catch (roleError) {
      status.fail(roleError);
    }
  }

  async function toggleActive({ entry }: { entry: VenueStaffEntry }): Promise<void> {
    status.setSaving(true);
    status.setError(null);
    try {
      await patchStaff({ id: entry.id, input: { active: !entry.active } });
      await refresh();
      status.setSaving(false);
    } catch (toggleError) {
      status.fail(toggleError);
    }
  }

  return (
    <div className="settings-form">
      <div className="settings-section-head staff-heading">
        <div>
          <h2>Staff access</h2>
          <p>People who can manage this venue.</p>
        </div>
        {canEdit && (
          <form className="staff-invite-row" onSubmit={(event) => void invite({ event })}>
            <input
              aria-label="Invite staff name"
              placeholder="Staff name"
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
            />
            <button type="submit" className="secondary-button" disabled={status.saving}>
              <UserPlus size={14} /> Invite staff
            </button>
          </form>
        )}
      </div>
      <div className="staff-settings-list">
        {initial.map((entry) => (
          <div key={entry.id as number} className={entry.active ? "" : "inactive"}>
            <div className={`avatar ${avatarColor({ name: entry.name })}`}>{initials({ name: entry.name })}</div>
            <span>
              <strong>{entry.name}</strong>
              <small>{entry.active ? entry.role : `${entry.role} · Inactive`}</small>
            </span>
            {entry.role === "Invited" ? (
              <select
                aria-label={`${entry.name} role`}
                value="Invited"
                disabled={!canEdit}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "Attendant" || next === "Manager") {
                    void changeRole({ id: entry.id, role: next });
                  }
                }}
              >
                <option value="Invited">Invited</option>
                <option value="Attendant">Attendant</option>
                <option value="Manager">Manager</option>
              </select>
            ) : (
              <select
                aria-label={`${entry.name} role`}
                value={entry.role}
                disabled={!canEdit || entry.name === actorName}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "Attendant" || next === "Manager") {
                    void changeRole({ id: entry.id, role: next });
                  }
                }}
              >
                <option>Attendant</option>
                <option>Manager</option>
              </select>
            )}
            <button
              type="button"
              title={entry.active ? `Deactivate ${entry.name}` : `Reactivate ${entry.name}`}
              aria-label={entry.active ? `Deactivate ${entry.name}` : `Reactivate ${entry.name}`}
              disabled={!canEdit || entry.name === actorName}
              onClick={() => void toggleActive({ entry })}
            >
              <DotsThree size={18} />
            </button>
          </div>
        ))}
      </div>
      <div className="settings-note">
        <strong>Managers can edit settings and reports.</strong>
        <span>Attendants can manage bookings, payments, and Open Play.</span>
      </div>
      {status.error !== null && <p className="settings-error">{status.error}</p>}
      {status.saved && <p className="settings-saved-line">Invite sent. They appear as Invited until given a role.</p>}
    </div>
  );
}

export function SettingsView(): JSX.Element {
  const [tab, setTab] = useState<SettingsTab>("Venue");
  const [settings, setSettings] = useState<VenueSettingsPayload | null>(null);
  const [courts, setCourts] = useState<readonly CourtPayload[]>([]);
  const [staff, setStaff] = useState<readonly VenueStaffEntry[]>([]);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [actorName, setActorName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anySaved, setAnySaved] = useState(false);

  async function loadAll(): Promise<void> {
    try {
      const [nextSettings, nextCourts, nextStaff] = await Promise.all([fetchSettings(), fetchCourts(), fetchStaff()]);
      setSettings(nextSettings);
      setCourts(nextCourts);
      setStaff(nextStaff);
      setError(null);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load settings.");
      setLoaded(true);
    }
  }

  async function loadRole(): Promise<void> {
    try {
      setRole(await fetchMeRole());
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      const payload: unknown = await res.json();
      setActorName(parseStaffPayload(payload).staff.name);
    } catch {
      setRole(null);
    }
  }

  useEffect(() => {
    void loadAll();
    void loadRole();
  }, []);

  async function refreshStaff(): Promise<void> {
    try {
      setStaff(await fetchStaff());
    } catch (refreshError) {
      if (refreshError instanceof ApiError) {
        setError(refreshError.message);
      }
    }
  }

  const canEdit = role === "Manager";

  return (
    <section className="page-panel settings-page">
      <div className="page-title">
        <div>
          <h1>Settings</h1>
          <p>Manage the venue setup used by bookings and staff.</p>
        </div>
        {anySaved && (
          <span className="saved-message">
            <Check size={13} weight="bold" /> Changes saved
          </span>
        )}
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? "active" : ""}
              onClick={() => { setTab(item); setAnySaved(false); }}
            >
              {item}
              <span>›</span>
            </button>
          ))}
        </nav>
        {!loaded && <p className="settings-loading">Loading venue settings…</p>}
        {loaded && error !== null && settings === null && <p className="settings-error">{error}</p>}
        {loaded && settings !== null && tab === "Venue" && (
          <VenueTab
            key={`venue-${settings.name}-${settings.openMinute}-${settings.closeMinute}`}
            initial={settings}
            canEdit={canEdit}
            onSaved={(next) => { setSettings(next); setAnySaved(true); }}
          />
        )}
        {loaded && settings !== null && tab === "Courts & rates" && (
          <CourtsTab
            key={`courts-${courts.map((court) => `${court.id}-${court.hourlyRateCentavos}-${court.bookable}`).join("|")}`}
            initial={courts}
            canEdit={canEdit}
            onSaved={(next) => { setCourts(next); setAnySaved(true); }}
          />
        )}
        {loaded && settings !== null && tab === "Payments" && (
          <PaymentsTab
            key={`payments-${settings.paymentDetails}-${settings.holdUnpaidMinutes}-${settings.defaultPaymentStatus}`}
            initial={settings}
            canEdit={canEdit}
            onSaved={(next) => { setSettings(next); setAnySaved(true); }}
          />
        )}
        {loaded && settings !== null && tab === "Staff" && (
          <StaffTab initial={staff} canEdit={canEdit} actorName={actorName} refresh={refreshStaff} />
        )}
      </div>
    </section>
  );
}
