import { BackBar } from '../../components/BackBar'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Notice } from '../../components/Notice'
import type { Tone } from '../../lib/errorCopy'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useEvent } from '../../api/queries'
import type { EventDetail, HoldView, OrderView } from '../../api/types'
import { NotFound } from '../../app/RouteError'
import { Field } from '../../components/Field'
import { CheckoutSkeleton } from '../../components/PageSkeletons'
import { digitsOnly, formatCardNumber, formatExpiry, TEST_CARDS, validateCard, type CardErrors } from '../../lib/card'
import { eventTheme } from '../../lib/eventTheme'
import { formatMoney } from '../../lib/money'
import { formatDate, formatTime, serverNow } from '../../lib/time'
import { useTitle } from '../../lib/useTitle'
import { useMe } from '../auth/api'
import { clearActiveHold } from '../seats/activeHold'
import { seatKeys, useMyHold } from '../seats/api'
import { HoldClock } from '../seats/HoldTimer'
import { checkOrder, submitPayment, type PaymentOutcome } from './pay'
import { checkoutTimings } from './timings'
import { describeSeats } from './summary'
import './checkout.css'

export function CheckoutPage() {
  const id = Number(useParams().id)
  return Number.isInteger(id) && id > 0 ? <Checkout id={id} /> : <NotFound />
}

function Checkout({ id }: { id: number }) {
  const event = useEvent(id)
  const hold = useMyHold(id)
  // Remember the hold this checkout started with. Once an order resolves (paid, refunded, expired) the server stops
  // returning the hold, and the page must keep explaining what happened instead of swapping to "no seats held".
  const [kept, setKept] = useState<HoldView | null>(null)
  if (hold.data && hold.data !== kept) setKept(hold.data)
  const current = hold.data ?? kept

  const failure = [event, hold].find((q) => q.error && q.data === undefined)?.error
  if (failure) throw failure
  if (!event.data || (hold.data === undefined && !kept)) return <CheckoutSkeleton />
  if (!current) return <NoHold event={event.data} />
  return <CheckoutBody event={event.data} hold={current} />
}

function NoHold({ event }: { event: EventDetail }) {
  useTitle(`Checkout · ${event.title}`)
  return (
    <div className="page checkout" style={eventTheme(event.poster)}>
      <h1>You have no seats held</h1>
      <p className="checkout__lead">Your hold may have ended, or you paid already. Choose your seats again to continue.</p>
      <p className="checkout__actions">
        <Link to={`/events/${event.id}/seats`} className="btn">
          Choose seats
        </Link>
        <Link to="/tickets">My tickets</Link>
      </p>
    </div>
  )
}

type View =
  | { step: 'form' }
  | { step: 'paying' }
  | { step: 'pending'; order: OrderView }
  | { step: 'refunded'; refunding: boolean }
  | { step: 'gone'; message: string }

function CheckoutBody({ event, hold }: { event: EventDetail; hold: HoldView }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useMe().data
  useTitle(`Checkout · ${event.title}`)

  const [view, setView] = useState<View>({ step: 'form' })
  const [message, setMessageText] = useState('')
  const [tone, setTone] = useState<Tone>('error')
  const setMessage = (text: string, next: Tone = 'error') => {
    setMessageText(text)
    setTone(next)
  }
  const [retrySafely, setRetrySafely] = useState(false)
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '' })
  const [errors, setErrors] = useState<CardErrors>({})

  /** Acts on what the server said about the payment. */
  const apply = useCallback(
    (outcome: PaymentOutcome) => {
    switch (outcome.kind) {
      case 'paid':
        clearActiveHold()
        void queryClient.invalidateQueries({ queryKey: ['tickets'] })
        void queryClient.invalidateQueries({ queryKey: seatKeys.hold(event.id) })
        void queryClient.invalidateQueries({ queryKey: seatKeys.seats(event.id) })
        void navigate('/tickets', { replace: true, viewTransition: true, state: { paid: { reference: outcome.order.reference, totalCents: outcome.order.totalCents } } })
        return
      case 'declined':
        setView({ step: 'form' })
        setMessage(outcome.message)
        setRetrySafely(false)
        return
      case 'pending':
        setView({ step: 'pending', order: outcome.order })
        return
      case 'refunded':
        clearActiveHold()
        void queryClient.invalidateQueries({ queryKey: seatKeys.hold(event.id) })
        setView({ step: 'refunded', refunding: outcome.refunding })
        return
      case 'holdGone':
        clearActiveHold()
        void queryClient.invalidateQueries({ queryKey: seatKeys.hold(event.id) })
        setView({ step: 'gone', message: outcome.message })
        return
      case 'inProgress':
        setView({ step: 'form' })
        setMessage(outcome.message, 'info')
        return
      case 'rejected':
        setView({ step: 'form' })
        setMessage(outcome.message)
        return
      case 'unknown':
        // Not known whether it went through. The same card retried is safe, so say that and keep the key.
        setView((v) => (v.step === 'pending' ? v : { step: 'form' }))
        setMessage(outcome.message, 'warning')
        setRetrySafely(true)
    }
    },
    [event.id, queryClient, navigate],
  )

  // The hold running out while the guest is on the form ends the checkout. A payment in flight is the server's to
  // finish, so this does not interrupt one.
  useEffect(() => {
    const timer = setTimeout(
      () => setView((v) => (v.step === 'form' ? { step: 'gone', message: 'Your hold ended and the seats are back on sale.' } : v)),
      Math.max(0, Date.parse(hold.expiresAt) - serverNow()),
    )
    return () => clearTimeout(timer)
  }, [hold.expiresAt])

  // While a payment is pending, ask the server about it. Asking cannot charge anyone.
  const pendingOrder = view.step === 'pending' ? view.order : null
  useEffect(() => {
    if (!pendingOrder) return
    const timer = setInterval(() => void checkOrder(pendingOrder.id, hold.id).then(apply), checkoutTimings.poll)
    return () => clearInterval(timer)
  }, [pendingOrder, hold.id, apply])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problems = validateCard(card)
    setErrors(problems)
    setMessage('')
    if (Object.keys(problems).length > 0) return
    setView({ step: 'paying' })
    apply(await submitPayment(hold.id, card.number))
  }

  const paying = view.step === 'paying'
  const NOTICE_TITLE: Record<Tone, string> = { error: 'The payment did not go through', warning: 'We could not confirm your payment', info: 'Your payment is still in progress', success: 'Done' }

  if (view.step === 'gone') {
    return (
      <div style={eventTheme(event.poster)}>
        <ErrorScreen
          eyebrow="Hold ended"
          title="Your seats are no longer held"
          primary={{ label: 'Choose seats again', to: `/events/${event.id}/seats` }}
          secondary={{ label: 'My tickets', to: '/tickets' }}
        >
          <p>{view.message}</p>
        </ErrorScreen>
      </div>
    )
  }

  if (view.step === 'refunded') {
    return (
      <div style={eventTheme(event.poster)}>
        <ErrorScreen eyebrow="Seats lost" title="Sorry, those seats were taken" primary={{ label: 'Choose other seats', to: `/events/${event.id}/seats` }}>
          <p>
            Someone else got the seats while your payment was going through, so we could not give them to you.{' '}
            {view.refunding ? 'Your money is on its way back to your card.' : 'Your money has been returned to your card.'}
          </p>
        </ErrorScreen>
      </div>
    )
  }

  if (view.step === 'pending') {
    return (
      <div className="page checkout" style={eventTheme(event.poster)}>
        <h1>Confirming your payment</h1>
        <span className="checkout__ring" aria-hidden="true" />
        <p className="checkout__lead" role="status">
          Your payment is taking longer than usual. <strong>Please do not pay again.</strong> Your seats are being kept for you, and this page updates by itself as soon as we hear back.
        </p>
        <p className="checkout__actions">
          <button type="button" className="btn btn--quiet" onClick={() => void checkOrder(view.order.id, hold.id).then(apply)}>
            Check now
          </button>
          <Link to="/tickets">My tickets</Link>
        </p>
        <p className="checkout__reference label">Order {view.order.reference}</p>
      </div>
    )
  }

  const total = formatMoney(hold.totalCents)
  return (
    <div className="page checkout" style={eventTheme(event.poster)}>
      <BackBar to={`/events/${event.id}/seats`}>Change seats</BackBar>
      <h1>Checkout</h1>

      <div className="checkout__layout">
        <form className="checkout__form" onSubmit={(e) => void submit(e)} noValidate aria-label="Contact and card">
          <h2>Contact and card</h2>
          {me && <p className="checkout__email">Your confirmation goes to <strong>{me.email}</strong>.</p>}

          <Field
            label="Card number"
            value={card.number}
            onChange={(e) => setCard((c) => ({ ...c, number: formatCardNumber(e.target.value) }))}
            error={errors.number}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 1234 1234 1234"
            disabled={paying}
          />
          <div className="checkout__pair">
            <Field label="Expiry" value={card.expiry} onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))} error={errors.expiry} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" maxLength={5} disabled={paying} />
            <Field label="Security code" value={card.cvc} onChange={(e) => setCard((c) => ({ ...c, cvc: digitsOnly(e.target.value).slice(0, 4) }))} error={errors.cvc} inputMode="numeric" autoComplete="cc-csc" placeholder="123" disabled={paying} />
          </div>

          <p className="checkout__test">Test mode. No real charge is made.</p>
          <details className="testcards">
            <summary>Use a test card</summary>
            <ul>
              {TEST_CARDS.map((t) => (
                <li key={t.token}>
                  <button type="button" className="testcards__use" onClick={() => setCard({ number: t.number, expiry: '12/34', cvc: '123' })}>
                    <span className="num">{t.number}</span>
                  </button>
                  <span>{t.means}</span>
                </li>
              ))}
            </ul>
          </details>

          {message && (
            <Notice tone={tone} title={NOTICE_TITLE[tone]} compact>
              {message}
            </Notice>
          )}

          <button type="submit" className="btn checkout__pay" disabled={paying}>
            {paying ? 'Paying…' : retrySafely ? `Check and try again, ${total}` : `Pay ${total}`}
          </button>
          <p className="checkout__assure">
            This is the final price. Nothing is added after this step. If your connection drops, you can try again safely and you will not be charged twice.
          </p>
        </form>

        <aside className="checkout__summary" aria-labelledby="summary-heading">
          <HoldClock expiresAt={hold.expiresAt} />
          <h2 id="summary-heading">{event.title}</h2>
          <p className="checkout__when">
            {formatDate(event.startsAt)}, {formatTime(event.startsAt)}
            <br />
            {event.venueName}, {event.city}
          </p>
          <p className="checkout__seats">{describeSeats(hold.seats)}</p>
          <dl className="checkout__totals">
            <div><dt>{hold.seats.length} {hold.seats.length === 1 ? 'ticket' : 'tickets'}</dt><dd className="num">{formatMoney(hold.subtotalCents)}</dd></div>
            <div><dt>Service fee</dt><dd className="num">{formatMoney(hold.feeCents)}</dd></div>
            <div className="checkout__total"><dt>Total</dt><dd className="num">{total}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  )
}
