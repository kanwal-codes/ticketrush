import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { SalesSummary, TierRow } from '../../api/types'
import { NotFound } from '../../app/RouteError'
import { ConsoleSkeleton } from '../../components/PageSkeletons'
import { Notice } from '../../components/Notice'
import { RollingNumber } from '../../components/RollingNumber'
import { useToast } from '../../components/Toast'
import { describeError, type ErrorDescription } from '../../lib/errorCopy'
import { formatMoney } from '../../lib/money'
import { useTitle } from '../../lib/useTitle'
import { cancelEvent, publishEvent, useQueueDepth, useSummary } from './api'
import './console.css'
import './dashboard.css'

export function Dashboard() {
  const id = Number(useParams().id)
  return Number.isInteger(id) && id > 0 ? <Board id={id} /> : <NotFound />
}

type Confirming = 'publish' | 'cancel' | null

function Board({ id }: { id: number }) {
  const summary = useSummary(id)
  const depth = useQueueDepth(id)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Pick<ErrorDescription, 'tone' | 'title' | 'message'> | null>(null)
  useTitle(`${summary.data?.title ?? 'Event'} · Console`)

  if (summary.isPending) return <ConsoleSkeleton />
  // A failed refresh keeps showing what we had; only a first load that fails is a page-level error.
  if (!summary.data) throw summary.error
  const s = summary.data

  async function change(kind: 'publish' | 'cancel') {
    setBusy(true)
    setFailure(null)
    try {
      await (kind === 'publish' ? publishEvent(id) : cancelEvent(id))
      void queryClient.invalidateQueries({ queryKey: ['console'] })
      toast({ tone: 'success', title: kind === 'publish' ? 'Published' : 'Cancelled', message: kind === 'publish' ? 'Guests can see the event now.' : 'The event is off sale and buyers are being refunded.' })
      setConfirming(null)
    } catch (error) {
      setFailure(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const capacity = s.tiers.reduce((n, t) => n + t.total, 0)
  const sold = s.tiers.reduce((n, t) => n + t.sold, 0)

  return (
    <div className="page console dashboard">
      <header className="console__head">
        <div>
          <p className="label">
            <Link to="/console" viewTransition>Console</Link> / <span className={`chip chip--${s.status.toLowerCase()}`}>{STATUS[s.status]}</span>
          </p>
          <h1>{s.title}</h1>
        </div>
        <p className="dashboard__actions">
          {s.status === 'PUBLISHED' && (
            <>
              <Link to={`/console/events/${id}/scan`} className="btn" viewTransition>Door scanner</Link>
              <Link to={`/events/${id}`} className="btn btn--quiet" viewTransition>View as a guest</Link>
            </>
          )}
          {s.status === 'DRAFT' && (
            <>
              <button type="button" className="btn" onClick={() => setConfirming('publish')} disabled={busy}>Publish</button>
              <Link to={`/console/events/${id}/edit`} className="btn btn--quiet" viewTransition>Edit</Link>
            </>
          )}
          {s.status === 'PUBLISHED' && (
            <button type="button" className="btn btn--quiet" onClick={() => setConfirming('cancel')} disabled={busy}>Cancel event</button>
          )}
        </p>
      </header>

      {confirming === 'publish' && (
        <Notice tone="info" title="Publish this event?" actions={<Confirm busy={busy} label="Publish" onYes={() => void change('publish')} onNo={() => setConfirming(null)} />}>
          Guests will see it straight away, and its seats are created. The sale opens at the time you set.
        </Notice>
      )}
      {confirming === 'cancel' && (
        <Notice tone="warning" title="Cancel this event?" actions={<Confirm busy={busy} label="Cancel the event" onYes={() => void change('cancel')} onNo={() => setConfirming(null)} />}>
          Guests will not be able to buy tickets. <strong>Everyone who has already bought is refunded automatically</strong> and their tickets stop working. Anyone already scanned in at the door is not refunded.
        </Notice>
      )}
      {failure && <Notice tone={failure.tone} title={failure.title}>{failure.message}</Notice>}

      <dl className="dashboard__stats">
        <Stat label="Revenue" value={formatMoney(s.revenue.totalCents)} note={`${formatMoney(s.revenue.subtotalCents)} tickets + ${formatMoney(s.revenue.feeCents)} fees`} />
        <Stat label="Sold" value={`${sold.toLocaleString('en-CA')} of ${capacity.toLocaleString('en-CA')}`} note={`${s.revenue.paidOrders.toLocaleString('en-CA')} paid ${s.revenue.paidOrders === 1 ? 'order' : 'orders'}`} />
        {s.status !== 'DRAFT' && (
          <Stat label="In the waiting room" value={depth.data ? depth.data.waiting.toLocaleString('en-CA') : '–'} note={depth.data ? `${depth.data.inside.toLocaleString('en-CA')} inside choosing seats` : 'Checking…'} />
        )}
        <Stat label="At the door" value={`${s.door.checkedIn.toLocaleString('en-CA')} of ${s.door.issued.toLocaleString('en-CA')}`} note="tickets scanned in" />
      </dl>

      <section aria-labelledby="tiers-heading">
        <h2 id="tiers-heading">Seats by section</h2>
        <ul className="dashboard__tiers">
          {s.tiers.map((t) => (
            <Tier key={t.sectionId} tier={t} />
          ))}
        </ul>
        <Orders summary={s} />
      </section>
    </div>
  )
}

const STATUS = { DRAFT: 'Draft', PUBLISHED: 'On sale', CANCELLED: 'Cancelled' } as const

function Confirm({ busy, label, onYes, onNo }: { busy: boolean; label: string; onYes: () => void; onNo: () => void }) {
  return (
    <>
      <button type="button" className="btn" onClick={onYes} disabled={busy}>{busy ? 'One moment…' : label}</button>
      <button type="button" className="btn btn--quiet" onClick={onNo} disabled={busy}>Go back</button>
    </>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="dashboard__stat">
      <dt className="label">{label}</dt>
      <dd>
        <RollingNumber className="dashboard__value num" value={value} />
        <span className="console__meta">{note}</span>
      </dd>
    </div>
  )
}

function Tier({ tier: t }: { tier: TierRow }) {
  const share = (n: number) => (t.total ? n / t.total : 0)
  return (
    <li className="dashboard__tier">
      <div className="dashboard__tierhead">
        <h3>{t.name}</h3>
        <span className="num">{t.priceCents == null ? 'No price yet' : formatMoney(t.priceCents)}</span>
      </div>
      <span className="dashboard__meter" role="img" aria-label={`${t.sold} sold, ${t.held} held, ${t.available} available of ${t.total}`}>
        <span className="dashboard__held" style={{ '--p': share(t.sold + t.held) } as React.CSSProperties} />
        <span className="dashboard__sold" style={{ '--p': share(t.sold) } as React.CSSProperties} />
      </span>
      <p className="dashboard__counts num">
        <span><strong>{t.sold}</strong> sold</span>
        <span><strong>{t.held}</strong> held</span>
        <span><strong>{t.available}</strong> available</span>
      </p>
    </li>
  )
}

function Orders({ summary }: { summary: SalesSummary }) {
  const entries = Object.entries(summary.ordersByStatus)
  if (entries.length === 0) return null
  return (
    <p className="console__meta dashboard__orders">
      Orders: {entries.map(([status, n]) => `${n} ${status.toLowerCase().replace('_', ' ')}`).join(', ')}
    </p>
  )
}
