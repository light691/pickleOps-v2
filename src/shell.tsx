import { useState } from "react";
import {
  Bell,
  CalendarBlank,
  CaretDown,
  ChartBar,
  CurrencyCircleDollar,
  CloudCheck,
  Gear,
  House,
  MagnifyingGlass,
  MapPin,
  Plus,
  SignOut,
  SlidersHorizontal,
  TennisBall,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";

import type { StaffMember } from "../shared/types.ts";

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
            onClick={() => setActive(label)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-section">
        <span>VENUE</span>
        <button className="venue-button">
          <MapPin size={17} />
          <span>Quezon City</span>
          <CaretDown size={13} />
        </button>
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

export function Header({ onCreate }: { onCreate: (type: string) => void }) {
  const [createOpen, setCreateOpen] = useState(false);

  const chooseCreate = (type: string) => {
    setCreateOpen(false);
    onCreate(type);
  };

  return (
    <header className="topbar">
      <label className="search">
        <MagnifyingGlass size={17} />
        <input aria-label="Search bookings" placeholder="Search customer or booking..." />
      </label>
      <div className="top-actions">
        <button className="connection-icon" aria-label="Connection status: online" title="Online">
          <CloudCheck size={19} weight="duotone" />
        </button>
        <button className="icon-button" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <button className="filter-button">
          <SlidersHorizontal size={16} /> Filters
        </button>
        <div className="create-menu-wrap">
          <button className="primary-button" aria-expanded={createOpen} onClick={() => setCreateOpen((value) => !value)}>
            <Plus size={17} weight="bold" /> New booking <CaretDown size={12} />
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
