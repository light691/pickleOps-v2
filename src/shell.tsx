import { useState } from "react";
import {
  CalendarBlank,
  CaretDown,
  ChartBar,
  CurrencyCircleDollar,
  CloudCheck,
  Gear,
  House,
  MapPin,
  Moon,
  Plus,
  SignOut,
  Sun,
  TennisBall,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";

import type { StaffMember } from "../shared/types.ts";
import type { ThemeMode } from "./theme.ts";

const nav: ReadonlyArray<readonly [string, typeof House]> = [
  ["Today", House],
  ["Calendar", CalendarBlank],
  ["Open Play", UsersThree],
  ["Payments", CurrencyCircleDollar],
  ["Reports", ChartBar],
  ["Settings", Gear],
];

function initials({ name }: { name: string }): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SideNav({
  active,
  setActive,
  staff,
  onLogout,
}: {
  active: string;
  setActive: (view: string) => void;
  staff: StaffMember;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <TennisBall weight="fill" />
        </span>
        <span>RallyPoint</span>
      </div>
      <nav>
        {nav.map(([label, Icon]) => (
          <button
            key={label}
            className={active === label ? "nav-item active" : "nav-item"}
            aria-current={active === label ? "page" : undefined}
            aria-label={label}
            title={label}
            onClick={() => setActive(label)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-section">
        <span>VENUE</span>
        <div className="venue-button">
          <MapPin size={17} />
          <span>Quezon City</span>
        </div>
      </div>
      <div className="staff-list">
        <span>ON SHIFT</span>
        <div className="staff">
          <div className={staff.role === "Manager" ? "avatar lilac" : "avatar coral"}>{initials({ name: staff.name })}</div>
          <div>
            <strong>{staff.name}</strong>
            <small>{staff.role}</small>
          </div>
        </div>
      </div>
      <button className="logout" onClick={onLogout}>
        <SignOut size={17} /> Log out
      </button>
    </aside>
  );
}

export function Header({
  active,
  onCreate,
  theme,
  onToggleTheme,
}: {
  active: string;
  onCreate: (type: string) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);

  const chooseCreate = (type: string) => {
    setCreateOpen(false);
    onCreate(type);
  };

  const light = theme === "light";
  const toggleLabel = light ? "Switch to dark mode" : "Switch to light mode";

  return (
    <header className="topbar">
      <div className="workspace-location"><span>Workspace</span><CaretDown size={11} className="breadcrumb-separator" /><strong>{active}</strong></div>
      <div className="top-actions">
        <button
          className="icon-button"
          type="button"
          aria-pressed={light}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={onToggleTheme}
        >
          {light ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="connection-icon" aria-label="Connection status: online" title="Online">
          <CloudCheck size={19} weight="duotone" />
        </button>
        <div className="create-menu-wrap" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setCreateOpen(false); }} onKeyDown={event => { if (event.key === "Escape") setCreateOpen(false); }}>
          <button className="primary-button" aria-expanded={createOpen} onClick={() => setCreateOpen((value) => !value)}>
            <Plus size={17} weight="bold" /> Create <CaretDown size={12} />
          </button>
          {createOpen && (
            <div className="create-menu">
              <button onClick={() => chooseCreate("booking")}><CalendarBlank size={17} /><span><strong>Court booking</strong><small>Reserve an entire court</small></span></button>
              <button onClick={() => chooseCreate("openplay")}><UsersThree size={17} /><span><strong>Open Play session</strong><small>Create a shared session</small></span></button>
              <button onClick={() => chooseCreate("walkin")}><UserPlus size={17} /><span><strong>Walk-in</strong><small>Start an available court</small></span></button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
