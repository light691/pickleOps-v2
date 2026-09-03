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
import { SideNav, Header } from './shell.tsx';

const openPlaySessions = [
  { id: 'OP-1048', name: 'Afternoon Open Play', date: 'Today', time: '2:00–4:00 PM', start: '14:00', court: 'Court 4', level: 'All levels', spots: 9, capacity: 12, waitlist: 0, fee: '₱250', paid: 8, status: 'Registration open', kind: 'pink' },
  { id: 'OP-1051', name: 'Friday Beginner Rally', date: 'Tomorrow', time: '6:00–8:00 PM', start: '18:00', court: 'Courts 2 & 3', level: 'Beginner', spots: 16, capacity: 16, waitlist: 3, fee: '₱300', paid: 15, status: 'Full', kind: 'gold' },
  { id: 'OP-1057', name: 'Weekend Competitive Play', date: 'Sat, Sep 6', time: '9:00–11:00 AM', start: '09:00', court: 'Courts 1 & 2', level: 'Intermediate+', spots: 12, capacity: 20, waitlist: 0, fee: '₱350', paid: 10, status: 'Registration open', kind: 'lavender' },
];

function StatusPill({ children, kind = '' }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

function CalendarView({ onNewBooking }) {
  const times = ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];
  const bookings = [
    { court: 0, row: 1, span: 2, name: 'Miguel Santos', state: 'confirmed' },
    { court: 1, row: 2, span: 2, name: 'Bea Reyes', state: 'playing' },
    { court: 2, row: 0, span: 2, name: 'Team Dink Manila', state: 'held' },
    { court: 3, row: 4, span: 2, name: 'Open Play · 9/12 spots', state: 'openplay', label: 'Shared session' },
    { court: 4, row: 3, span: 1, name: 'Carlo Mendoza', state: 'confirmed' },
  ];

  return (
    <section className="page-panel calendar-page">
      <div className="page-title">
        <div>
          <h1>Court calendar</h1>
          <p>Thursday, September 4 · 8:00 AM–10:00 PM</p>
        </div>
        <button className="primary-button" onClick={onNewBooking}>
          <Plus size={17} /> New booking
        </button>
      </div>
      <div className="calendar-controls">
        <button>Today</button>
        <button>‹</button>
        <button>›</button>
        <span>Sep 4, 2026</span>
        <button>
          <Funnel size={15} /> All courts
        </button>
      </div>
      <div className="schedule">
        <div className="schedule-head">
          <span></span>
          {['Court 1', 'Court 2', 'Court 3', 'Court 4', 'Court 5', 'Court 6'].map((c) => (
            <strong key={c}>{c}</strong>
          ))}
        </div>
        <div className="schedule-body">
          {times.map((t) => (
            <div className="time-label" key={t}>
              {t}
            </div>
          ))}
          {Array.from({ length: 42 }).map((_, i) => (
            <button aria-label="Create booking in time slot" className="schedule-cell" onClick={onNewBooking} key={i}></button>
          ))}
          {bookings.map((b, i) => (
            <button
              key={i}
              className={`booking-block ${b.state}`}
              style={{ gridColumn: b.court + 2, gridRow: `${b.row + 1} / span ${b.span}` }}
            >
              <strong>{b.name}</strong>
              <small>{b.label || b.state}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function OpenPlayView({ onNewSession, onManageSession }) {
  const [selectedId, setSelectedId] = useState(openPlaySessions[0].id);
  const [extraPlayer, setExtraPlayer] = useState(false);
  const selected = openPlaySessions.find((session) => session.id === selectedId) || openPlaySessions[0];
  const registered = selected.spots + (selected.id === openPlaySessions[0].id && extraPlayer ? 1 : 0);
  const roster = ['Bea Reyes', 'Miguel Santos', 'Lara Lim', 'Paolo Tan', 'Nica Ramos', 'Andre Cruz'];

  return (
    <section className="page-panel openplay-page">
      <div className="page-title">
        <div>
          <h1>Open Play</h1>
          <p>Shared sessions, player capacity, attendance, and payments.</p>
        </div>
        <button className="primary-button" onClick={() => onNewSession(null)}><Plus size={17} /> New Open Play</button>
      </div>
      <div className="openplay-summary">
        <div><span>Upcoming sessions</span><strong>3</strong></div>
        <div><span>Registered players</span><strong>37</strong></div>
        <div><span>Waitlisted</span><strong>3</strong></div>
        <div><span>Payments due</span><strong>4</strong></div>
      </div>
      <div className="openplay-layout">
        <div className="session-list">
          <div className="list-heading"><h2>Upcoming sessions</h2><button><Funnel size={15} /> All sessions</button></div>
          {openPlaySessions.map((session) => (
            <button key={session.id} className={selectedId === session.id ? 'session-row selected' : 'session-row'} onClick={() => setSelectedId(session.id)}>
              <div className="session-date"><strong>{session.date}</strong><span>{session.time}</span></div>
              <div className="session-main"><div><h3>{session.name}</h3><StatusPill kind={session.kind}>{session.status}</StatusPill></div><p>{session.court} · {session.level} · {session.fee} per player</p></div>
              <div className="session-capacity"><strong>{session.spots}/{session.capacity}</strong><span>{session.waitlist ? `${session.waitlist} waitlisted` : 'spots filled'}</span><progress value={session.spots} max={session.capacity}></progress></div>
            </button>
          ))}
        </div>
        <aside className="roster-panel">
          <div className="roster-head"><div><span>{selected.id}</span><h2>{selected.name}</h2><p>{selected.date} · {selected.time}</p></div><button className="icon-button" aria-label="More session options"><DotsThree size={20} /></button></div>
          <div className="capacity-card"><div><span>Registered</span><strong>{registered} / {selected.capacity}</strong></div><progress value={registered} max={selected.capacity}></progress><small>{Math.max(selected.capacity - registered, 0)} spots available · {selected.paid + (extraPlayer ? 1 : 0)} paid</small></div>
          <div className="roster-title"><h3>Player list</h3><span>{registered} players</span></div>
          <div className="roster-list">{roster.slice(0, Math.min(registered, 6)).map((name, index) => <div key={name}><span className="avatar lilac">{name.split(' ').map((part) => part[0]).join('')}</span><p><strong>{name}</strong><small>{index === 2 ? 'Payment due' : 'Paid'}</small></p><StatusPill kind={index === 2 ? 'gold' : 'mint'}>{index === 2 ? 'Due' : 'Paid'}</StatusPill></div>)}</div>
          <button className="secondary-button full-button" onClick={() => setExtraPlayer(true)} disabled={extraPlayer || registered >= selected.capacity}><UserPlus size={16} /> {extraPlayer ? 'Walk-in player added' : 'Add walk-in player'}</button>
          <button className="primary-button full-button" onClick={() => onManageSession(selected)}>Manage session</button>
        </aside>
      </div>
    </section>
  );
}

function OpenPlayDrawer({ open, session, onClose }) {
  const [saved, setSaved] = useState(false);
  if (!open) return null;
  const editing = Boolean(session);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head"><div><span>{editing ? 'OPEN PLAY SESSION' : 'NEW OPEN PLAY'}</span><h2>{editing ? 'Manage session' : 'Create shared session'}</h2></div><button onClick={onClose}><X size={20} /></button></div>
        {saved ? (
          <div className="success-state"><span><Check size={28} weight="bold" /></span><h2>{editing ? 'Session updated' : 'Open Play created'}</h2><p>{editing ? `${session.name} has been updated.` : 'The session is ready to accept player registrations.'}</p><button className="primary-button" onClick={onClose}>Back to Open Play</button></div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
            <label>Session name<input required defaultValue={session?.name || ''} placeholder="e.g. Friday Beginner Rally" /></label>
            <div className="field-row"><label>Date<input type="date" defaultValue="2026-09-04" /></label><label>Start time<input type="time" defaultValue={session?.start || '18:00'} /></label></div>
            <div className="field-row"><label>Duration<select defaultValue="2 hours"><option>1 hour</option><option>1.5 hours</option><option>2 hours</option><option>3 hours</option></select></label><label>Court<select defaultValue={session?.court || 'Court 1'}>{['Court 1','Court 2','Court 3','Court 4','Court 5','Court 6','Courts 1 & 2','Courts 2 & 3'].map((court) => <option key={court}>{court}</option>)}</select></label></div>
            <div className="field-row"><label>Player level<select defaultValue={session?.level || 'All levels'}><option>All levels</option><option>Beginner</option><option>Intermediate</option><option>Intermediate+</option><option>Advanced</option></select></label><label>Capacity<input type="number" min="2" defaultValue={session?.capacity || 12} /></label></div>
            <div className="field-row"><label>Fee per player<input defaultValue={session?.fee?.replace('₱','') || '250'} /></label><label>Registration closes<select><option>At session start</option><option>1 hour before</option><option>3 hours before</option><option>1 day before</option></select></label></div>
            <label>Notes<textarea defaultValue={editing ? 'Players rotate every game. Venue provides balls.' : ''} placeholder="Rotation format, equipment, or player instructions..." /></label>
            <div className="drawer-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">{editing ? 'Save changes' : 'Create Open Play'}</button></div>
          </form>
        )}
      </aside>
    </div>
  );
}

function PaymentsView() {
  const [verified, setVerified] = useState(false);
  return (
    <section className="page-panel">
      <div className="page-title">
        <div>
          <h1>Payment verification</h1>
          <p>{verified ? 'Ana Cruz’s payment was verified by staff.' : '3 submissions need staff review.'}</p>
        </div>
        {verified && <StatusPill kind="mint">Verified</StatusPill>}
      </div>
      <div className="payments-layout">
        <div className="payment-list">
          {['Ana Cruz', 'Team Dink Manila', 'Lara Lim'].map((n, i) => (
            <button className={i === 0 ? 'selected' : ''} key={n}>
              <div className="avatar coral">{n.split(' ').map((x) => x[0]).join('').slice(0, 2)}</div>
              <div>
                <strong>{n}</strong>
                <span>{i === 1 ? 'Maya' : 'GCash'} · ₱{i === 2 ? '500' : '650'}</span>
              </div>
              <StatusPill kind={i === 0 && verified ? 'mint' : 'pink'}>{i === 0 && verified ? 'Verified' : 'Review'}</StatusPill>
            </button>
          ))}
        </div>
        <div className="payment-detail">
          <div className="receipt">
            <CurrencyCircleDollar size={36} />
            <strong>GCash payment screenshot</strong>
            <span>Uploaded 1:06 PM</span>
          </div>
          <div className="detail-grid">
            <span>
              Expected<strong>₱650.00</strong>
            </span>
            <span>
              Submitted<strong>₱650.00</strong>
            </span>
            <span>
              Payer<strong>ANA M CRUZ</strong>
            </span>
            <span>
              Reference<strong>8472 0051 9032</strong>
            </span>
          </div>
          <label>
            Staff notes
            <textarea placeholder="Add verification notes..." />
          </label>
          <div className="payment-actions">
            <button className="secondary-button">Request clearer copy</button>
            <button className="primary-button" onClick={() => setVerified(true)} disabled={verified}>
              <Check size={16} /> {verified ? 'Verified by Paolo' : 'Verify by staff'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const reportData = {
  Today: { utilization: '78%', booked: '39 hrs', played: '34.5 hrs', revenue: '₱18,750', note: 'Compared with last Thursday', delta: '+8%', courts: [84, 81, 79, 76, 74, 72], outcomes: [24, 3, 2, 1], mix: [48, 27, 17, 8] },
  '7 days': { utilization: '72%', booked: '214 hrs', played: '196 hrs', revenue: '₱111,400', note: 'Compared with the previous 7 days', delta: '+4%', courts: [79, 76, 74, 72, 68, 64], outcomes: [138, 12, 9, 5], mix: [45, 29, 18, 8] },
  '30 days': { utilization: '69%', booked: '871 hrs', played: '802 hrs', revenue: '₱438,250', note: 'Compared with the previous 30 days', delta: '+6%', courts: [75, 73, 71, 69, 65, 61], outcomes: [562, 51, 34, 18], mix: [42, 31, 19, 8] },
};

function ReportsView() {
  const [range, setRange] = useState('7 days');
  const data = reportData[range];
  const times = ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'];
  const heat = [[1,1,2,2,1,2,3],[1,2,3,2,2,3,3],[1,2,2,1,3,3,2],[0,1,2,2,3,2,2],[1,1,1,2,2,3,2],[0,1,2,2,2,3,2]];

  return (
    <section className="page-panel reports-page">
      <div className="page-title reports-title">
        <div><h1>Venue reports</h1><p>See how courts, bookings, and collections are performing.</p></div>
        <div className="range-switch" aria-label="Report period">
          {Object.keys(reportData).map((item) => <button key={item} className={range === item ? 'active' : ''} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}
        </div>
      </div>
      <div className="report-metrics">
        <article><span>Court utilization</span><strong>{data.utilization}</strong><small className="positive">{data.delta} vs prior period</small></article>
        <article><span>Booked court time</span><strong>{data.booked}</strong><small>Includes 18 open play hours</small></article>
        <article><span>Actual played time</span><strong>{data.played}</strong><small>92% of booked time</small></article>
        <article><span>Collected revenue</span><strong>{data.revenue}</strong><small>₱6,300 still pending</small></article>
      </div>
      <div className="report-grid">
        <article className="report-card utilization-card">
          <div className="report-card-head"><div><h2>Utilization by court</h2><p>Played hours ÷ available court hours</p></div><span>{data.note}</span></div>
          <div className="court-performance">{data.courts.map((value, index) => <div key={index}><strong>Court {index + 1}</strong><progress value={value} max="100" aria-label={`Court ${index + 1} utilization ${value}%`} /><span>{value}%</span></div>)}</div>
        </article>
        <article className="report-card outcomes-card">
          <div className="report-card-head"><div><h2>Booking outcomes</h2><p>What happened after a reservation</p></div></div>
          {['Played', 'Rescheduled', 'Cancelled', 'No-show'].map((label, index) => <div className="outcome-row" key={label}><span><i className={`outcome-dot outcome-${index}`} />{label}</span><strong>{data.outcomes[index]}</strong></div>)}
          <div className="report-callout"><span>Completion rate</span><strong>92%</strong><small>3 points above last period</small></div>
        </article>
        <article className="report-card heatmap-card">
          <div className="report-card-head"><div><h2>Busiest court hours</h2><p>Average utilization by time of day</p></div><span>Mon–Sun</span></div>
          <div className="heatmap" role="table" aria-label="Court utilization by time">
            <div className="heatmap-row heatmap-labels"><span />{times.map((time) => <span key={time}>{time}</span>)}</div>
            {heat.map((row, index) => <div className="heatmap-row" key={index}><strong>C{index + 1}</strong>{row.map((level, cell) => <span key={cell} className={`heat-${level}`} title={`Court ${index + 1}, ${times[cell]}`} />)}</div>)}
          </div>
          <div className="heat-legend"><span>Quieter</span><i className="heat-0" /><i className="heat-1" /><i className="heat-2" /><i className="heat-3" /><span>Busier</span></div>
        </article>
        <article className="report-card payment-mix-card">
          <div className="report-card-head"><div><h2>Payment mix</h2><p>Share of collected revenue</p></div></div>
          {['GCash', 'Maya', 'Cash', 'Bank transfer'].map((label, index) => <div className="mix-row" key={label}><div><span>{label}</span><strong>{data.mix[index]}%</strong></div><progress value={data.mix[index]} max="100" aria-label={`${label} ${data.mix[index]}%`} /></div>)}
        </article>
      </div>
    </section>
  );
}

function SettingsView() {
  const [tab, setTab] = useState('Venue');
  const [saved, setSaved] = useState(false);
  const [staffAdded, setStaffAdded] = useState(false);
  const tabs = ['Venue', 'Courts & rates', 'Payments', 'Staff'];
  return (
    <section className="page-panel settings-page">
      <div className="page-title"><div><h1>Settings</h1><p>Manage the venue setup used by bookings and staff.</p></div>{saved && <span className="saved-message"><Check size={13} weight="bold" /> Changes saved</span>}</div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">{tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setSaved(false); }}>{item}<span>›</span></button>)}</nav>
        <form className="settings-form" onChange={() => setSaved(false)} onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
          {tab === 'Venue' && <>
            <div className="settings-section-head"><h2>Venue details</h2><p>Shown on booking confirmations and staff records.</p></div>
            <div className="settings-fields two"><label>Venue name<input defaultValue="RallyPoint Quezon City" /></label><label>Contact number<input defaultValue="0917 842 6081" /></label></div>
            <label>Address<input defaultValue="24 Scout Borromeo St., Quezon City" /></label>
            <div className="settings-fields two"><label>Timezone<select defaultValue="Asia/Manila"><option>Asia/Manila</option></select></label><label>Booking interval<select defaultValue="30 minutes"><option>30 minutes</option><option>1 hour</option></select></label></div>
            <div className="settings-divider" />
            <div className="settings-section-head"><h2>Operating hours</h2><p>Courts can only be reserved inside these hours.</p></div>
            <div className="hours-list">{['Monday–Friday','Saturday','Sunday'].map((day, index) => <div key={day}><strong>{day}</strong><label><input type="checkbox" defaultChecked /> Open</label><input aria-label={`${day} opening time`} type="time" defaultValue={index ? '07:00' : '08:00'} /><span>to</span><input aria-label={`${day} closing time`} type="time" defaultValue="22:00" /></div>)}</div>
          </>}
          {tab === 'Courts & rates' && <>
            <div className="settings-section-head"><h2>Courts & rates</h2><p>Set the standard hourly fee and booking availability.</p></div>
            <div className="court-settings-head"><span>Court</span><span>Hourly rate</span><span>Bookable</span></div>
            <div className="court-settings-list">{[650,650,650,650,700,700].map((rate, index) => <div key={index}><div><i className={`court-color court-color-${index}`} /><strong>Court {index + 1}</strong></div><label><span>₱</span><input aria-label={`Court ${index + 1} hourly rate`} defaultValue={rate} /></label><input aria-label={`Court ${index + 1} bookable`} type="checkbox" defaultChecked /></div>)}</div>
            <div className="settings-note"><strong>Open Play pricing is managed per session.</strong><span>Shared-session fees do not change these private court rates.</span></div>
          </>}
          {tab === 'Payments' && <>
            <div className="settings-section-head"><h2>Accepted payment methods</h2><p>Staff can record and verify these methods.</p></div>
            <div className="method-list">{[['GCash','0917 842 6081 · RallyPoint QC'],['Maya','0917 842 6081 · RallyPoint QC'],['Bank transfer','BDO · •••• 1842'],['Cash','Collected at the front desk']].map(([name, detail]) => <label key={name}><input type="checkbox" defaultChecked /><span><strong>{name}</strong><small>{detail}</small></span><button type="button">Edit</button></label>)}</div>
            <div className="settings-divider" />
            <div className="settings-section-head"><h2>Payment rules</h2><p>Applied when staff create or review a booking.</p></div>
            <div className="settings-fields two"><label>Default payment status<select defaultValue="Awaiting payment"><option>Awaiting payment</option><option>Paid</option></select></label><label>Hold unpaid booking for<select defaultValue="15 minutes"><option>15 minutes</option><option>30 minutes</option><option>1 hour</option></select></label></div>
          </>}
          {tab === 'Staff' && <>
            <div className="settings-section-head staff-heading"><div><h2>Staff access</h2><p>People who can manage this venue.</p></div><button type="button" className="secondary-button" onClick={() => setStaffAdded(true)}><UserPlus size={14} />{staffAdded ? 'Invite sent' : 'Invite staff'}</button></div>
            <div className="staff-settings-list">{[['PG','Paolo Garcia','Attendant','coral'],['MV','Mia Villanueva','Manager','lilac'],...(staffAdded ? [['JR','Jose Ramos','Invited','coral']] : [])].map(([initials,name,role,color]) => <div key={name}><div className={`avatar ${color}`}>{initials}</div><span><strong>{name}</strong><small>{role}</small></span><select aria-label={`${name} role`} defaultValue={role === 'Invited' ? 'Attendant' : role}><option>Attendant</option><option>Manager</option></select><button type="button"><DotsThree size={18} /></button></div>)}</div>
            <div className="settings-note"><strong>Managers can edit settings and reports.</strong><span>Attendants can manage bookings, payments, and Open Play.</span></div>
          </>}
          <div className="settings-actions"><span>{saved ? 'All changes are up to date.' : 'Review changes before saving.'}</span><button className="primary-button" type="submit"><Check size={14} /> Save changes</button></div>
        </form>
      </div>
    </section>
  );
}

export function App() {
  const [active, setActive] = useState(() => new URLSearchParams(window.location.search).get('view') || 'Today');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [openPlayOpen, setOpenPlayOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);

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
      <TodayBoard onCourtAction={handleCourtAction} />
    ) : active === 'Calendar' ? (
      <CalendarView onNewBooking={() => openBooking(null)} />
    ) : active === 'Open Play' ? (
      <OpenPlayView onNewSession={openOpenPlay} onManageSession={openOpenPlay} />
    ) : active === 'Payments' ? (
      <PaymentsView />
    ) : active === 'Reports' ? (
      <ReportsView />
    ) : active === 'Settings' ? (
      <SettingsView />
    ) : (
      <TodayBoard onCourtAction={handleCourtAction} />
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
      />
    </div>
  );
}
