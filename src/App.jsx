import { useState } from 'react';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import {
  Bell,
  CalendarBlank,
  CaretDown,
  ChartBar,
  Check,
  Clock,
  CloudCheck,
  CurrencyCircleDollar,
  DotsThree,
  Funnel,
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
  X,
} from '@phosphor-icons/react';
import { TodayBoard } from './views/TodayBoard.tsx';
import { BookingDrawer } from './drawers/BookingDrawer.tsx';
import { CalendarView } from './views/CalendarView.tsx';
import { OpenPlayView } from './views/OpenPlayView.tsx';
import { OpenPlayDrawer } from './drawers/OpenPlayDrawer.tsx';
import { PaymentsView } from './views/PaymentsView.tsx';
import { ReportsView } from './views/ReportsView.tsx';
import { SettingsView } from './views/SettingsView.tsx';
import { SideNav, Header } from './shell.tsx';

function StatusPill({ children, kind = '' }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

export function App() {
  const [active, setActive] = useState(() => new URLSearchParams(window.location.search).get('view') || 'Today');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [openPlayOpen, setOpenPlayOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);

  const openBooking = (item) => {
    setSelectedCourt(item || null);
    setDrawerOpen(true);
  };

  const handleCourtAction = (item) => {
    if (item.action.toLowerCase().includes('open play')) {
      setActive('Open Play');
      return;
    }
    if (item.action.toLowerCase().includes('payment')) {
      setActive('Payments');
      return;
    }
    openBooking(item);
  };

  const openOpenPlay = (session) => {
    setSelectedSession(session || null);
    setOpenPlayOpen(true);
  };

  const handleCreate = (type) => {
    if (type === 'openplay') {
      openOpenPlay(null);
      return;
    }
    openBooking(type === 'walkin' ? { court: 'Court 1', action: 'Add walk-in' } : null);
  };

  const content =
    active === 'Today' ? (
      <TodayBoard key={`today-${dataVersion}`} onCourtAction={handleCourtAction} />
    ) : active === 'Calendar' ? (
      <CalendarView key={`calendar-${dataVersion}`} onNewBooking={() => openBooking(null)} />
    ) : active === 'Open Play' ? (
      <OpenPlayView key={`openplay-${dataVersion}`} onNewSession={openOpenPlay} onManageSession={openOpenPlay} />
    ) : active === 'Payments' ? (
      <PaymentsView />
    ) : active === 'Reports' ? (
      <ReportsView />
    ) : active === 'Settings' ? (
      <SettingsView />
    ) : (
      <TodayBoard key={`today-${dataVersion}`} onCourtAction={handleCourtAction} />
    );

  return (
    <div className="app-shell">
      <SideNav active={active} setActive={setActive} />
      <main className="workspace">
        <Header onCreate={handleCreate} />
        <div className="content">{content}</div>
      </main>
      <BookingDrawer
        key={drawerOpen ? selectedCourt?.court || 'new' : 'closed'}
        open={drawerOpen}
        initialCourt={selectedCourt}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedCourt(null);
          setDataVersion((version) => version + 1);
        }}
      />
      <OpenPlayDrawer
        key={openPlayOpen ? selectedSession?.id || 'new-open-play' : 'closed-open-play'}
        open={openPlayOpen}
        session={selectedSession}
        onClose={() => {
          setOpenPlayOpen(false);
          setSelectedSession(null);
        }}
        onSaved={() => {
          setOpenPlayOpen(false);
          setSelectedSession(null);
          setDataVersion((version) => version + 1);
        }}
      />
    </div>
  );
}