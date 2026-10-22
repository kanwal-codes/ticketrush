import { useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import './journey-prototype.css'

type Step = 'discover' | 'event' | 'queue' | 'seats' | 'checkout' | 'confirmed'
type EventId = 'aurora' | 'blue-room' | 'afterglow'

const events = {
  aurora: {
    name: 'Aurora / Live', category: 'Electronic', date: 'August 14, 2027', shortDate: '14 AUG', time: '7:00 PM',
    venue: 'Parc Jean-Drapeau', city: 'Montréal', price: 103.20,
    image: 'festival', accent: '#553b90', accentDark: '#34235c', tint: '#f0ecf7',
    description: 'An open-air night of immersive electronic music, built for the moment the lights come up.',
  },
  'blue-room': {
    name: 'Blue Room Sessions', category: 'Jazz', date: 'August 22, 2027', shortDate: '22 AUG', time: '8:30 PM',
    venue: 'Harbourfront Centre', city: 'Toronto', price: 72.76,
    image: 'jazz', accent: '#8a5a1f', accentDark: '#5e3d18', tint: '#f7f1e8',
    description: 'A close-up evening of live jazz, intimate performances and the kind of room that listens.',
  },
  afterglow: {
    name: 'Afterglow', category: 'Dance', date: 'September 5, 2027', shortDate: '05 SEP', time: '7:30 PM',
    venue: 'Place Bell', city: 'Laval', price: 58.05,
    image: 'dance', accent: '#24598a', accentDark: '#183f65', tint: '#eaf2f8',
    description: 'Contemporary movement and dramatic light in an evening shaped to stay with you.',
  },
} as const

const steps: Step[] = ['discover', 'event', 'queue', 'seats', 'checkout', 'confirmed']
const occupied = new Set([2, 5, 7, 11, 16, 20, 22, 27, 35, 38, 43, 47])
const money = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)

export function JourneyPrototype() {
  const [params, setParams] = useSearchParams()
  const requestedEvent = params.get('event')
  const eventId = (requestedEvent && requestedEvent in events ? requestedEvent : 'aurora') as EventId
  const rawStep = params.get('step')
  const requestedStep: Step = steps.includes(rawStep as Step) ? rawStep as Step : 'discover'
  const event = events[eventId]
  const selected = (params.get('seats') ?? '').split(',').map(Number).filter((seat, index, all) => Number.isInteger(seat) && seat >= 1 && seat <= 48 && !occupied.has(seat) && all.indexOf(seat) === index).slice(0, 6)
  const step: Step = (requestedStep === 'checkout' || requestedStep === 'confirmed') && !selected.length ? 'seats' : requestedStep
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(false)
  const themed = step !== 'discover'
  const theme = themed ? {
    '--jp-accent': event.accent, '--jp-accent-dark': event.accentDark, '--jp-tint': event.tint,
  } as CSSProperties : undefined

  function go(next: Step, id: EventId = eventId) {
    setParams(next === 'discover' ? {} : { event: id, step: next, ...(id === eventId && selected.length ? { seats: selected.join(',') } : {}) })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function openEvent(id: EventId) {
    setEmailError(false)
    setParams({ event: id, step: 'event' })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function toggleSeat(seat: number) {
    if (occupied.has(seat)) return
    const next = selected.includes(seat) ? selected.filter(item => item !== seat) : selected.length < 6 ? [...selected, seat].sort((a, b) => a - b) : selected
    setParams({ event: eventId, step: 'seats', ...(next.length ? { seats: next.join(',') } : {}) }, { replace: true })
  }
  function checkout() {
    if (!selected.length) return
    go('checkout')
  }
  function confirm() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setEmailError(true); document.getElementById('jp-email')?.focus(); return }
    setEmailError(false)
    go('confirmed')
  }

  return <div className={`jp ${themed ? 'jp--themed' : 'jp--neutral'}`} style={theme}>
    <a className="jp-skip" href="#jp-main">Skip to main content</a>
    <div className="jp-demo"><span>INTERACTIVE DESIGN PROTOTYPE</span><span>Sample events and simulated purchase. No payment is taken.</span><Link to="/design-lab/discover">View static renders ↗</Link></div>
    <header className="jp-header"><button className="jp-brand" onClick={() => go('discover')} aria-label="TicketRush, go to discovery">ticket<span>rush</span><i>.</i></button><nav aria-label="Prototype navigation"><button onClick={() => go('discover')}>Discover</button><button onClick={() => go('confirmed')} disabled={step !== 'confirmed'}>My tickets</button></nav><span className="jp-header__right">{themed ? event.category : 'Find your next night'}</span></header>
    <div id="jp-main" tabIndex={-1}>

    {step === 'discover' && <main className="jp-discover" key="discover">
      <section className="jp-discover__intro"><div><p className="jp-kicker">LIVE EVENTS</p><h1>Find your<br />next night.</h1><p>Music, performances, and nights worth going out for.</p></div><div className="jp-discover__note"><span>01</span><p>Choose an event to see how its poster shapes every screen that follows.</p></div></section>
      <div className="jp-discover__heading"><h2>Worth going out for</h2><span>THREE VISUAL DIRECTIONS</span></div>
      <div className="jp-event-grid">{(Object.entries(events) as [EventId, typeof events[EventId]][]).map(([id, item]) => <button className="jp-event-card" key={id} onClick={() => openEvent(id)} aria-label={`Explore ${item.name}`}><span className={`jp-photo jp-photo--${item.image}`} role="img" aria-label={`${item.category} event artwork`} /><span className="jp-event-card__body"><span className="jp-event-card__meta">{item.shortDate} / {item.city.toUpperCase()}</span><strong>{item.name}</strong><span>{item.venue}</span><b>From {money(item.price)} total <span aria-hidden="true">↗</span></b></span></button>)}</div>
      <p className="jp-discover__foot">Sample event images and prices are for design exploration only.</p>
    </main>}

    {themed && <div className="jp-progress" aria-label="Purchase journey"><button onClick={() => go('event')}>Event</button><span/><button onClick={() => go('seats')} disabled={step === 'queue'}>Seats</button><span/><button onClick={() => selected.length && go('checkout')} disabled={!selected.length}>Checkout</button><span/><b>{step === 'confirmed' ? 'Confirmed' : 'Your night'}</b></div>}
    {themed && <div className="jp-theme-switch"><span>COMPARE POSTER THEMES</span><div>{(Object.entries(events) as [EventId, typeof events[EventId]][]).map(([id, item]) => <button key={id} type="button" onClick={() => id !== eventId && openEvent(id)} aria-pressed={eventId === id}><i className={`jp-photo jp-photo--${item.image}`} aria-hidden="true" /><span>{item.name}</span></button>)}</div></div>}

    {step === 'event' && <main className="jp-event jp-stage" key={`${eventId}-event`}><div className="jp-event__image"><div className={`jp-photo jp-photo--${event.image}`} role="img" aria-label={`${event.category} event artwork`} /></div><div className="jp-event__content"><button className="jp-back" onClick={() => go('discover')}>← All events</button><p className="jp-kicker">{event.category.toUpperCase()} / {event.city.toUpperCase()}</p><h1>{event.name}</h1><p className="jp-event__description">{event.description}</p><div className="jp-event__facts"><div><small>WHEN</small><strong>{event.date}<br />{event.time}</strong></div><div><small>WHERE</small><strong>{event.venue}<br />{event.city}</strong></div></div><div className="jp-event__action"><div><small>STARTING AT</small><strong>{money(event.price)}</strong><span>Per ticket</span></div><button className="jp-primary" onClick={() => go('queue')}>Find tickets <span aria-hidden="true">↗</span></button></div><p className="jp-underaction">You will review seats and the final total before the demo checkout.</p></div></main>}

    {step === 'queue' && <main className="jp-queue jp-stage" key={`${eventId}-queue`}><div className="jp-queue__art"><div className={`jp-photo jp-photo--${event.image}`} /></div><div className="jp-queue__copy"><p className="jp-kicker">{event.name.toUpperCase()}</p><h1>Make room for<br />the moment.</h1><p>This is a preview of the waiting-room transition. No live queue or seat hold is active.</p><div className="jp-queue__status">Preview ready. Choose seats when you are.</div><button className="jp-primary" onClick={() => go('seats')}>Continue to seats <span aria-hidden="true">→</span></button></div></main>}

    {step === 'seats' && <main className="jp-seats jp-stage" key={`${eventId}-seats`}><div className="jp-section-head"><button className="jp-back" onClick={() => go('event')}>← Event details</button><p className="jp-kicker">{event.name.toUpperCase()} / SELECT SEATS</p><h1>Choose your place.</h1><p>Try selecting up to six seats. The price updates immediately.</p></div><div className="jp-seats__layout"><section className="jp-seatmap"><div className="jp-seatmap__top"><strong>SECTION A</strong><div className="jp-seatmap__legend"><span><i/>Available</span><span><i/>Selected</span><span><i/>Unavailable</span></div></div><div className="jp-seatmap__stage">STAGE</div><div className="jp-seatmap__grid">{Array.from({ length: 48 }, (_, index) => { const seat = index + 1; const unavailable = occupied.has(seat); const active = selected.includes(seat); return <button key={seat} disabled={unavailable} className={active ? 'is-selected' : ''} aria-label={`Row ${Math.ceil(seat / 8)}, seat ${seat}${unavailable ? ', unavailable' : active ? ', selected' : ''}`} aria-pressed={active} onClick={() => toggleSeat(seat)}>{seat}</button> })}</div><p>Front of section at the top. Seating diagram for concept only.</p></section><aside className="jp-summary"><p className="jp-kicker">YOUR SELECTION</p><h2>{selected.length ? `${selected.length} ${selected.length === 1 ? 'seat' : 'seats'}` : 'Your seats'}</h2><p>{selected.length ? `Section A, ${selected.map(seat => `seat ${seat}`).join(', ')}` : 'Select a seat on the map to see your total.'}</p><div className="jp-summary__rows"><div><span>Tickets</span><strong>{money(selected.length * event.price)}</strong></div><div><span>Fees</span><strong>Included</strong></div></div><div className="jp-summary__total"><span>Total today</span><strong>{money(selected.length * event.price)}</strong></div><button className="jp-primary" onClick={checkout} disabled={!selected.length}>Review order <span aria-hidden="true">→</span></button><small>No seats are actually reserved in this prototype.</small></aside></div></main>}

    {step === 'checkout' && <main className="jp-checkout jp-stage" key={`${eventId}-checkout`}><div className="jp-section-head"><button className="jp-back" onClick={() => go('seats')}>← Change seats</button><p className="jp-kicker">REVIEW YOUR ORDER</p><h1>Everything, in full view.</h1><p>Check the event, seats and total before completing this simulated purchase.</p></div><div className="jp-checkout__layout"><section className="jp-checkout__form"><h2>Contact</h2><label htmlFor="jp-email">Email for your tickets</label><input id="jp-email" type="email" autoComplete="email" value={email} aria-invalid={emailError} aria-describedby={emailError ? 'jp-email-error' : undefined} onChange={e => { setEmail(e.target.value); setEmailError(false) }} placeholder="you@example.com" />{emailError && <p id="jp-email-error" className="jp-error">Enter a valid email address to continue.</p>}<p>This is a design demo. We do not send an email or save this address.</p><div className="jp-payment-note"><strong>Payment preview</strong><span>No card details are collected here. Completing the demo only shows the confirmation design.</span></div><button className="jp-primary" onClick={confirm}>Complete demo purchase <span aria-hidden="true">→</span></button></section><aside className="jp-order"><div className={`jp-order__image jp-photo jp-photo--${event.image}`} /><div className="jp-order__body"><p className="jp-kicker">ORDER SUMMARY</p><h2>{event.name}</h2><p>{event.date}, {event.time}<br />{event.venue}, {event.city}</p><div className="jp-summary__rows"><div><span>Section A</span><strong>{selected.length} {selected.length === 1 ? 'seat' : 'seats'}</strong></div><div><span>Seat numbers</span><strong>{selected.join(', ')}</strong></div><div><span>Tickets and fees</span><strong>{money(selected.length * event.price)}</strong></div></div><div className="jp-summary__total"><span>Total today</span><strong>{money(selected.length * event.price)}</strong></div></div></aside></div></main>}

    {step === 'confirmed' && <main className="jp-confirmed jp-stage" key={`${eventId}-confirmed`}><div className="jp-confirmed__copy"><span className="jp-confirmed__mark" aria-hidden="true">✓</span><p className="jp-kicker">DEMO PURCHASE COMPLETE</p><h1>The night is yours.</h1><p>Here is how your confirmation could look. No real ticket was issued or payment taken.</p><div className="jp-confirmed__actions"><button className="jp-primary" onClick={() => go('discover')}>Explore more events <span aria-hidden="true">↗</span></button><button className="jp-secondary" onClick={() => go('event')}>View event</button></div></div><div className="jp-confirmed__ticket"><div className={`jp-photo jp-photo--${event.image}`} /><div><span>DESIGN PREVIEW / NOT VALID FOR ENTRY</span><h2>{event.name}</h2><p>{event.date} at {event.time}<br />{event.venue}, {event.city}</p><strong>{selected.length} {selected.length === 1 ? 'seat' : 'seats'} / Section A</strong><small>{selected.map(seat => `Seat ${seat}`).join('  /  ')}</small></div></div></main>}
    </div>
  </div>
}
