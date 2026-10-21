import './design-lab.css'

const posterStyles = [
  ['MIDNIGHT / LIVE', '#10182f', '#7ea1ff'],
  ['NORTH / 03', '#dbe8e1', '#174d49'],
  ['AFTERGLOW', '#f1d1c2', '#d84e2e'],
]

function Poster({ label, background, accent }: { label: string; background: string; accent: string }) {
  return <div className="lab-poster" style={{ background }}><span style={{ color: accent }}>{label}</span><b style={{ color: accent }}>TICKET<br />RUSH</b><i style={{ background: accent }} /></div>
}

function LabSection({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section className="lab-section"><div className="lab-section__head"><div><span className="lab-kicker">RENDER / 01</span><h2>{title}</h2></div><p>{note}</p></div>{children}</section>
}

export function DesignLab() {
  return <div className="lab">
    <header className="lab-top"><div className="lab-brand">TicketRush<span>.</span></div><div className="lab-top__meta">Design system / clean slate <span>●</span> v1.0</div><button className="lab-button lab-button--dark">Preview live ↗</button></header>
    <div className="lab-intro"><span className="lab-kicker">A NEW TICKET EXPERIENCE</span><h1>Trust, made<br /><em>visible.</em></h1><p>Every state of TicketRush, rendered as one calm, premium system for high-pressure ticket drops.</p><div className="lab-intro__line"><span>12 core surfaces</span><span>Motion intensity / 6</span><span>Accessibility first</span></div></div>

    <LabSection title="Discovery / the front door" note="A spacious event-first home that makes the next action obvious and the price legible.">
      <div className="lab-hero"><div className="lab-hero__copy"><span className="lab-pill">ON SALE NOW</span><h3>RÜFÜS DU SOL</h3><p>Live at Parc Jean-Drapeau · Montréal</p><div className="lab-actions"><button className="lab-button lab-button--blue">Explore event ↗</button><button className="lab-button lab-button--ghost">How TicketRush works</button></div></div><Poster {...{ label: 'LIVE / 2026', background: '#11182e', accent: '#89a7ff' }} /></div>
      <div className="lab-grid">{posterStyles.map((p) => <article className="lab-card" key={p[0]}><Poster label={p[0]!} background={p[1]!} accent={p[2]!} /><div className="lab-card__info"><span>FRI · 14 AUG</span><strong>{p[0] === 'AFTERGLOW' ? 'Afterglow Assembly' : p[0] === 'NORTH / 03' ? 'North / 03' : 'RÜFÜS DU SOL'}</strong><small>Montréal · From $96</small></div></article>)}</div>
    </LabSection>

    <LabSection title="The purchase path" note="The system stays composed from event detail to held seats, payment, and the final ticket.">
      <div className="lab-flow"><div className="lab-event-detail"><Poster label="EVENT DETAIL" background="#e7efff" accent="#1648d8" /><div><span className="lab-kicker">FRIDAY · AUG 14</span><h3>RÜFÜS DU SOL</h3><p>Parc Jean-Drapeau · Montréal</p><button className="lab-button lab-button--blue">Choose seats</button></div></div><div className="lab-queue"><span className="lab-pill lab-pill--green">YOU ARE IN</span><strong>142</strong><span>your place in line</span><div className="lab-progress"><i /></div><small>Estimated entry · 2 minutes</small></div><div className="lab-checkout"><div className="lab-checkout__top"><span>YOUR ORDER</span><b>02:48</b></div><div className="lab-seat-row"><span>Section A · Row 4 · Seat 12</span><b>$103.20</b></div><div className="lab-seat-row"><span>Section A · Row 4 · Seat 13</span><b>$103.20</b></div><div className="lab-total"><span>Total</span><strong>$206.40</strong></div><button className="lab-button lab-button--blue">Pay securely</button><small>▣ Encrypted checkout · Stripe test mode</small></div></div>
    </LabSection>

    <LabSection title="Seats / clarity under pressure" note="Live availability, clear selection, and a persistent summary that never gets lost.">
      <div className="lab-seats"><div className="lab-map"><span className="lab-stage">STAGE</span>{Array.from({ length: 42 }, (_, i) => <i key={i} className={i % 9 === 0 ? 'is-taken' : i === 13 || i === 14 ? 'is-selected' : ''}>{i + 1}</i>)}</div><aside><span className="lab-kicker">YOUR SELECTION</span><h3>2 seats</h3><p>Section A · Row 4</p><div className="lab-total"><span>All-in total</span><strong>$206.40</strong></div><button className="lab-button lab-button--blue">Continue</button><div className="lab-legend"><span><i className="is-selected" /> Selected</span><span><i /> Available</span><span><i className="is-taken" /> Taken</span></div></aside></div>
    </LabSection>

    <LabSection title="Account / trust signals" note="Authentication and transactional feedback feel quiet, direct, and safe.">
      <div className="lab-account-grid"><div className="lab-auth"><span className="lab-kicker">WELCOME BACK</span><h3>Sign in to your tickets.</h3><label>Email address<input value="you@example.com" readOnly /></label><label>Password<input value="••••••••••••" readOnly /></label><button className="lab-button lab-button--blue">Continue securely</button><a>Forgot password?</a><small>🔒 Your session is protected with encrypted transport.</small></div><div className="lab-toast"><span className="lab-toast__icon">✓</span><div><strong>Payment confirmed</strong><p>Your tickets are ready in My tickets. A receipt is on its way to you.</p></div><button>×</button></div><div className="lab-error"><span className="lab-toast__icon">!</span><div><strong>We could not load the events</strong><p>This is not something you did. Your place in line and held seats are safe.</p><button className="lab-button lab-button--ghost">Try again</button></div></div></div>
    </LabSection>

    <LabSection title="Organizer / the control room" note="A calmer operating view for the people making the event happen.">
      <div className="lab-console"><div className="lab-console__nav"><b>TicketRush<span>.</span></b><span>Events</span><span className="active">Overview</span><span>Scanner</span><span>Settings</span></div><div className="lab-console__body"><div className="lab-console__title"><div><span className="lab-kicker">FRIDAY · AUG 14</span><h3>RÜFÜS DU SOL</h3></div><button className="lab-button lab-button--dark">Manage event</button></div><div className="lab-metrics"><div><span>Gross sales</span><strong>$84,220</strong><small>+12.4% this week</small></div><div><span>Tickets sold</span><strong>812 / 1,000</strong><small>81.2% capacity</small></div><div><span>At the door</span><strong>248</strong><small>Live now</small></div></div><div className="lab-bars"><span>Sales velocity <b>Last 7 days</b></span>{[42, 58, 48, 76, 64, 88, 72, 96, 82, 100, 92, 108].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div></div></div>
    </LabSection>

    <LabSection title="Tickets / after the rush" note="The purchase ends with a beautiful, useful object—not a confirmation page that disappears.">
      <div className="lab-ticket-grid"><article className="lab-ticket"><div className="lab-ticket__top"><span>ADMIT ONE · 01</span><span>QR READY</span></div><div className="lab-ticket__title"><span>RÜFÜS DU SOL</span><strong>LIVE</strong></div><div className="lab-ticket__meta"><div><small>DATE</small><b>FRI · AUG 14, 2026</b></div><div><small>VENUE</small><b>PARC JEAN-DRAPEAU</b></div><div><small>SEAT</small><b>SECTION A · ROW 4 · 12</b></div></div><div className="lab-ticket__code"><div className="lab-qr">▦</div><span>Scan at the door<br />Order #TR-2048</span></div></article><div className="lab-side-panel"><span className="lab-kicker">MY TICKETS</span><h3>Ready when<br />you are.</h3><p>Two tickets · RÜFÜS DU SOL · Montréal</p><button className="lab-button lab-button--blue">Open tickets</button><button className="lab-button lab-button--ghost">Download receipt</button></div></div>
    </LabSection>

    <LabSection title="Account / a personal archive" note="Your account is a quiet place to manage identity, orders, and the details that matter.">
      <div className="lab-account-page"><aside className="lab-account-nav"><div className="lab-avatar">KS</div><strong>Kanwal Singh</strong><span>kanwal@example.com</span><a className="active">Overview</a><a>Orders & tickets</a><a>Profile & security</a><a>Privacy</a><button className="lab-button lab-button--ghost">Sign out</button></aside><div className="lab-account-content"><span className="lab-kicker">ACCOUNT OVERVIEW</span><h3>Your next moments.</h3><div className="lab-account-cards"><div><span>UPCOMING</span><strong>01</strong><small>event in your calendar</small></div><div><span>ORDERS</span><strong>04</strong><small>completed purchases</small></div><div><span>SECURITY</span><strong>Good</strong><small>password & sessions protected</small></div></div><div className="lab-order"><div><span>FRI · AUG 14</span><strong>RÜFÜS DU SOL</strong><small>2 tickets · $206.40</small></div><button className="lab-button lab-button--ghost">View order</button></div></div></div>
    </LabSection>

    <LabSection title="Organizer / make the moment" note="Event creation is editorial, preview-led, and clear about what goes live.">
      <div className="lab-form-screen"><div className="lab-form-main"><div className="lab-form-heading"><div><span className="lab-kicker">NEW EVENT</span><h3>Make something<br />people remember.</h3></div><span className="lab-draft">DRAFT · SAVED</span></div><div className="lab-form-fields"><label>Event title<input value="RÜFÜS DU SOL" readOnly /></label><label>Artist or host<input value="RÜFÜS DU SOL" readOnly /></label><label>Venue<select value="Parc Jean-Drapeau · Montréal" onChange={() => {}}><option>Parc Jean-Drapeau · Montréal</option></select></label><div className="lab-form-two"><label>Date<input value="Aug 14, 2026" readOnly /></label><label>Doors open<input value="19:00" readOnly /></label></div></div><div className="lab-form-actions"><button className="lab-button lab-button--ghost">Save draft</button><button className="lab-button lab-button--blue">Review & publish</button></div></div><div className="lab-form-preview"><span className="lab-kicker">LIVE PREVIEW</span><Poster label="RÜFÜS / 2026" background="#11182e" accent="#89a7ff" /><strong>RÜFÜS DU SOL</strong><small>Parc Jean-Drapeau · Montréal</small></div></div>
    </LabSection>

    <LabSection title="Scanner / door-ready" note="Fast, legible, and designed for a phone in one hand and a line at the door.">
      <div className="lab-scanner"><div className="lab-scanner__top"><span>DOOR SCANNER</span><span className="lab-live-dot">● LIVE</span></div><div className="lab-scan-window"><div className="lab-scan-corners">⌜　　⌝<br /><br />⌞　　⌟</div><span>Point camera at a ticket QR</span></div><div className="lab-scan-success"><span className="lab-toast__icon">✓</span><div><strong>Admit guest</strong><p>RÜFÜS DU SOL · Section A · Row 4 · Seat 12</p></div><button className="lab-button lab-button--blue">Confirm entry</button></div></div>
    </LabSection>

    <LabSection title="Quiet states / designed, too" note="Loading, empty, offline, and not-found states keep their composure and explain what happens next.">
      <div className="lab-state-grid"><div className="lab-state lab-state--loading"><span className="lab-skeleton lab-skeleton--wide" /><span className="lab-skeleton" /><span className="lab-skeleton lab-skeleton--short" /><small>Loading the next drop…</small></div><div className="lab-state lab-state--empty"><div className="lab-empty-orbit">✦</div><h3>No tickets yet.</h3><p>Your next great night will show up here.</p><button className="lab-button lab-button--blue">Discover events</button></div><div className="lab-state lab-state--offline"><span className="lab-pill">OFFLINE MODE</span><h3>You’re still safe.</h3><p>Your place in line and held seats are stored locally while you reconnect.</p><button className="lab-button lab-button--ghost">Try connection</button></div></div>
    </LabSection>

    <footer className="lab-footer"><strong>TicketRush<span>.</span></strong><span>Every state accounted for.</span><button className="lab-button lab-button--ghost">View motion principles ↗</button></footer>
  </div>
}
